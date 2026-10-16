'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-pet-treasury-'));
process.env.DSH_HOME=path.join(fixture,'dsh');process.env.DSH_PET_DATA=path.join(fixture,'pet');
const {app,BrowserWindow}=require('electron');
app.setPath('userData',path.join(fixture,'electron'));
const {createPetApp}=require(process.env.DSH_PET_TEST_APP || '../main');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let i=0;i<100;i++){if(await check())return;await delay(50);}throw Error(label);}
function request(route,value){
 const runtime=JSON.parse(fs.readFileSync(path.join(process.env.DSH_PET_DATA,'runtime.json')));
 return new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:runtime.port,path:route,method:value===undefined?'GET':'POST',
   headers:{'x-dsh-pet-token':runtime.token,'Content-Type':'application/json'}},res=>{
   let text='';res.on('data',b=>text+=b);res.on('end',()=>{try{assert.equal(res.statusCode,200,`${route}: ${text}`);resolve(JSON.parse(text));}catch(e){reject(e);}});
  });req.on('error',reject);req.end(value===undefined?'':JSON.stringify(value));
 });
}
(async()=>{
 await app.whenReady();const instance=createPetApp();
 try{
  await instance.start();const {pet}=instance.getWindows();
  await until(()=>!pet.webContents.isLoading(),'pet load');
  const ignores=[],nativeIgnore=pet.setIgnoreMouseEvents.bind(pet);
  pet.setIgnoreMouseEvents=(ignore,options)=>{ignores.push(ignore);return nativeIgnore(ignore,options);};
  pet.webContents.sendInputEvent({type:'mouseMove',x:3,y:3});
  await until(()=>ignores.at(-1)===true,'transparent margin passes desktop clicks through');
  const wallet=(currency,balance)=>({currency,balance});
  await request('/companion/balance',{status:'ready',normalWallets:[wallet('CNY','9999')],bonusWallets:[wallet('CNY','88.5'),wallet('USD','0E-16')],updatedAt:Date.now()});
  await until(()=>pet.webContents.executeJavaScript(`document.getElementById('treasure-chest')?.dataset.level==='4'`),'total available balance determines treasure, including purchased credit');
  const pouchTarget=await pet.webContents.executeJavaScript(`(()=>{const p=document.getElementById('treasure-pouch');if(!p)return null;const r=p.getBoundingClientRect();return{tag:p.tagName,width:r.width,height:r.height,level:p.dataset.level};})()`);
  assert(pouchTarget,'gifted credit has its own native clickable pouch');
  assert.equal(pouchTarget.tag,'BUTTON');
  assert(pouchTarget.width>=44&&pouchTarget.height>=44,'pouch is a usable native click target');
  assert.equal(pouchTarget.level,'3','pouch follows gift 88.5 rather than total 10087.5');
  const health=await request('/companion');
  assert.equal(health.balance.status,'ready');
  assert.equal(health.balance.stale,false);
  assert(!('balances' in health.balance),'integration health must not expose wallet amounts');
  const projection=await pet.webContents.executeJavaScript(`(async()=>{const s=await window.pet.snapshot();return s.deepSeekBalance;})()`);
  assert.equal(projection.balances[0].grantedBalance,'88.5');
  assert.equal(projection.balances[1].grantedBalance,'0');
  const point=await pet.webContents.executeJavaScript(`(()=>{
   const c=document.getElementById('treasure-chest'),r=c.getBoundingClientRect();
   for(let y=Math.ceil(r.top+12);y<r.bottom-8;y+=3)for(let x=Math.ceil(r.left+8);x<r.right-8;x+=3)
    if(document.elementFromPoint(x,y)?.closest('#treasure-chest'))return{x,y};
   return null;
  })()`);
  assert(point,'chest must expose a real clickable part beside the pet');
  pet.webContents.sendInputEvent({type:'mouseMove',...point});
  await until(()=>ignores.at(-1)===false,'exposed chest receives native clicks again');
  pet.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
  pet.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});
  await until(()=>pet.webContents.executeJavaScript('window.DeepSeekTreasure.isOpen()'),'real chest click');
  assert(!instance.getWindows().panel,'chest click must not open session panel');
  const detail=await pet.webContents.executeJavaScript(`(()=>{const p=document.getElementById('treasure-panel'),r=p.getBoundingClientRect();return{text:p.innerText,left:r.left,right:r.right,top:r.top,bottom:r.bottom,w:innerWidth,h:innerHeight};})()`);
  assert(detail.text.includes('10087.50')&&detail.text.includes('88.50')&&detail.text.includes('9999.00'),'exact total, gifted and purchased amounts stay separate');
  const amounts=await pet.webContents.executeJavaScript(`(()=>{const p=document.getElementById('treasure-panel');return{total:p.querySelector('.treasure-total-amount')?.textContent,gift:p.querySelector('.treasure-gifted')?.textContent,purchased:p.querySelector('.treasure-purchased')?.textContent};})()`);
  assert.equal(amounts.total,'¥10087.50','main amount is the total, not the gifted portion');
  assert(amounts.gift.includes('赠送额度')&&amounts.gift.includes('88.50'));
  assert(amounts.purchased.includes('充值额度')&&amounts.purchased.includes('9999.00'));
  assert(detail.left>=0&&detail.right<=detail.w&&detail.top>=0&&detail.bottom<=detail.h,'popup fits native frame');
  assert.equal(await pet.webContents.executeJavaScript(`document.getElementById('treasure-panel').dataset.view`),'chest');
  async function nativeClick(selector){
   const previous=await pet.webContents.executeJavaScript(`({open:window.DeepSeekTreasure.isOpen(),view:document.getElementById('treasure-panel').dataset.view})`);
   const nextView=selector==='#treasure-pouch'?'pouch':'chest';
   const nextOpen=!(previous.open&&previous.view===nextView);
   const target=await pet.webContents.executeJavaScript(`(()=>{const c=document.querySelector(${JSON.stringify(selector)});if(!c)return null;const r=c.getBoundingClientRect();for(let y=Math.ceil(r.top+4);y<r.bottom-4;y+=3)for(let x=Math.ceil(r.left+4);x<r.right-4;x+=3)if(document.elementFromPoint(x,y)?.closest(${JSON.stringify(selector)}))return{x,y};return null;})()`);
   assert(target,selector+' remains exposed for a native click');
   pet.webContents.sendInputEvent({type:'mouseMove',...target});
   await until(()=>ignores.at(-1)===false,'wallet target receives native clicks instead of desktop passthrough');
   pet.webContents.sendInputEvent({type:'mouseDown',...target,button:'left',clickCount:1});
   pet.webContents.sendInputEvent({type:'mouseUp',...target,button:'left',clickCount:1});
   await until(()=>pet.webContents.executeJavaScript(`window.DeepSeekTreasure.isOpen()===${nextOpen}&&document.getElementById('treasure-panel').dataset.view===${JSON.stringify(nextView)}`),'native wallet click applies before the next action');
  }
  await nativeClick('#treasure-pouch');
  await until(()=>pet.webContents.executeJavaScript(`document.getElementById('treasure-panel').dataset.view==='pouch'&&!document.getElementById('treasure-panel').hidden`),'real pouch click switches directly from chest');
  assert(!instance.getWindows().panel,'pouch click must not open session panel');
  const pouchDetail=await pet.webContents.executeJavaScript(`(()=>{const p=document.getElementById('treasure-panel');return{title:p.querySelector('h2').textContent,amounts:[...p.querySelectorAll('.treasure-pouch-amount')].map(e=>e.textContent),totals:p.querySelectorAll('.treasure-total-amount').length,text:p.innerText,chest:document.getElementById('treasure-chest').getAttribute('aria-expanded'),pouch:document.getElementById('treasure-pouch').getAttribute('aria-expanded')};})()`);
  assert.equal(pouchDetail.title,'DeepSeek 赔偿小荷包');
  assert.deepEqual(pouchDetail.amounts,['¥88.50','$0.00'],'pouch shows each granted wallet only');
  assert.equal(pouchDetail.totals,0,'pouch does not present purchased or total credit as its main amount');
  assert(pouchDetail.text.includes('赠送账户余额（含平台补偿）')&&pouchDetail.text.includes('已包含在小金库总余额中'),'pouch explains the existing credit is included, not additional money');
  assert.equal(pouchDetail.chest,'false');assert.equal(pouchDetail.pouch,'true');
  await nativeClick('#treasure-chest');
  await until(()=>pet.webContents.executeJavaScript(`document.getElementById('treasure-panel').dataset.view==='chest'`),'native chest click switches directly back');
  assert.equal(await pet.webContents.executeJavaScript(`document.querySelector('.treasure-total-amount').textContent`),'¥10087.50','opening pouch never adds gift a second time');
  await nativeClick('#treasure-pouch');
  pet.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
  pet.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await until(()=>pet.webContents.executeJavaScript(`!window.DeepSeekTreasure.isOpen()&&document.activeElement.id==='treasure-pouch'`),'Escape closes and returns focus to pouch opener');
  await nativeClick('#treasure-pouch');
  await pet.webContents.executeJavaScript(`window.dispatchEvent(new Event('blur'));true;`);
  assert.equal(await pet.webContents.executeJavaScript('window.DeepSeekTreasure.isOpen()'),false,'window blur closes the pouch');
  await nativeClick('#treasure-pouch');
  await pet.webContents.executeJavaScript(`document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));true;`);
  assert.equal(await pet.webContents.executeJavaScript('window.DeepSeekTreasure.isOpen()'),false,'outside pointer closes the pouch');
  await pet.webContents.executeJavaScript('window.DeepSeekTreasure.open();true;');
  const before=await request('/companion/balance');
  await pet.webContents.executeJavaScript(`document.getElementById('treasure-refresh').click();true;`);
  await until(async()=>((await request('/companion/balance')).refreshVersion>before.refreshVersion),'refresh reaches Host');
  for(const scenario of [
   {paid:'5',gift:'0',total:'5.00',level:'1'},
   {paid:'5',gift:'5',total:'10.00',level:'2'},
   {paid:'9.9999999999999999',gift:'0',total:'9.9999999999999999',level:'1'},
   {paid:'49.9999999999999999',gift:'0',total:'49.9999999999999999',level:'2'},
   {paid:'50',gift:'0',total:'50.00',level:'3'},
   {paid:'199.9999999999999999',gift:'0',total:'199.9999999999999999',level:'3'},
   {paid:'200',gift:'0',total:'200.00',level:'4'},
   {paid:'50',gift:'-5',total:'45.00',level:'2'},
   {paid:'1',gift:'-1',total:'0.00',level:'0'},
  ]){
   await request('/companion/balance',{status:'ready',normalWallets:[wallet('CNY',scenario.paid)],bonusWallets:[wallet('CNY',scenario.gift)],updatedAt:Date.now()});
   await until(()=>pet.webContents.executeJavaScript(`document.querySelector('.treasure-total-amount')?.textContent===${JSON.stringify('¥'+scenario.total)}`),'total precision renders');
   assert.equal(await pet.webContents.executeJavaScript(`document.getElementById('treasure-chest').dataset.level`),scenario.level,JSON.stringify(scenario));
  }
  await request('/companion/balance',{status:'ready',normalWallets:[wallet('CNY','7'),wallet('USD','7')],bonusWallets:[],updatedAt:Date.now()});
  await until(()=>pet.webContents.executeJavaScript(`document.querySelectorAll('.treasure-total-amount').length===2`),'separate currency rows render');
  assert.equal(await pet.webContents.executeJavaScript(`document.getElementById('treasure-chest').dataset.level`),'1','CNY and USD are never added together for treasure level');
  for(const scenario of [
   {paid:'300',gift:'0',pouch:'0',chest:'4'},
   {paid:'250',gift:'50',pouch:'3',chest:'4'},
   {paid:'0',gift:'300',pouch:'4',chest:'4'},
   {paid:'0',gift:'9.9999999999999999',pouch:'1',chest:'1'},
  ]){
   await request('/companion/balance',{status:'ready',normalWallets:[wallet('CNY',scenario.paid)],bonusWallets:[wallet('CNY',scenario.gift)],updatedAt:Date.now()});
   await until(()=>pet.webContents.executeJavaScript(`(async()=>{const s=await window.pet.snapshot();return s.deepSeekBalance.balances[0]?.grantedBalance===${JSON.stringify(scenario.gift)};})()`),'gift projection arrives');
   await until(()=>pet.webContents.executeJavaScript(`document.getElementById('treasure-pouch').dataset.level===${JSON.stringify(scenario.pouch)}&&document.getElementById('treasure-chest').dataset.level===${JSON.stringify(scenario.chest)}`),'independent gift and total visuals');
  }
  await request('/companion/balance',{status:'ready',normalWallets:[wallet('CNY','0'),wallet('USD','0')],bonusWallets:[wallet('CNY','7'),wallet('USD','7')],updatedAt:Date.now()});
  await pet.webContents.executeJavaScript('window.DeepSeekTreasure.openPouch();true;');
  await until(()=>pet.webContents.executeJavaScript(`document.querySelectorAll('.treasure-pouch-amount').length===2`),'separate pouch currencies render');
  assert.equal(await pet.webContents.executeJavaScript(`document.getElementById('treasure-pouch').dataset.level`),'1','gift currencies are never combined into 14');
  assert.deepEqual(await pet.webContents.executeJavaScript(`[...document.querySelectorAll('.treasure-pouch-amount')].map(e=>e.textContent)`),['¥7.00','$7.00']);
  for(const lang of ['en','ja','zh']){
   await pet.webContents.executeJavaScript(`window.DeepSeekTreasure.update({lang:${JSON.stringify(lang)}});true;`);
   assert(await pet.webContents.executeJavaScript(`document.getElementById('treasure-title').textContent.length>0&&document.querySelector('.treasure-hint').textContent.length>0`),'pouch has translated title and explanation');
  }
  await request('/companion/balance',{status:'unconfigured'});
  await until(()=>pet.webContents.executeJavaScript(`document.getElementById('treasure-chest').dataset.status==='unconfigured'`),'logout clears UI');
  assert.deepEqual(await pet.webContents.executeJavaScript(`(async()=>{return(await window.pet.snapshot()).deepSeekBalance.balances})()`),[]);
  assert.equal(await pet.webContents.executeJavaScript(`document.getElementById('treasure-pouch').dataset.level`),'0','logout clears pouch gift');
  assert.equal(await pet.webContents.executeJavaScript(`document.querySelectorAll('.treasure-pouch-amount').length`),0,'logout removes old pouch amounts');
  await request('/companion/balance',{status:'ready',normalWallets:[wallet('CNY','25')],bonusWallets:[wallet('CNY','288.5')],updatedAt:Date.now()});
  await until(()=>pet.webContents.executeJavaScript(`document.getElementById('treasure-chest').dataset.level==='4'`),'preview data');
  await pet.webContents.executeJavaScript('window.DeepSeekTreasure.close();true;');
  const output=path.resolve(__dirname,'../dist');fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'treasure-preview.png'),(await pet.webContents.capturePage()).toPNG());
  await pet.webContents.executeJavaScript('window.DeepSeekTreasure.open();true;');
  fs.writeFileSync(path.join(output,'treasure-detail-preview.png'),(await pet.webContents.capturePage()).toPNG());
  await request('/companion',{action:'detach'});
  assert.deepEqual(await pet.webContents.executeJavaScript(`(async()=>{return(await window.pet.snapshot()).deepSeekBalance.balances})()`),[]);
  await until(()=>pet.webContents.executeJavaScript(`document.getElementById('treasure-pouch').dataset.status==='unconfigured'`),'detached account reaches both wallet views');
  assert.equal(await pet.webContents.executeJavaScript(`document.getElementById('treasure-pouch').dataset.level`),'0','detach clears pouch independently');
  await pet.webContents.executeJavaScript(`window.DeepSeekTreasure.update({eligible:false});true;`);
  assert(await pet.webContents.executeJavaScript(`document.getElementById('treasure-pouch').hidden&&document.getElementById('treasure-chest').hidden&&!window.DeepSeekTreasure.isOpen()`),'eligibility hides both entrances and closes detail');
  console.log('treasury native: independent total chest and gifted pouch, real native clicks, view switching, precision, currencies, focus, pass-through, refresh, logout, detach and layout passed');
 }finally{await instance.stop();for(const win of BrowserWindow.getAllWindows())win.destroy();app.quit();}
})().catch(error=>{console.error(error);app.exit(1);});
setTimeout(()=>app.exit(1),30000).unref();
