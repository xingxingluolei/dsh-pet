'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const p of [path.join(root,'main.js'),path.join(root,'preload.js'),...files(path.join(root,'backend')),...files(path.join(root,'renderer')),...files(path.join(root,'integrations'))]){
 if(!/\.(js|mjs|cjs|html|css)$/.test(p))continue;
 const s=fs.readFileSync(p,'utf8');
 assert(!/\.octopus|\.claude|\.codex|LLMPET_APP|LLMPET\/|llmpet-companion|codex-watch|claude-watch|hookinstall|companion\.html|visibilitychange|mouseenter|mouseover/.test(s),'decoupling boundary: '+path.relative(root,p));
 for(const match of s.matchAll(/(?:require\(|from\s+)['"]([^'"]+)['"]/g)){
  if(!match[1].startsWith('.'))continue;
  assert(path.resolve(path.dirname(p),match[1]).startsWith(root+path.sep),'outside dependency in '+p);
 }
}
const pkg=require('../package.json');assert.deepEqual(Object.keys(pkg.devDependencies),['electron']);
for(const name of ['idle','sleeping','thinking','working','juggling','sweeping','waiting','error','happy'])assert(fs.existsSync(path.join(root,'assets/pet',name+'.gif')));
console.log('boundaries: independent imports/data/plugin, 9 included animations, no other agent hooks or automatic compact window passed');
