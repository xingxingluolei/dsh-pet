'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-pet-native-'));
process.env.DSH_HOME=path.join(fixture,'dsh');process.env.DSH_PET_DATA=path.join(fixture,'pet');
const {app,BrowserWindow}=require('electron');
app.setPath('userData',path.join(fixture,'electron'));
const {createPetApp}=require(process.env.DSH_PET_TEST_APP || '../main');
const lines=o=>JSON.stringify(o)+'\n';
const sessionDir=path.join(process.env.DSH_HOME,'sessions','--test--','native');fs.mkdirSync(sessionDir,{recursive:true});
const log=path.join(sessionDir,'session.v4.jsonl');
fs.writeFileSync(log,lines({type:'session',version:4,id:'native',cwd:'/tmp/native',createdAt:Date.now(),delegationDepth:0})+lines({type:'session/title',data:{title:'独立 dsh 桌宠验证'}}));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,message){const deadline=Date.now()+10000;while(Date.now()<deadline){if(await fn())return;await delay(100);}throw Error(message);}
(async()=>{
 await app.whenReady();const instance=createPetApp();
 try {
  await instance.start();let {pet}=instance.getWindows();
  await until(()=>pet.isVisible() && !pet.webContents.isLoading(),'pet ready');
  assert.equal(BrowserWindow.getAllWindows().length,1);
  pet.webContents.sendInputEvent({type:'mouseMove',x:130,y:120});await delay(400);
  assert.equal(BrowserWindow.getAllWindows().length,1,'hover must not create any window');
  pet.webContents.sendInputEvent({type:'mouseDown',x:130,y:120,button:'left',clickCount:1});
  pet.webContents.sendInputEvent({type:'mouseUp',x:130,y:120,button:'left',clickCount:1});
  await until(()=>instance.getWindows().panel?.isVisible(),'click opens session panel');
  const {panel}=instance.getWindows();assert.equal(BrowserWindow.getAllWindows().length,2);
  assert.equal(path.basename(panel.webContents.getURL()),'panel.html');
  assert((await panel.webContents.executeJavaScript('document.body.innerText')).includes('独立 dsh 桌宠验证'));
  const emit=(type,data={})=>{fs.appendFileSync(log,lines({type,seq:Date.now(),time:Date.now(),data}));instance.getWatcher().tick();};
  emit('turn/start');emit('tool/call',{name:'bash'});
  await until(()=>pet.webContents.executeJavaScript('document.getElementById("sprite").src.endsWith("working.gif")'),'working animation');
  emit('approval/asked',{id:'ap'});
  await until(()=>pet.webContents.executeJavaScript('document.getElementById("status").dataset.state === "waiting"'),'waiting animation');
  emit('turn/end',{reason:{kind:'interrupted'}});assert.equal(instance.state.snapshot().state,'idle');
  emit('turn/start');emit('assistant/message',{message:{content:[{type:'text',text:'验证完成 <img onerror="bad">'}]}});emit('turn/end',{reason:{kind:'completed'}});
  await until(()=>pet.webContents.executeJavaScript('document.getElementById("sprite").src.endsWith("happy.gif")'),'completion animation');
  assert.equal(await panel.webContents.executeJavaScript('document.querySelectorAll("img").length'),0,'output rendered as text');
  instance.command('hide');assert(!pet.isVisible());assert(!panel.isVisible());
  instance.command('attach');assert(!pet.isVisible(),'attach retains manual hide');
  instance.command('show');assert(pet.isVisible());assert(!panel.isVisible(),'show does not resurrect closed panel');
  if(process.platform==='darwin') {
    app.hide();await until(()=>app.isHidden(),'native app hidden');
    instance.command('show');await until(()=>!app.isHidden(),'show must unhide the native macOS app');
    app.hide();await until(()=>app.isHidden(),'native app hidden again');
    instance.command('attach');await until(()=>!app.isHidden(),'attach must unhide when user preference is visible');
  }
  emit('turn/start');emit('tool/call',{name:'fs_read'});
  await until(()=>pet.webContents.executeJavaScript('document.getElementById("status").dataset.state === "working"'),'final working state');
  fs.mkdirSync(path.resolve(__dirname,'../dist'),{recursive:true});
  const png=await pet.webContents.capturePage();fs.writeFileSync(path.resolve(__dirname,'../dist/native-pet.png'),png.toPNG());
  assert(BrowserWindow.getAllWindows().every(w=>!w.webContents.getURL().includes('companion.html')));
  console.log('native: standalone boot, real hover/click, status animations, explicit panel, output escaping and manual hide/show passed');
 } finally {await instance.stop();for(const w of BrowserWindow.getAllWindows())w.destroy();fs.rmSync(fixture,{recursive:true,force:true});app.quit();}
})().catch(error=>{console.error(error);app.exit(1);});
