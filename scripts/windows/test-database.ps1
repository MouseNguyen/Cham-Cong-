param([ValidateSet('Red','Green')][string]$Mode='Green', [ValidateSet('PAY-W2-01','PAY-W6-02a','PAY-W2-02','PAY-W2-03','PAY-W3-01b','PAY-W3-02a','PAY-W3-02b','PAY-W7-02a','PAY-W3-03','PAY-W4-01','PAY-W5-02a','PAY-W6-01')][string]$TaskId='PAY-W2-01', [switch]$Browser)
$ErrorActionPreference='Stop'
$env:PAYSLIP_DB_TEST_MODE=$Mode
$env:PAYSLIP_DB_TASK_ID=$TaskId
$env:PAYSLIP_AUTH_BROWSER=if($Browser){'1'}else{'0'}
try {
@'
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const {Pool}=require('pg');
const root=process.cwd(),mode=process.env.PAYSLIP_DB_TEST_MODE,taskId=process.env.PAYSLIP_DB_TASK_ID;
const bin=path.join(root,'.tools/postgresql/18.6/pgsql/bin');
const runId=mode.toLowerCase()+'-'+crypto.randomUUID();
const cluster=path.join(root,'.tmp',taskId,'cluster',runId);
const log=path.join(root,'.tmp',taskId,runId+'.log');
const ownerPassword=crypto.randomBytes(32).toString('hex'),appPassword=crypto.randomBytes(32).toString('hex'),ingressPassword=crypto.randomBytes(32).toString('hex');
const kioskTask=['PAY-W3-02a','PAY-W3-02b','PAY-W7-02a'].includes(taskId);
const database=taskId==='PAY-W6-01'?'payslip_w6_01_synthetic':taskId==='PAY-W5-02a'?'payslip_w5_02a_synthetic':taskId==='PAY-W4-01'?'payslip_w4_01_synthetic':taskId==='PAY-W3-03'?'payslip_w3_03_synthetic':kioskTask?'payslip_w3_02_synthetic':taskId==='PAY-W3-01b'?'payslip_w3_01b_synthetic':taskId==='PAY-W2-03'?'payslip_w2_03_synthetic':taskId==='PAY-W2-02'?'payslip_w2_02_auth_synthetic':'payslip_w2_01_synthetic';
const ownerConnection=new URL('postgresql://127.0.0.1:55432/'+database); ownerConnection.username='payslip_owner'; ownerConnection.password=ownerPassword; const ownerUrl=ownerConnection.href;
const appConnection=new URL('postgresql://127.0.0.1:55432/'+database); appConnection.username='payslip_app'; appConnection.password=appPassword; const appUrl=appConnection.href;
const ingressConnection=new URL(ownerUrl); ingressConnection.username='payslip_ingress';ingressConnection.password=ingressPassword;const ingressUrl=ingressConnection.href;
const env={...process.env,DATABASE_URL:ownerUrl,PAYSLIP_TEST_DATABASE_URL:appUrl,PAYSLIP_TEST_INGRESS_DATABASE_URL:ingressUrl,PRISMA_HIDE_UPDATE_MESSAGE:'1'};
const redact=text=>String(text).split(ownerPassword).join('[redacted]').split(appPassword).join('[redacted]').split(ingressPassword).join('[redacted]');
function run(exe,args,input,allowFail=false,childEnv=env){
 const r=cp.spawnSync(exe,args,{cwd:root,env:childEnv,encoding:'utf8',input,timeout:args.includes('tests/integration/admin/browser-runner.cjs')?900000:args.some(a=>a.endsWith('browser-runner.cjs'))?240000:120000,windowsHide:true,maxBuffer:8*1024*1024,stdio:path.basename(exe)==='pg_ctl.exe'?'ignore':'pipe'});
 if(r.error)throw r.error;
 const out=redact((r.stdout||'')+(r.stderr||''));
 if(out)process.stdout.write(out);
 if(r.status!==0&&!allowFail)throw Error('Command failed ('+r.status+'): '+path.basename(exe)+' '+args.join(' '));
 return {exit:r.status,output:out};
}
const receipt={task_id:taskId,run_id:runId,mode,cluster,port:55432,status:'running',tests:null,cleanup:null};
let started=false,admin;
(async()=>{
 try{
  await new Promise((resolve,reject)=>{const net=require('net'),s=net.connect({host:'127.0.0.1',port:55432});s.on('connect',()=>{s.destroy();reject(Error('PORT_ALREADY_OWNED'))});s.on('error',e=>e.code==='ECONNREFUSED'?resolve():reject(e));});
  fs.mkdirSync(path.dirname(cluster),{recursive:true});
  run(path.join(bin,'initdb.exe'),['-D',cluster,'-U','payslip_owner','--encoding=UTF8','--locale=C','--auth=scram-sha-256','--pwprompt'],ownerPassword+'\n'+ownerPassword+'\n',false,{...env,OSTYPE:'msys'});
  fs.appendFileSync(path.join(cluster,'postgresql.conf'),"\nlisten_addresses='127.0.0.1'\nport=55432\nshared_buffers='64MB'\nwork_mem='4MB'\nmax_connections=12\ntimezone='UTC'\n");
  started=true;run(path.join(bin,'pg_ctl.exe'),['-D',cluster,'-l',log,'-w','-t','20','start']);
  admin=new Pool({connectionString:ownerUrl.replace('/'+database,'/postgres'),max:1,connectionTimeoutMillis:3000});
  await admin.query('SELECT 1');
  await admin.query("CREATE ROLE payslip_app LOGIN PASSWORD '"+appPassword+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
  await admin.query("CREATE ROLE payslip_ingress LOGIN PASSWORD '"+ingressPassword+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
  await admin.query('CREATE DATABASE '+database+' OWNER payslip_owner');
  await admin.end();admin=null;
  const owner=new Pool({connectionString:ownerUrl,max:1});
  try{
   await owner.query('REVOKE ALL ON DATABASE '+database+' FROM PUBLIC; GRANT CONNECT ON DATABASE '+database+' TO payslip_app,payslip_ingress; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO payslip_app');
   let schemaReady=false;
   if(mode==='Green'||taskId==='PAY-W5-02a'||taskId==='PAY-W6-01'){
    run(process.execPath,['node_modules/prisma/build/index.js','validate']);
    run(process.execPath,['node_modules/prisma/build/index.js','generate']);
    run(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy']);
    schemaReady=true;
   }else if(taskId==='PAY-W4-01'){
    const migrationsRoot=path.join(root,'prisma','migrations');
    const baseline=fs.readdirSync(migrationsRoot,{withFileTypes:true})
      .filter(entry=>entry.isDirectory()&&entry.name<'202609060006_w4_01_pay_runs')
      .map(entry=>path.join(migrationsRoot,entry.name,'migration.sql'))
      .filter(file=>fs.existsSync(file))
      .sort();
    if(baseline.length!==7)throw Error('W4_BASELINE_MIGRATION_SET_INVALID');
    for(const file of baseline)run(path.join(bin,'psql.exe'),['--dbname',ownerUrl,'--set','ON_ERROR_STOP=1','--file',file]);
    schemaReady=true;
   }
   if(schemaReady){
    await owner.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO payslip_app; REVOKE UPDATE,DELETE ON clock_events,attendance_snapshots,legal_rule_packs,rule_sources,minimum_wages,insurance_policies,pit_policies,earning_component_policies,opening_hour_versions,employment_contracts,schedule_templates,schedule_assignments,attendance_adjustments,approval_events,adjustment_links,payslips,document_artifacts,delivery_attempts,audit_events,audit_events,retention_actions,outbox_jobs FROM payslip_app');
    if((await owner.query("SELECT to_regclass('public._prisma_migrations') AS name")).rows[0].name)await owner.query('REVOKE ALL ON TABLE _prisma_migrations FROM payslip_app');
    if((await owner.query("SELECT to_regclass('public.outbox_dispatch_attempts') AS name")).rows[0].name)await owner.query('REVOKE UPDATE,DELETE ON outbox_dispatch_attempts FROM payslip_app');
   }
  }finally{await owner.end();}
  if(taskId==='PAY-W5-02a'){
   if(process.env.PAYSLIP_AUTH_BROWSER!=='1')throw Error('ADMIN_BROWSER_REQUIRED');
   const browser=run(process.execPath,['tests/integration/admin/browser-runner.cjs'],undefined,true);
   receipt.browser={exit:browser.exit,passed_count:Number(browser.output.match(/(\d+) passed/)?.[1]||0)};
   if(browser.exit!==0)throw Error('ADMIN_BROWSER_FAILED');
   if(mode==='Red'&&!browser.output.includes('ADMIN_BEHAVIOR_RED_OBSERVED'))throw Error('ADMIN_PRODUCT_RED_REQUIRED');
   if(mode==='Green'&&receipt.browser.passed_count<1)throw Error('ADMIN_EMPTY_BROWSER_SUITE');
   receipt.status=mode==='Red'?'red_observed':'passed';
   return;
  }
  const tests=run(process.execPath,['node_modules/vitest/vitest.mjs','run',taskId==='PAY-W6-01'?'tests/integration/documents':taskId==='PAY-W4-01'?'tests/integration/pay-runs':taskId==='PAY-W3-03'?'tests/integration/attendance/review.spec.ts':kioskTask?(taskId==='PAY-W7-02a'?'tests/integration/operations/service-lifecycle.windows.spec.ts':'tests/integration/attendance/ingress.spec.ts'):taskId==='PAY-W3-01b'?'tests/integration/attendance/schedule-effective-dates.spec.ts':taskId==='PAY-W2-03'?'tests/integration/employees':taskId==='PAY-W2-02'?'tests/integration/auth':'tests/integration/db',...(taskId==='PAY-W6-02a'?['tests/integration/delivery']:[]),'--maxWorkers=1','--no-file-parallelism'],undefined,true);
  receipt.tests={exit:tests.exit,passed_count:Number(tests.output.match(/Tests\s+(\d+) passed/)?.[1]||0)};
  if(mode==='Red'){
   const expectedRed=taskId==='PAY-W6-01'?tests.output.includes('DOCUMENT_NOT_IMPLEMENTED'):taskId==='PAY-W4-01'
    ?tests.output.includes('INVALID_STATE_TRANSITION')||tests.output.includes('pay_runs_status_check')
    :tests.output.includes('does not exist');
   if(tests.exit===0||!expectedRed)throw Error('Expected behavior-specific RED was not observed');
   if(taskId==='PAY-W4-01')receipt.red_fingerprint='pre_w4_lifecycle_contract_missing';
   receipt.status='red_observed';
  }else{
   if(tests.exit!==0)throw Error('Integration failed');
   if(taskId==='PAY-W2-02'&&process.env.PAYSLIP_AUTH_BROWSER==='1'){
    const browser=run(process.execPath,['tests/integration/auth/browser-runner.cjs'],undefined,true);
    receipt.browser={exit:browser.exit,passed_count:Number(browser.output.match(/(\d+) passed/)?.[1]||0)};
    if(browser.exit!==0)throw Error('Browser flow failed');
   }
   if(taskId==='PAY-W3-03'&&process.env.PAYSLIP_AUTH_BROWSER==='1'){
    const browser=run(process.execPath,['tests/integration/attendance/review-browser-runner.cjs'],undefined,true);
    receipt.browser={exit:browser.exit,passed_count:Number(browser.output.match(/(\d+) passed/)?.[1]||0)};
    if(browser.exit!==0||receipt.browser.passed_count<1)throw Error('Review browser failed or empty');
   }
   if(taskId==='PAY-W3-02b'){
    const browser=run(process.execPath,['tests/integration/attendance/kiosk-browser-runner.cjs'],undefined,true);
    receipt.browser={exit:browser.exit,passed_count:Number(browser.output.match(/(\d+) passed/)?.[1]||0)};
    if(browser.exit!==0||receipt.browser.passed_count<1)throw Error('Kiosk browser flow failed or empty');
   }
   receipt.status='passed';
  }
 }catch(error){receipt.status='failed';receipt.error=redact(error.message);process.exitCode=1;}
 finally{
  if(admin)await admin.end();
  if(started){
   try{run(path.join(bin,'pg_ctl.exe'),['-D',cluster,'-w','-t','20','stop','-m','fast']);}
   catch(error){receipt.cleanup={status:'failed',error:redact(error.message)};process.exitCode=1;}
  }
  try{
   await new Promise((resolve,reject)=>{const net=require('net'),s=net.connect({host:'127.0.0.1',port:55432});s.on('connect',()=>{s.destroy();reject(Error('LISTENER_REMAINS'))});s.on('error',e=>e.code==='ECONNREFUSED'?resolve():reject(e));});
   receipt.cleanup={status:'passed',listener_absent:true,postmaster_pid_file_absent:!fs.existsSync(path.join(cluster,'postmaster.pid'))};
  }catch(error){receipt.cleanup={status:'failed',error:redact(error.message)};process.exitCode=1;}
  fs.mkdirSync(path.join(root,'ops/evidence'),{recursive:true});
  const dest=path.join(root,'ops/evidence/'+taskId+'-runtime.json');
  const history=fs.existsSync(dest)?JSON.parse(fs.readFileSync(dest,'utf8')):{task_id:taskId,runs:[]};
  history.runs.push(receipt);fs.writeFileSync(dest,JSON.stringify(history,null,2)+'\n');
  process.stdout.write(JSON.stringify(receipt)+'\n');
 }
})();
'@ | node
 if($LASTEXITCODE -ne 0){throw "Database wave exited $LASTEXITCODE"}
} finally {Remove-Item Env:PAYSLIP_DB_TASK_ID -ErrorAction SilentlyContinue; Remove-Item Env:PAYSLIP_DB_TEST_MODE -ErrorAction SilentlyContinue}
