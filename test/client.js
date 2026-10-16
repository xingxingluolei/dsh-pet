'use strict';
const assert=require('assert'),{Readable}=require('stream');
(async()=>{
 const {createClientController}=await import('../integrations/companion/client.mjs');
 const {readCommand}=await import('../integrations/companion/host.mjs');
 const commands=[];let hidden=false,refresh;
 const client=createClientController({setInterval:function(fn){assert.equal(this,undefined);refresh=fn;return 1;},clearInterval:function(){assert.equal(this,undefined);},request:async(method,input)=>{if(input){commands.push(input.action);if(input.action==='toggle')hidden=!hidden;}return {ok:true,hidden};}});
 await client.start();await Promise.all([client.toggle(),client.toggle(),client.toggle()]);
 assert.equal(client.getSnapshot().hidden,true);assert.deepEqual(commands,['attach','toggle','toggle','toggle']);
 await refresh();await client.dispose();assert.equal(commands.at(-1),'detach');
 const read=value=>readCommand(Readable.from([Buffer.from(JSON.stringify(value))]));
 await assert.rejects(read({action:'background'}),TypeError);
 await assert.rejects(read(null),TypeError);await assert.rejects(read([]),TypeError);
 assert.deepEqual(await read({action:'attach'}),{action:'attach'});
 let release;const slow=new Promise(resolve=>release=resolve);let responseHidden=false;
 const race=createClientController({setInterval:fn=>{refresh=fn;return 1;},clearInterval:()=>{},request:async(method,input)=>{
  if(method==='GET')return slow;if(input.action==='toggle')responseHidden=!responseHidden;return {ok:true,hidden:responseHidden};
 }});
 await race.start();const polling=refresh();await race.toggle();release({ok:true,hidden:false});await polling;
 assert.equal(race.getSnapshot().hidden,true,'stale GET cannot undo newer toggle');await race.dispose();
 let online=false;
 const recovery=createClientController({setInterval:fn=>{refresh=fn;return 1;},clearInterval:()=>{},request:async(method)=>method==='POST'||online?{ok:true,hidden:false}:{ok:false,error:'桌宠尚未运行'}});
 await recovery.start();await refresh();assert.equal(recovery.getSnapshot().error,'桌宠尚未运行');
 online=true;await refresh();assert.equal(recovery.getSnapshot().error,'','reconnected status clears stale error tooltip');await recovery.dispose();
 console.log('client: serialized mutations, stale read suppression, native timers and removed background action passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
