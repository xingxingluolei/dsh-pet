'use strict';
const sprite=document.getElementById('sprite'),status=document.getElementById('status'),label=document.getElementById('label'),count=document.getElementById('count');
const ANIMATIONS={idle:'sleeping',thinking:'thinking',working:'working',juggling:'juggling',sweeping:'sweeping',waiting:'waiting',error:'error',done:'happy'};
let animation='';
let lastBalance=null;
function updateTreasure(){window.DeepSeekTreasure?.update({eligible:true,balance:lastBalance,petRect:sprite.getBoundingClientRect(),lang:'zh'});}
function render(value){
  lastBalance=value.deepSeekBalance || null;
  const next=ANIMATIONS[value.state] || 'idle';
  if(next!==animation){animation=next;sprite.src=`../assets/pet/${next}.gif`;}
  status.dataset.state=value.state;label.textContent=value.status;
  count.textContent=value.count>1?`${value.count} 个会话`:'';
  requestAnimationFrame(updateTreasure);
}
window.pet.onState(render);window.pet.snapshot().then(value=>value && render(value));
const button=document.getElementById('pet');
let dragging=false,mouseIgnoring=false;
button.addEventListener('pointerdown',event=>{if(event.button!==0)return;dragging=true;button.setPointerCapture(event.pointerId);window.pet.startDrag();});
button.addEventListener('pointerup',event=>{if(event.button!==0)return;dragging=false;window.pet.endDrag();if(button.hasPointerCapture(event.pointerId))button.releasePointerCapture(event.pointerId);});
button.addEventListener('pointercancel',()=>{dragging=false;window.pet.cancelDrag();});
button.addEventListener('contextmenu',event=>{event.preventDefault();window.pet.menu();});
button.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();window.pet.startDrag();window.pet.endDrag();}});
window.addEventListener('resize',()=>requestAnimationFrame(updateTreasure));
window.addEventListener('blur',()=>{dragging=false;window.pet.cancelDrag();});
window.addEventListener('mousemove',event=>{
  if(dragging)return;
  const target=document.elementFromPoint(event.clientX,event.clientY);
  const ignore=!target?.closest('#pet,#treasure-chest,#treasure-pouch,#treasure-panel');
  if(ignore===mouseIgnoring)return;
  mouseIgnoring=ignore;window.pet.setIgnoreMouse(ignore);
});
