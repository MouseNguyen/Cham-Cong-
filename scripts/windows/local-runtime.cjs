/* eslint-disable @typescript-eslint/no-require-imports -- Windows process entrypoint. */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const net = require('node:net');
const { Pool } = require('pg');
const root = path.resolve(__dirname, '../..');
const stateFile = path.join(root, '.tmp/PAY-W7-02a/local-runtime.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function identity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  const script = '$p=Get-CimInstance Win32_Process -Filter "ProcessId = '+pid+'"; if($p){[ordered]@{pid=[int]$p.ProcessId;created=$p.CreationDate.ToUniversalTime().ToString("o");executable=$p.ExecutablePath} | ConvertTo-Json -Compress}';
  const r=cp.spawnSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true,timeout:10000});
  if(r.status!==0)throw Error('PROCESS_IDENTITY_UNAVAILABLE');
  return r.stdout.trim()?JSON.parse(r.stdout):null;
}
function matches(expected) {
  const actual=identity(expected.pid);
  return !!actual && actual.created===expected.created && actual.executable===expected.executable;
}
function writeState(state) { fs.mkdirSync(path.dirname(stateFile),{recursive:true});fs.writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n'); }
function readState() { if(!fs.existsSync(stateFile))return null;const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));if(state.root!==root||state.schema!==1)throw Error('RUNTIME_STATE_INVALID');return state; }
async function portFree(port) {
  return new Promise((resolve,reject)=>{const socket=net.connect({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();reject(Error('PORT_ALREADY_OWNED:'+port));});socket.once('error',error=>error.code==='ECONNREFUSED'?resolve():reject(error));});
}
function listenerOwner(port) {
  const script='$c=Get-NetTCPConnection -State Listen -LocalPort '+port+' -ErrorAction SilentlyContinue; foreach($x in $c){$p=Get-CimInstance Win32_Process -Filter ("ProcessId = "+$x.OwningProcess);[ordered]@{port=$x.LocalPort;pid=$x.OwningProcess;executable=$p.ExecutablePath;command=$p.CommandLine}|ConvertTo-Json -Compress}';
  const r=cp.spawnSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true,timeout:10000});
  return r.stdout.replace(/postgres(?:ql)?:\/\/[^\s"']+/g,'[redacted-connection]').replace(/(--?(?:password|token|secret)[= ]+)[^\s]+/gi,'$1[redacted]').trim();
}
function syntheticUrl(value) {
  if(!value)throw Error('EXPLICIT_SYNTHETIC_DATABASE_REQUIRED');
  const u=new URL(value);
  if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!=='55432'||!['/payslip_w3_02_synthetic','/payslip_w3_03_synthetic'].includes(u.pathname))throw Error('UNAPPROVED_DATABASE_TARGET');
  return value;
}
function baseEnv() {
  const allowed=['SystemRoot','SYSTEMROOT','WINDIR','PATH','Path','PATHEXT','TEMP','TMP','COMSPEC','ComSpec','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMDATA','OS','NUMBER_OF_PROCESSORS'];
  return Object.fromEntries(allowed.filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
}
async function health(state=readState()) {
  if(!state||state.status==='stopped')return {ready:false,status:'stopped',services:[]};
  const services=await Promise.all(state.children.map(async child=>{try{const response=await fetch(child.health,{signal:AbortSignal.timeout(2000)});return {name:child.name,ready:response.ok};}catch{return {name:child.name,ready:false};}}));
  return {ready:services.length>0&&services.every(s=>s.ready),status:state.status,services,production:'not_run'};
}
async function stopOwned(state,stopSupervisor=false) {
  if(!state)return {status:'stopped',listeners_absent:true};
  for(const child of [...state.children].reverse()) {
    if(matches(child.identity)) {
      const result=cp.spawnSync('taskkill.exe',['/PID',String(child.identity.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:15000});
      if(result.status!==0&&matches(child.identity))throw Error('OWNED_PROCESS_STOP_FAILED');
    }
  }
  for(const child of state.children){let free=false;for(let i=0;i<40;i++){try{await portFree(child.port);free=true;break;}catch{await sleep(100);}}if(!free)throw Error('LISTENER_REMAINS:'+child.port);}
  state.status='stopped';state.cleanup={listeners_absent:true,as_of:new Date().toISOString()};writeState(state);
  if(stopSupervisor&&state.supervisor.pid!==process.pid&&matches(state.supervisor))cp.spawnSync('taskkill.exe',['/PID',String(state.supervisor.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:15000});
  return {status:'stopped',listeners_absent:true,ports:state.children.map(x=>x.port)};
}
async function start(scope='all') {
  if(!['all','admin','attendance'].includes(scope))throw Error('INVALID_RUNTIME_SCOPE');
  const previous=readState();if(previous&&previous.status!=='stopped'&&matches(previous.supervisor))throw Error('OWNED_RUNTIME_ALREADY_RUNNING');
  const selected=[...(scope!=='attendance'?[{name:'admin',port:46217,health:'http://127.0.0.1:46217/api/health',args:[path.join(root,'node_modules/next/dist/bin/next'),'start',path.join(root,'apps/web'),'--hostname','127.0.0.1','--port','46217']}]:[]),...(scope!=='admin'?[{name:'attendance',port:46218,health:'http://127.0.0.1:46218/health',args:['--experimental-transform-types',path.join(root,'apps/attendance-ingress/src/main.ts')]}]:[])];
  for(const service of selected){try{await portFree(service.port);}catch{process.stderr.write(listenerOwner(service.port)+'\n');throw Error('PORT_ALREADY_OWNED:'+service.port);}}
  for(const dir of [root,path.join(root,'apps/web')])for(const file of ['.env','.env.local','.env.production','.env.production.local'])if(fs.existsSync(path.join(dir,file)))throw Error('UNAPPROVED_ENV_FILE_PRESENT');
  const appUrl=scope==='attendance'?null:syntheticUrl(process.env.PAYSLIP_AUTH_DATABASE_URL);
  const ingressUrl=scope==='admin'?null:syntheticUrl(process.env.PAYSLIP_INGRESS_DATABASE_URL);
  const db=new Pool({connectionString:appUrl||ingressUrl,max:1,connectionTimeoutMillis:3000});try{await db.query('SELECT 1');}finally{await db.end();}
  const state={schema:1,root,status:'starting',supervisor:identity(process.pid),children:[],started_at:new Date().toISOString()};
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;try{console.log(JSON.stringify(await stopOwned(state)));}catch(e){console.error(e.message);process.exitCode=1;}finally{process.exit(process.exitCode||0);}};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  process.stdin.setEncoding('utf8');process.stdin.on('data',text=>{if(text.trim()==='stop')void stop();});
  try {
    writeState(state);
    for(const service of selected){
      const env={...baseEnv(),NEXT_TELEMETRY_DISABLED:'1',PAYSLIP_PROJECT_ROOT:root,PAYSLIP_ADMIN_ORIGIN:'http://127.0.0.1:46217',PAYSLIP_ORGANIZATION_ID:process.env.PAYSLIP_ORGANIZATION_ID||''};
      if(service.name==='admin')env.PAYSLIP_AUTH_DATABASE_URL=appUrl;else env.PAYSLIP_INGRESS_DATABASE_URL=ingressUrl;
      const child=cp.spawn(process.execPath,service.args,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
      child.on('error',()=>{process.exitCode=1;void stop();});
      child.on('exit',()=>{if(!stopping){process.exitCode=1;void stop();}});
      for(const stream of [child.stdout,child.stderr])stream.on('data',()=>{});
      const id=identity(child.pid);if(!id)throw Error('CHILD_EXITED_DURING_START');
      state.children.push({...service,identity:id});writeState(state);
    }
    const deadline=Date.now()+60000;while(Date.now()<deadline){if((await health(state)).ready){state.status='ready';writeState(state);console.log(JSON.stringify({status:'ready',ports:selected.map(s=>s.port)}));return state;}await sleep(250);}
    throw Error('HEALTH_TIMEOUT');
  }catch(error){process.exitCode=1;console.error(error.message);await stop();}
}
module.exports={start,health,stopOwned,portFree,syntheticUrl,readState};
if(require.main===module){const mode=process.argv[2];(async()=>{if(mode==='start'){const at=process.argv.indexOf('--scope');await start(at>=0?process.argv[at+1]:'all');}else if(mode==='health'){const result=await health();console.log(JSON.stringify(result));if(!result.ready)process.exitCode=1;}else if(mode==='stop')console.log(JSON.stringify(await stopOwned(readState(),true)));else throw Error('RUNTIME_ACTION_REQUIRED');})().catch(error=>{console.error(error.message);process.exitCode=1;});}
