'use strict';
const {app,BrowserWindow,ipcMain,screen,Menu,Tray,nativeImage}=require('electron');
const path=require('path');
const {execFile}=require('child_process');
const {createDshWatch}=require('./backend/dsh-watch');
const {createState}=require('./backend/state');
const {createConfig,dataDir}=require('./backend/config');
const {startControl}=require('./backend/control');
const {createDeepSeekBalance}=require('./backend/deepseek-balance');
const SIZE={width:360,height:340};
function createPetApp() {
  const config=createConfig(), state=createState();
  const deepSeekBalance=createDeepSeekBalance({onChange:publish});
  let pet=null,panel=null,tray=null,watch=null,control=null,timer=null,drag=null,attached=false;
  const safe=w=>w && !w.isDestroyed();
  function status() {
    const s=state.snapshot(),balance=deepSeekBalance.snapshot();
    return {attached,hidden:config.get().hidden,state:s.state,count:s.count,
      balance:{status:balance.status,updatedAt:balance.updatedAt,stale:balance.stale}};
  }
  function publish() {
    const value=snapshot();
    for(const win of [pet,panel]) if(safe(win) && !win.webContents.isLoading()) win.webContents.send('pet:state',value);
  }
  function snapshot() {return {...state.snapshot(),deepSeekBalance:deepSeekBalance.snapshot()};}
  function position(point,size=SIZE) {
    const area=screen.getDisplayNearestPoint(point).workArea;
    return {x:Math.round(Math.max(area.x,Math.min(point.x,area.x+area.width-size.width))),y:Math.round(Math.max(area.y,Math.min(point.y,area.y+area.height-size.height)))};
  }
  function showPet() {
    // Launch Services -j / Command-H hides the application, independently of
    // BrowserWindow visibility. Showing the pet must release both layers.
    if(process.platform==='darwin' && app.isHidden()) app.show();
    if(safe(pet)) pet.showInactive();
  }
  function showHide(hidden) {
    config.save({hidden});
    if(hidden) {stopDrag(false);pet?.hide();panel?.hide();}
    else showPet();
  }
  function command(action) {
    if(action==='attach') {attached=true;if(!config.get().hidden) showPet();}
    if(action==='detach') {attached=false;deepSeekBalance.update({status:'unconfigured'});}
    if(action==='show') showHide(false);
    if(action==='hide') showHide(true);
    if(action==='toggle') showHide(!config.get().hidden);
  }
  function openDsh() {
    const target=process.env.DSH_DESKTOP_APP || '/Applications/DeepSeek Harness.app';
    if(process.platform==='darwin') {
      const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
      execFile('/usr/bin/open',['-a',target],{env},error=>{if(error) console.error('无法打开 DeepSeek Harness:',error.message);});
    }
  }
  function togglePanel() {
    if(config.get().hidden) return;
    if(safe(panel) && panel.isVisible()) {panel.hide();return;}
    if(!safe(panel)) {
      panel=new BrowserWindow({width:360,height:440,show:false,frame:false,resizable:false,transparent:true,skipTaskbar:true,alwaysOnTop:true,
        webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
      panel.loadFile(path.join(__dirname,'renderer/panel.html'));
      panel.webContents.on('did-finish-load',()=>{publish();if(!config.get().hidden) panel.show();});
      panel.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      panel.webContents.on('will-navigate',e=>e.preventDefault());
    }
    const p=pet.getBounds(),area=screen.getDisplayNearestPoint({x:p.x,y:p.y}).workArea;
    const preferred={x:p.x+SIZE.width/2-180,y:p.y>=area.y+450 ? p.y-450 : p.y+SIZE.height+10};
    const pos=position(preferred,{width:360,height:440});panel.setPosition(pos.x,pos.y);
    if(!panel.webContents.isLoading()) {publish();panel.show();}
  }
  function stopDrag(click) {
    if(!drag) return;
    const d=drag;drag=null;clearInterval(d.timer);
    if(safe(pet)) {
      const p=screen.getCursorScreenPoint();
      const distance=Math.hypot(p.x-d.cursor.x,p.y-d.cursor.y);
      const pos=position({x:d.origin.x+p.x-d.cursor.x,y:d.origin.y+p.y-d.cursor.y});
      if(d.moved || distance>5) {pet.setPosition(pos.x,pos.y);config.save({position:pos});}
      else if(click) togglePanel();
    }
  }
  function startDrag() {
    if(drag || !safe(pet)) return;
    pet.setIgnoreMouseEvents(false);
    const origin=pet.getBounds(),cursor=screen.getCursorScreenPoint();
    const d={origin,cursor,moved:false,timer:null};drag=d;
    d.timer=setInterval(()=>{
      if(!safe(pet)) {stopDrag(false);return;}
      const p=screen.getCursorScreenPoint();
      if(Math.hypot(p.x-cursor.x,p.y-cursor.y)>5) d.moved=true;
      if(d.moved) {pet.setPosition(Math.round(origin.x+p.x-cursor.x),Math.round(origin.y+p.y-cursor.y));if(safe(panel)) panel.hide();}
    },16);
  }
  function menu() {
    Menu.buildFromTemplate([
      {label:config.get().hidden?'显示桌宠':'隐藏桌宠',click:()=>command('toggle')},
      {label:'打开 DeepSeek Harness',click:openDsh},
      {type:'separator'},{label:'退出 DSH Pet',click:()=>app.quit()},
    ]).popup({window:pet});
  }
  async function start() {
    app.setName('DSH Pet');app.dock?.hide();
    const area=screen.getPrimaryDisplay().workArea;
    const pos=position(config.get().position || {x:area.x+area.width-SIZE.width-24,y:area.y+area.height-SIZE.height-24});
    pet=new BrowserWindow({...SIZE,...pos,frame:false,transparent:true,show:false,resizable:false,skipTaskbar:true,alwaysOnTop:true,hasShadow:false,
      webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    pet.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
    pet.loadFile(path.join(__dirname,'renderer/pet.html'));
    pet.webContents.on('did-finish-load',()=>{publish();if(!config.get().hidden) showPet();});
    pet.webContents.setWindowOpenHandler(()=>({action:'deny'}));pet.webContents.on('will-navigate',e=>e.preventDefault());
    pet.on('blur',()=>stopDrag(false));
    watch=createDshWatch({core:state});watch.start();
    const icon=nativeImage.createFromPath(path.join(__dirname,'assets/tray.png')).resize({width:18,height:18});
    tray=new Tray(icon);tray.setToolTip('DSH Pet · dsh 任务状态');tray.on('click',()=>command('toggle'));tray.on('right-click',menu);
    const fromPet=event=>safe(pet) && event.sender===pet.webContents;
    const fromUs=event=>fromPet(event) || (safe(panel) && event.sender===panel.webContents);
    ipcMain.handle('pet:snapshot',event=>fromUs(event) ? snapshot() : null);
    ipcMain.handle('pet:balance-refresh',event=>fromPet(event) ? deepSeekBalance.requestRefresh() : null);
    ipcMain.on('pet:drag-start',event=>{if(fromPet(event)) startDrag();});
    ipcMain.on('pet:drag-end',event=>{if(fromPet(event)) stopDrag(true);});
    ipcMain.on('pet:drag-cancel',event=>{if(fromPet(event)) stopDrag(false);});
    ipcMain.on('pet:mouse-ignore',(event,ignore)=>{
      if(fromPet(event) && typeof ignore==='boolean' && !drag) pet.setIgnoreMouseEvents(ignore,{forward:true});
    });
    ipcMain.on('pet:menu',event=>{if(fromPet(event)) menu();});
    ipcMain.on('pet:close-panel',event=>{if(fromUs(event)) panel?.hide();});
    ipcMain.on('pet:open-dsh',event=>{if(fromUs(event)) openDsh();});
    control=await startControl({dataDir,getStatus:status,command,deepSeekBalance});
    timer=setInterval(publish,750);
  }
  async function stop() {clearInterval(timer);stopDrag(false);watch?.stop();deepSeekBalance.stop();tray?.destroy();await control?.close();}
  return {start,stop,status,command,state,togglePanel,getWindows:()=>({pet,panel}),getWatcher:()=>watch};
}
function run() {
  if(!app.requestSingleInstanceLock()) {app.quit();return;}
  app.setPath('userData',path.join(dataDir,'electron'));
  const instance=createPetApp();
  app.on('second-instance',()=>instance.command('show'));
  app.on('activate',()=>instance.command('show'));
  app.on('window-all-closed',()=>{});
  app.on('before-quit',()=>{instance.stop().catch(console.error);});
  app.whenReady().then(()=>instance.start()).catch(error=>{console.error(error);app.quit();});
}
if(require.main===module) run();
module.exports={createPetApp};
