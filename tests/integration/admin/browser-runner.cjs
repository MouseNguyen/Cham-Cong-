/* eslint-disable @typescript-eslint/no-require-imports -- Task-owned synthetic browser runner. */
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const root = process.cwd(), origin = 'http://127.0.0.1:46217';
const red = process.env.PAYSLIP_DB_TEST_MODE === 'Red';
const source = process.env.PAYSLIP_TEST_DATABASE_URL;
const target = new URL(source || 'http://invalid');
if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '55432' || target.pathname !== '/payslip_w5_02a_synthetic' || target.username !== 'payslip_app') throw Error('OWNED_ADMIN_DATABASE_REQUIRED');
const inherited = ['SystemRoot','SYSTEMROOT','WINDIR','PATH','Path','PATHEXT','TEMP','TMP','COMSPEC','ComSpec','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMDATA','OS','NUMBER_OF_PROCESSORS'];
const env = Object.fromEntries(inherited.filter(k => process.env[k] !== undefined).map(k => [k,process.env[k]]));
const inputTemplate = JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/payroll/full-time-basic.json'),'utf8')).input;
const sourceHash = crypto.createHash('sha256');
for (const name of fs.readdirSync(path.join(root,'packages/payroll-domain/src')).filter(n => n.endsWith('.ts')).sort()) {
 sourceHash.update(name); sourceHash.update(fs.readFileSync(path.join(root,'packages/payroll-domain/src',name)));
}
const artifactHash = sourceHash.digest('hex');
inputTemplate.calculator.sourceArtifactSha256 = artifactHash;
inputTemplate.ruleBinding.status = 'released';
Object.assign(env, {
 PAYSLIP_TEST_DATABASE_URL: source, PAYSLIP_AUTH_DATABASE_URL: source,
 PAYSLIP_ORGANIZATION_ID: crypto.randomUUID(), PAYSLIP_PROJECT_ROOT: root,
 PAYSLIP_ADMIN_ORIGIN: origin, PAYSLIP_ADMIN_TEST_ORIGIN: origin, PAYSLIP_DB_TASK_ID: 'PAY-W5-02a',
 PAYSLIP_DB_TEST_MODE: red ? 'Red' : 'Green',
 PAYSLIP_CALCULATOR_CONFIG: JSON.stringify({id:'payroll-domain',version:'0.1.0',canonicalizationVersion:'1',artifactHash,inputTemplate,periodStart:'2026-07-31T17:00:00.000Z',periodEnd:'2026-08-31T17:00:00.000Z'}),
 PLAYWRIGHT_BROWSERS_PATH: path.join(root,'.tools/playwright'), NEXT_TELEMETRY_DISABLED:'1'
});
let server, tail = '', stopped = false;
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const clean = text => String(text).replace(/postgres(?:ql)?:\/\/[^\s"']+/g,'[redacted-connection]');
function freePort() {
 return new Promise((resolve,reject) => {
  const socket=net.connect({host:'127.0.0.1',port:46217});
  socket.once('connect',()=>{socket.destroy();reject(Error('ADMIN_PORT_ALREADY_OWNED'));});
  socket.once('error',e=>e.code==='ECONNREFUSED'?resolve():reject(e));
 });
}
function stop() {
 if(server && server.exitCode===null && !stopped) {
  cp.spawnSync('taskkill.exe',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:15000});stopped=true;
 }
}
process.once('SIGINT',()=>{stop();process.exit(130);});
process.once('SIGTERM',()=>{stop();process.exit(143);});
function runTests(args) {
 return new Promise((resolve,reject)=>{
  const child=cp.spawn(process.execPath,[path.join(root,'node_modules/@playwright/test/cli.js'),'test',...args],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',b=>{stdout+=b.toString();if(!red)process.stdout.write(clean(b));});
  child.stderr.on('data',b=>{stderr+=b.toString();if(!red)process.stderr.write(clean(b));});
  const timer=setTimeout(()=>{cp.spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});reject(Error('ADMIN_TEST_TIMEOUT'));},600000);
  child.once('error',e=>{clearTimeout(timer);reject(e);});
  child.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
 });
}
(async()=>{
 try {
  for(const dir of [root,path.join(root,'apps/web')])for(const name of ['.env','.env.local','.env.development','.env.development.local','.env.production','.env.production.local'])if(fs.existsSync(path.join(dir,name)))throw Error('UNAPPROVED_ENV_FILE_PRESENT');
  await freePort();
  server=cp.spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev',path.join(root,'apps/web'),'--hostname','127.0.0.1','--port','46217'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [server.stdout,server.stderr])stream.on('data',b=>{tail=(tail+clean(b)).slice(-10000);});
  server.once('error',()=>{tail+=' ADMIN_SERVER_START_FAILED';});
  const deadline=Date.now()+90000;let ready=false;
  while(Date.now()<deadline){if(server.exitCode!==null)throw Error('ADMIN_SERVER_EXITED');try{const response=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(2000)});if(response.ok){ready=true;break;}}catch{}await pause(250);}
  if(!ready)throw Error('ADMIN_HEALTH_TIMEOUT');
  const result=await runTests(red?['tests/e2e/admin-flows.spec.ts','--grep','authenticated dashboard exposes payroll work queue','--reporter=json']:['tests/e2e/admin-flows.spec.ts','tests/e2e/accessibility.spec.ts','--reporter=line']);
  if(red){
   let report;try{report=JSON.parse(result.stdout);}catch{throw Error('ADMIN_RED_REPORT_INVALID');}
   const specs=[];const visit=s=>{specs.push(...(s.specs||[]));for(const child of s.suites||[])visit(child);};for(const suite of report.suites||[])visit(suite);
   const actual=specs.flatMap(s=>s.tests||[]).flatMap(t=>t.results||[]);
   const failure=actual[0];
   if(report.errors?.length||actual.length!==1||failure?.status!=='failed'||!failure.errors?.some(e=>e.message?.includes('Việc cần làm hôm nay')&&e.message?.includes('toBeVisible')))throw Error('ADMIN_BEHAVIOR_RED_NOT_PROVEN');
   fs.writeFileSync(path.join(root,'ops/evidence/PAY-W5-02a-red.json'),JSON.stringify({layer:'behavior_specific_red',status:'passed',expected:'authenticated dashboard work-queue heading',actual:'missing heading on baseline dashboard',test:specs[0].title,all_current_migrations_applied:true},null,2)+'\n');
   console.log('ADMIN_BEHAVIOR_RED_OBSERVED');
  }else {
   if(result.code!==0)throw Error('ADMIN_BROWSER_TEST_FAILED');
   const http=cp.spawnSync(process.execPath,[path.join(root,'node_modules/vitest/vitest.mjs'),'run','tests/integration/admin/http.spec.ts','--maxWorkers=1','--no-file-parallelism'],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024});
   if(http.stdout)process.stdout.write(clean(http.stdout));if(http.stderr)process.stderr.write(clean(http.stderr));
   if(http.error||http.status!==0)throw Error('ADMIN_HTTP_TEST_FAILED');
  }
 }catch(error){process.exitCode=1;console.error(clean(error.message));console.error(tail);}
 finally {
  stop();let absent=false;for(let i=0;i<100;i++){try{await freePort();absent=true;break;}catch{await pause(50);}}
  if(!absent)process.exitCode=1;
  console.log(JSON.stringify({browser_cleanup:absent?'passed':'failed',port:46217,owned_pid:server?.pid??null}));
 }
})();
