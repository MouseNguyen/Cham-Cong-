param([ValidateSet('Red','Green')][string]$Mode='Green', [ValidateSet('PAY-W2-01','PAY-W6-02a','PAY-W2-02','PAY-W2-03')][string]$TaskId='PAY-W2-01', [switch]$Browser)
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
const ownerPassword=crypto.randomBytes(32).toString('hex'),appPassword=crypto.randomBytes(32).toString('hex');
const database=taskId==='PAY-W2-03'?'payslip_w2_03_synthetic':taskId==='PAY-W2-02'?'payslip_w2_02_auth_synthetic':'payslip_w2_01_synthetic';
const ownerConnection=new URL('postgresql://127.0.0.1:55432/'+database); ownerConnection.username='payslip_owner'; ownerConnection.password=ownerPassword; const ownerUrl=ownerConnection.href;
const appConnection=new URL('postgresql://127.0.0.1:55432/'+database); appConnection.username='payslip_app'; appConnection.password=appPassword; const appUrl=appConnection.href;
const env={...process.env,DATABASE_URL:ownerUrl,PAYSLIP_TEST_DATABASE_URL:appUrl,PRISMA_HIDE_UPDATE_MESSAGE:'1'};
const redact=text=>String(text).split(ownerPassword).join('[redacted]').split(appPassword).join('[redacted]');
function run(exe,args,input,allowFail=false,childEnv=env){
 const r=cp.spawnSync(exe,args,{cwd:root,env:childEnv,encoding:'utf8',input,timeout:args.includes('tests/integration/auth/browser-runner.cjs')?240000:120000,windowsHide:true,maxBuffer:8*1024*1024,stdio:path.basename(exe)==='pg_ctl.exe'?'ignore':'pipe'});
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
  await admin.query('CREATE DATABASE '+database+' OWNER payslip_owner');
  await admin.end();admin=null;
  const owner=new Pool({connectionString:ownerUrl,max:1});
  try{
   await owner.query('REVOKE ALL ON DATABASE '+database+' FROM PUBLIC; GRANT CONNECT ON DATABASE '+database+' TO payslip_app; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO payslip_app');
   if(mode==='Green'){
    run(process.execPath,['node_modules/prisma/build/index.js','validate']);
    run(process.execPath,['node_modules/prisma/build/index.js','generate']);
    run(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy']);
    await owner.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO payslip_app; REVOKE ALL ON TABLE _prisma_migrations FROM payslip_app; REVOKE UPDATE,DELETE ON clock_events,attendance_snapshots,legal_rule_packs,rule_sources,minimum_wages,insurance_policies,pit_policies,earning_component_policies,opening_hour_versions,employment_contracts,schedule_templates,schedule_assignments,attendance_adjustments,approval_events,adjustment_links,payslips,document_artifacts,delivery_attempts,audit_events,audit_events,retention_actions,outbox_jobs FROM payslip_app');
    if((await owner.query("SELECT to_regclass('public.outbox_dispatch_attempts') AS name")).rows[0].name)await owner.query('REVOKE UPDATE,DELETE ON outbox_dispatch_attempts FROM payslip_app');
   }
  }finally{await owner.end();}
  const tests=run(process.execPath,['node_modules/vitest/vitest.mjs','run',taskId==='PAY-W2-03'?'tests/integration/employees':taskId==='PAY-W2-02'?'tests/integration/auth':'tests/integration/db',...(taskId==='PAY-W6-02a'?['tests/integration/delivery']:[]),'--maxWorkers=1','--no-file-parallelism'],undefined,true);
  receipt.tests={exit:tests.exit,passed_count:Number(tests.output.match(/Tests\s+(\d+) passed/)?.[1]||0)};
  if(mode==='Red'){
   if(tests.exit===0||!tests.output.includes('does not exist'))throw Error('Expected real missing-schema RED was not observed');
   receipt.status='red_observed';
  }else{
   if(tests.exit!==0)throw Error('Integration failed');
   if(taskId==='PAY-W2-02'&&process.env.PAYSLIP_AUTH_BROWSER==='1'){
    const browser=run(process.execPath,['tests/integration/auth/browser-runner.cjs'],undefined,true);
    receipt.browser={exit:browser.exit,passed_count:Number(browser.output.match(/(\d+) passed/)?.[1]||0)};
    if(browser.exit!==0)throw Error('Browser flow failed');
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
