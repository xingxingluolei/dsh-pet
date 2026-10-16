'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {createDshWatch}=require('../backend/dsh-watch');const {createState}=require('../backend/state');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-pet-restart-'));
const sessionsDir=path.join(dir,'sessions'),p=path.join(sessionsDir,'--fixture--','id','session.v4.jsonl');fs.mkdirSync(path.dirname(p),{recursive:true});
const line=o=>JSON.stringify(o)+'\n',header=line({type:'session',version:4,id:'id',cwd:'/tmp/restart',delegationDepth:0});
try {
 fs.writeFileSync(p,header+line({type:'turn/start'})+line({type:'tool/call',data:{name:'bash'}}));
 let state=createState(),watch=createDshWatch({core:state,sessionsDir});watch.tick();
 fs.appendFileSync(p,line({type:'step/start'}));watch.tick();assert.equal(state.snapshot().state,'working','restart restores tool phase');
 fs.appendFileSync(p,line({type:'approval/asked',data:{id:'orphan'}}));watch.tick();
 fs.appendFileSync(p,line({type:'turn/end',data:{reason:{kind:'completed'}}}));watch.tick();assert.equal(state.snapshot().state,'done');
 state=createState();watch=createDshWatch({core:state,sessionsDir});watch.tick();assert.equal(state.snapshot().state,'idle','ended turn clears orphan approval on restart');
 fs.writeFileSync(p,header+line({type:'turn/start'})+line({type:'compaction/start'}));
 state=createState();watch=createDshWatch({core:state,sessionsDir});watch.tick();assert.equal(state.snapshot().state,'sweeping','restart restores compaction');
 console.log('restart: tool phase, terminated approval and compaction state passed');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
const resumed=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-pet-resumed-'));
try {
 const file=path.join(resumed,'--fixture--','resumed','session.v4.jsonl');fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,header+line({type:'turn/start'})+line({type:'approval/asked',data:{id:'old'}})+line({type:'turn/start'})+line({type:'tool/call',data:{name:'bash'}}));
 const state=createState();createDshWatch({core:state,sessionsDir:resumed}).tick();
 assert.equal(state.snapshot().state,'working','new turn discards stale approval on restore');
 console.log('restart: new turn discards stale approval passed');
}finally{fs.rmSync(resumed,{recursive:true,force:true});}
