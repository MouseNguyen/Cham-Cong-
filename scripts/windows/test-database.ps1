param([ValidateSet('Red','Green')][string]$Mode='Green')
$ErrorActionPreference='Stop'
$env:PAYSLIP_DB_TEST_MODE=$Mode
try {
@'
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const {Pool}=require('pg');
const root=process.cwd(),mode=process.env.PAYSLIP_DB_TEST_MODE;
const bin=path.join(root,'.tools/postgresql/18.6/pgsql/bin');
const runId=mode.toLowerCase()+'-'+crypto.randomUUID();
const cluster=path.join(root,'.tmp/PAY-W2-01/cluster',runId);
const log=path.join(root,'.tmp/PAY-W2-01',runId+'.log');
const ownerPassword=crypto.randomBytes(32).toString('hex'),appPassword=crypto.randomBytes(32).toString('hex');
const ownerUrl='postgresql://payslip_owner:'+ownerPassword+'@127.0.0.1:55432/payslip_w2_01_synthetic';
const appUrl='postgresql://payslip_app:'+appPassword+'@127.0.0.1:55432/payslip_w2_01_synthetic';
const env={...process.env,DATABASE_URL:ownerUrl,PAYSLIP_TEST_DATABASE_URL:appUrl,PRISMA_HIDE_UPDATE_MESSAGE:'1'};
const redact=text=>String(text).split(ownerPassword).join('[redacted]').split(appPassword).join('[redacted]');
function run(exe,args,input,allowFail=false,childEnv=env){
 const r=cp.spawnSync(exe,args,{cwd:root,env:childEnv,encoding:'utf8',input,timeout:120000,windowsHide:true,maxBuffer:8*1024*1024,stdio:path.basename(exe)==='pg_ctl.exe'?'ignore':'pipe'});
 if(r.error)throw r.error;
 const out=redact((r.stdout||'')+(r.stderr||''));
 if(out)process.stdout.write(out);
 if(r.status!==0&&!allowFail)throw Error('Command failed ('+r.status+'): '+path.basename(exe)+' '+args.join(' '));
 return {exit:r.status,output:out};
}
const receipt={task_id:'PAY-W2-01',run_id:runId,mode,cluster,port:55432,status:'running',tests:null,cleanup:null};
let started=false,admin;
(async()=>{
 try{
  await new Promise((resolve,reject)=>{const net=require('net'),s=net.connect({host:'127.0.0.1',port:55432});s.on('connect',()=>{s.destroy();reject(Error('PORT_ALREADY_OWNED'))});s.on('error',e=>e.code==='ECONNREFUSED'?resolve():reject(e));});
  fs.mkdirSync(path.dirname(cluster),{recursive:true});
  run(path.join(bin,'initdb.exe'),['-D',cluster,'-U','payslip_owner','--encoding=UTF8','--locale=C','--auth=scram-sha-256','--pwprompt'],ownerPassword+'\n'+ownerPassword+'\n',false,{...env,OSTYPE:'msys'});
  fs.appendFileSync(path.join(cluster,'postgresql.conf'),"\nlisten_addresses='127.0.0.1'\nport=55432\nshared_buffers='64MB'\nwork_mem='4MB'\nmax_connections=12\ntimezone='UTC'\n");
  started=true;run(path.join(bin,'pg_ctl.exe'),['-D',cluster,'-l',log,'-w','-t','20','start']);
  admin=new Pool({connectionString:ownerUrl.replace('/payslip_w2_01_synthetic','/postgres'),max:1,connectionTimeoutMillis:3000});
  await admin.query('SELECT 1');
  await admin.query("CREATE ROLE payslip_app LOGIN PASSWORD '"+appPassword+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
  await admin.query('CREATE DATABASE payslip_w2_01_synthetic OWNER payslip_owner');
  await admin.end();admin=null;
  const owner=new Pool({connectionString:ownerUrl,max:1});
  try{
   await owner.query('REVOKE ALL ON DATABASE payslip_w2_01_synthetic FROM PUBLIC; GRANT CONNECT ON DATABASE payslip_w2_01_synthetic TO payslip_app; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO payslip_app');
   if(mode==='Green'){
    run(process.execPath,['node_modules/prisma/build/index.js','validate']);
    run(process.execPath,['node_modules/prisma/build/index.js','generate']);
    run(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy']);
    await owner.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO payslip_app; REVOKE ALL ON TABLE _prisma_migrations FROM payslip_app; REVOKE UPDATE,DELETE ON clock_events,attendance_snapshots,legal_rule_packs,rule_sources,minimum_wages,insurance_policies,pit_policies,earning_component_policies,opening_hour_versions,employment_contracts,schedule_templates,schedule_assignments,attendance_adjustments,approval_events,adjustment_links,payslips,document_artifacts,delivery_attempts,audit_events,audit_events,retention_actions,outbox_jobs FROM payslip_app');
   }
  }finally{await owner.end();}
  const tests=run(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/integration/db','--maxWorkers=1','--no-file-parallelism'],undefined,true);
  receipt.tests={exit:tests.exit};
  if(mode==='Red'){
   if(tests.exit===0||!tests.output.includes('does not exist'))throw Error('Expected real missing-schema RED was not observed');
   receipt.status='red_observed';
  }else{
   if(tests.exit!==0)throw Error('Integration failed');
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
  const dest=path.join(root,'ops/evidence/PAY-W2-01-runtime.json');
  const history=fs.existsSync(dest)?JSON.parse(fs.readFileSync(dest,'utf8')):{task_id:'PAY-W2-01',runs:[]};
  history.runs.push(receipt);fs.writeFileSync(dest,JSON.stringify(history,null,2)+'\n');
  process.stdout.write(JSON.stringify(receipt)+'\n');
 }
})();
'@ | node
 if($LASTEXITCODE -ne 0){throw "Database wave exited $LASTEXITCODE"}
} finally {Remove-Item Env:PAYSLIP_DB_TEST_MODE -ErrorAction SilentlyContinue}
