// Native Windows/macOS/Linux Node processes. No container or virtualization required.
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const erp=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const configurator=resolve(process.env.REPISAS_CONFIGURATOR_DIR || resolve(erp,'../configurator'));
const publicUrl=process.env.LOCAL_PUBLIC_URL || 'http://127.0.0.1:5176';
const children=[];
function start(cwd,args,env={}) {
  const child=spawn(process.execPath,args,{cwd,env:{...process.env,...env},stdio:'inherit',windowsHide:true});
  children.push(child);child.on('error',error=>{console.error(error.message);stop();});
  child.on('exit',code=>{if(code) {process.exitCode=code;stop();}});
}
function stop(){for(const child of children) if(!child.killed) child.kill();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
// El configurador ya compilado (pnpm build) se sirve con vite preview; el ERP lo proxea en /embed y /configurador.
start(resolve(configurator,'apps/web'),['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','3000','--strictPort']);
start(erp,['scripts/local-dev/server.mjs'],{LOCAL_PUBLIC_URL:publicUrl});
start(erp,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5176','--strictPort'],{VITE_NETLIFY_FUNCTIONS_PROXY:'http://127.0.0.1:8899',VITE_REPISAS_3D_PROXY:'http://127.0.0.1:3000'});
console.log(`ERP: ${publicUrl}/admin`);
