'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('pet',{
  snapshot:()=>ipcRenderer.invoke('pet:snapshot'),
  refreshDeepSeekBalance:()=>ipcRenderer.invoke('pet:balance-refresh'),
  setIgnoreMouse:ignore=>ipcRenderer.send('pet:mouse-ignore',ignore),
  onState:listener=>{const callback=(_event,value)=>listener(value);ipcRenderer.on('pet:state',callback);return()=>ipcRenderer.removeListener('pet:state',callback);},
  startDrag:()=>ipcRenderer.send('pet:drag-start'),
  endDrag:()=>ipcRenderer.send('pet:drag-end'),
  cancelDrag:()=>ipcRenderer.send('pet:drag-cancel'),
  menu:()=>ipcRenderer.send('pet:menu'),
  closePanel:()=>ipcRenderer.send('pet:close-panel'),
  openDsh:()=>ipcRenderer.send('pet:open-dsh'),
});
