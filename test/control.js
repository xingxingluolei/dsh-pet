'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http');
const {startControl}=require('../backend/control');
const {createBridge,desktopLaunchEnv}=require('../backend/bridge');
const {createConfig}=require('../backend/config');
const {createDeepSeekBalance}=require('../backend/deepseek-balance');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-pet-control-'));
 const config=createConfig(dir),balance=createDeepSeekBalance();let attached=false;
 const server=await startControl({dataDir:dir,deepSeekBalance:balance,getStatus:()=>({hidden:config.get().hidden,attached,state:'working',count:1}),command:action=>{
   if(action==='attach')attached=true;if(action==='detach')attached=false;
   if(action==='toggle')config.save({hidden:!config.get().hidden});
   if(action==='show'||action==='hide')config.save({hidden:action==='hide'});
 }});
 try {
  const runtimePath=path.join(dir,'runtime.json');const bridge=createBridge({runtimePath,launch:()=>{throw Error('already running');}});
  const request=(method,body,token=server.runtime.token,extra={},endpoint='/companion')=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.runtime.port,path:endpoint,method,headers:{'x-dsh-pet-token':token,'Content-Type':'application/json',...extra}},res=>{let txt='';res.on('data',b=>txt+=b);res.on('end',()=>resolve({code:res.statusCode,value:JSON.parse(txt)}));});req.on('error',reject);req.end(body);
  });
  assert.equal((await request('GET',null,'bad')).code,401);
  assert.equal((await request('GET',null,server.runtime.token,{Origin:'http://localhost'})).code,401);
  const money=(method,data,headers={})=>request(method,data===undefined?undefined:typeof data==='string'?data:JSON.stringify(data),server.runtime.token,headers,'/companion/balance');
  assert.deepStrictEqual((await money('GET')).value,{ok:true,refreshVersion:0},'Host reads expose refresh requests without account amounts');
  const wallet={status:'ready',normalWallets:[{currency:'CNY',balance:'3'}],bonusWallets:[{currency:'CNY',balance:'50.001'}]};
  assert.equal((await request('POST',JSON.stringify(wallet),'bad',{},'/companion/balance')).code,401);
  for(const headers of [{Origin:'https://evil.example'},{Referer:'http://localhost/'},{Host:'evil.example'},{'Sec-Fetch-Site':'same-origin'}]) {
    assert.equal((await money('GET',undefined,headers)).code,401,'browser requests cannot reach account control');
    assert.equal((await money('POST',wallet,headers)).code,401,'browser requests cannot overwrite account control');
  }
  assert.equal((await money('POST',wallet,{'Content-Type':'text/plain'})).code,415);
  assert.equal((await money('POST',wallet)).code,200);
  assert.equal(balance.snapshot().balances[0].grantedBalance,'50.001');
  assert.deepStrictEqual((await money('GET')).value,{ok:true,refreshVersion:0});
  balance.requestRefresh();
  assert.equal((await money('GET')).value.refreshVersion,1);
  for(const body of ['{','x'.repeat(8192),{...wallet,token:'never-echo-private'},{...wallet,bonusWallets:[{currency:'EUR',balance:'8'}]}]) {
    const response=await money('POST',body);
    assert([400,413].includes(response.code));
    assert(!JSON.stringify(response.value).includes('never-echo-private'));
  }
  assert.equal(balance.snapshot().balances[0].grantedBalance,'50.001','invalid payloads retain the safe account projection');
  assert.equal((await money('DELETE')).code,405);
  assert.equal((await bridge.balanceStatus()).refreshVersion,1);
  assert.equal((await bridge.updateBalance({status:'unconfigured'})).ok,true);
  assert.deepStrictEqual(balance.snapshot().balances,[],'Host logout clears account balances');
  assert.equal((await request('POST','{}')).code,400);
  assert.equal((await request('POST','{')).code,400);
  assert.equal((await request('POST',JSON.stringify({action:'background'}))).code,400);
  assert.equal((await request('POST','x'.repeat(8192))).code,413);
  assert.equal((await request('POST','{}',server.runtime.token,{'Content-Type':'text/plain'})).code,415);
  assert.equal((await bridge.command({action:'attach'})).attached,true);
  assert.equal((await bridge.command({action:'toggle'})).hidden,true);
  assert.equal((await bridge.command({action:'attach'})).hidden,true,'attach retains manual hide');
  assert.equal(createConfig(dir).get().hidden,true,'hide persisted in own data directory');
  assert.equal((await bridge.command({action:'show'})).hidden,false);
  const status=await bridge.status();assert(!('sessions' in status));assert(!('token' in status));assert(!('output' in status));
  assert.equal(fs.statSync(runtimePath).mode & 0o777,0o600);
  assert.equal(desktopLaunchEnv({ELECTRON_RUN_AS_NODE:'1',PATH:'a'}).ELECTRON_RUN_AS_NODE,undefined);
  assert.equal(desktopLaunchEnv({PATH:'a'}).PATH,'a');
 } finally {await server.close();fs.rmSync(dir,{recursive:true,force:true});}
 console.log('control: authentication, limits, standalone bridge, own persistence, safe launch and summary privacy, safe account projection and browser fences passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
