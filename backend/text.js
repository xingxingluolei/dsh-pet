'use strict';
const SECRET = /\b(api[_-]?key|authorization|bearer|password|passwd|secret|token|private[_-]?key)\b|sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}/i;
function promptTitle(prompt) {
  if(typeof prompt!=='string') return null;
  const line=prompt.split(/\r?\n/).map(s=>s.trim()).find(Boolean);
  if(!line || SECRET.test(line)) return null;
  return line.length>40 ? line.slice(0,40)+'…' : line;
}
module.exports={promptTitle};
