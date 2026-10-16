'use strict';
const LABELS = {idle:'就绪', thinking:'思考中', working:'执行工具中', juggling:'协作处理中', sweeping:'整理上下文', waiting:'等待你确认', error:'遇到错误', done:'任务完成'};
const PRIORITY = {waiting:0, error:1, working:2, juggling:2, sweeping:2, thinking:3, done:4, idle:5};
function createState({now = Date.now} = {}) {
  const sessions = new Map();
  function updateSession(id, rawState, event, fields = {}) {
    const state = rawState === 'notification' ? 'waiting' : rawState === 'attention' ? 'done' : rawState;
    const previous = sessions.get(id) || {id, title:'', cwd:'', tool:'', output:'', state:'idle'};
    const next = {...previous, state: LABELS[state] ? state : 'idle', updatedAt:now()};
    if (fields.cwd) next.cwd = String(fields.cwd).slice(0,1024);
    if (fields.sessionTitle) next.title = String(fields.sessionTitle).slice(0,160);
    if ('toolName' in fields) next.tool = String(fields.toolName || '').slice(0,100);
    if (fields.assistantLastOutput) next.output = String(fields.assistantLastOutput).slice(0,2400);
    if (event === 'TaskStarted' || event === 'UserPromptSubmit') {next.tool=''; next.output='';}
    if (['Stop','TurnAborted','ApiError'].includes(event)) next.tool='';
    next.status = event === 'TurnAborted' ? '已中断' : LABELS[next.state];
    sessions.set(id,next);
    if (sessions.size > 64) {
      const oldest = [...sessions.values()].sort((a,b)=>a.updatedAt-b.updatedAt)[0];
      sessions.delete(oldest.id);
    }
  }
  function seedSession(s) {
    updateSession(s.id,s.state,'Restore',{cwd:s.cwd,sessionTitle:s.sessionTitle});
    sessions.get(s.id).updatedAt = s.updatedAt;
  }
  function setSessionMeta(id,fields) {
    const s=sessions.get(id); if (!s) return;
    if (fields.sessionTitle) s.title=String(fields.sessionTitle).slice(0,160);
  }
  function snapshot() {
    const list=[...sessions.values()].filter(s=>now()-s.updatedAt<=60*60*1000)
      .sort((a,b)=>PRIORITY[a.state]-PRIORITY[b.state] || b.updatedAt-a.updatedAt);
    const current=list[0] || null;
    let state=current?.state || 'idle';
    if (state==='done' && now()-current.updatedAt>15000) state='idle';
    return {state, status:LABELS[state], count:list.length, current, sessions:list};
  }
  return {updateSession,seedSession,setSessionMeta,setContextUsage(){},snapshot};
}
module.exports={createState,LABELS};
