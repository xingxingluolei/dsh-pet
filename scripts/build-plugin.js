#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');
async function main(){
  const {createClientController,installClient}=await import('../integrations/companion/client.mjs');
  const out=path.join(root,'dist/dsh-pet-companion');fs.mkdirSync(path.join(out,'lib'),{recursive:true});
  const metadata={name:'dsh-pet-companion',version:require('../package.json').version,description:'Standalone desktop pet for DeepSeek Harness',license:'MIT',type:'module',main:'lib/index.mjs',exports:{'.':'./lib/index.mjs','./client':'./lib/client.js','./package.json':'./package.json'},dsh:{bundle:{patch:'./cordis.patch.yml'},client:{inject:['@deepseek-ai/dsh-client-ui-sidebar','@deepseek-ai/dsh-client-ui-renderer'],platform:'web'}},files:['lib','cordis.patch.yml','README.md','LICENSE']};
  fs.writeFileSync(path.join(out,'package.json'),JSON.stringify(metadata,null,2)+'\n');
  fs.copyFileSync(path.join(root,'backend/bridge.js'),path.join(out,'lib/bridge.cjs'));
  fs.writeFileSync(path.join(out,'lib/index.mjs'),fs.readFileSync(path.join(root,'integrations/companion/host.mjs'),'utf8').replace('../../backend/bridge.js','./bridge.cjs'));
  fs.writeFileSync(path.join(out,'lib/client.js'),`window.__ModuleLoader__.load({id:'dsh-pet-companion',factory:(require)=>{\n${createClientController.toString()}\n${installClient.toString()}\nreturn {inject:['slots'],apply(ctx){ctx.effect(()=>installClient(ctx,require('react'),createClientController));}};\n}});\n`);
  fs.writeFileSync(path.join(out,'cordis.patch.yml'),'- insert:\n    - id: dsh-pet\n      name: dsh-pet-companion\n');
  fs.copyFileSync(path.join(root,'README.md'),path.join(out,'README.md'));fs.copyFileSync(path.join(root,'LICENSE'),path.join(out,'LICENSE'));
  execFileSync('npm',['pack','--ignore-scripts','--cache','/tmp/dsh-pet-npm-cache','--pack-destination',path.dirname(out)],{cwd:out,stdio:'inherit'});
}
main().catch(e=>{console.error(e);process.exitCode=1;});
