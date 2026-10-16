'use strict';
const http=require('http'), fs=require('fs'), path=require('path'), crypto=require('crypto');
const ACTIONS=['attach','detach','show','hide','toggle'];
async function startControl({dataDir,getStatus,command,deepSeekBalance,ports=[41430,41431,41432,41433,41434]}) {
  const token=crypto.randomBytes(32).toString('hex');
  const runtimePath=path.join(dataDir,'runtime.json');
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','x-dsh-pet-server':'dsh-pet'});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    // Host capability only; this listener is never a browser-facing endpoint.
    const localHost=`127.0.0.1:${server.address()?.port}`;
    if(req.headers['x-dsh-pet-token']!==token || req.headers.origin || req.headers.referer
      || req.headers.host!==localHost || Object.keys(req.headers).some(key=>key.startsWith('sec-fetch-'))) {
      json(res,401,{ok:false,error:'unauthorized'});return;
    }
    const balanceRoute=req.url==='/companion/balance';
    if(req.url!=='/companion' && !balanceRoute) {json(res,404,{ok:false,error:'not found'});return;}
    if(balanceRoute && !deepSeekBalance) {json(res,503,{ok:false,error:'balance unavailable'});return;}
    if(req.method==='GET') {json(res,200,{ok:true,...(balanceRoute?deepSeekBalance.refreshStatus():getStatus())});return;}
    if(req.method!=='POST') {json(res,405,{ok:false,error:'method not allowed'});return;}
    if(String(req.headers['content-type']).split(';')[0].trim()!=='application/json') {json(res,415,{ok:false,error:'application/json required'});return;}
    try {
      let size=0; const chunks=[];
      for await(const chunk of req) {
        size+=chunk.length;
        if(size<=4096) chunks.push(chunk);
      }
      if(size>4096) {json(res,413,{ok:false,error:'payload too large'});return;}
      const value=JSON.parse(Buffer.concat(chunks).toString());
      if(balanceRoute) {
        try {deepSeekBalance.update(value);}
        catch {json(res,400,{ok:false,error:'invalid balance payload'});return;}
        json(res,200,{ok:true});return;
      }
      if(!value || Array.isArray(value) || !ACTIONS.includes(value.action)) {json(res,400,{ok:false,error:'invalid command'});return;}
      command(value.action);
      json(res,200,{ok:true,...getStatus()});
    } catch {if(!res.headersSent) json(res,400,{ok:false,error:'invalid JSON'});}
  });
  server.requestTimeout=5000; server.headersTimeout=5000;
  let port;
  for(const candidate of ports) {
    try {
      await new Promise((resolve,reject)=>{
        const fail=e=>{server.off('listening',ready);reject(e);};
        const ready=()=>{server.off('error',fail);resolve();};
        server.once('error',fail);server.once('listening',ready);server.listen(candidate,'127.0.0.1');
      });
      port=server.address().port;break;
    } catch(e) {if(e.code!=='EADDRINUSE') throw e;}
  }
  if(port===undefined) throw Error('DSH Pet control ports are occupied');
  fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
  const runtime={app:'dsh-pet',port,token,pid:process.pid};
  fs.writeFileSync(runtimePath,JSON.stringify(runtime)+'\n',{mode:0o600});
  function close() {
    try {if(JSON.parse(fs.readFileSync(runtimePath,'utf8')).token===token) fs.unlinkSync(runtimePath);} catch {}
    return new Promise(resolve=>server.close(resolve));
  }
  return {runtime,close};
}
module.exports={startControl};
