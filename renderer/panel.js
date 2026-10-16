'use strict';
const list=document.getElementById('sessions');
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;}
let previous='';
function render(value){
  const encoded=JSON.stringify(value.sessions);if(encoded===previous)return;previous=encoded;
  const fragment=document.createDocumentFragment();
  for(const s of value.sessions){
    const row=node('article'),title=node('h2','',s.title || s.cwd.split('/').filter(Boolean).pop() || 'dsh 会话');
    const meta=node('div','meta'),badge=node('span','state',s.status);badge.dataset.state=s.state;
    const project=node('span','',s.cwd.split('/').filter(Boolean).pop() || '');project.title=s.cwd;
    meta.append(badge,project);row.append(title,meta);
    if(s.tool)row.append(node('p','tool',`当前工具 · ${s.tool}`));
    if(s.output)row.append(node('p','output',s.output));
    fragment.append(row);
  }
  if(!value.sessions.length)fragment.append(node('p','empty','还没有活跃的 dsh 会话'));
  const scroll=list.scrollTop;list.replaceChildren(fragment);list.scrollTop=scroll;
}
window.pet.onState(render);window.pet.snapshot().then(value=>value && render(value));
document.getElementById('close').onclick=()=>window.pet.closePanel();
document.getElementById('open').onclick=()=>window.pet.openDsh();
document.addEventListener('keydown',event=>{if(event.key==='Escape')window.pet.closePanel();});
