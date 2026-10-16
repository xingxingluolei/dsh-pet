'use strict';
const fs=require('fs'), os=require('os'), path=require('path');
const dataDir=path.resolve(process.env.DSH_PET_DATA || path.join(os.homedir(),'.dsh-pet'));
function createConfig(dir=dataDir) {
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file=path.join(dir,'config.json');
  let value={hidden:false,position:null};
  try {
    const saved=JSON.parse(fs.readFileSync(file,'utf8'));
    value.hidden=saved.hidden===true;
    if(Number.isFinite(saved.position?.x) && Number.isFinite(saved.position?.y)) value.position={x:Math.round(saved.position.x),y:Math.round(saved.position.y)};
  } catch {}
  function save(patch) {
    value={...value,...patch};
    fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});
    fs.renameSync(file+'.tmp',file);
    return value;
  }
  return {get:()=>({...value}),save};
}
module.exports={dataDir,createConfig};
