/* eslint-disable @typescript-eslint/no-require-imports -- Approved synthetic review harness. */
const cp=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto');
const root=process.cwd(),launcher=path.join(root,'scripts/windows/local-runtime.cjs');
const env={...process.env,PAYSLIP_AUTH_DATABASE_URL:process.env.PAYSLIP_TEST_DATABASE_URL,PAYSLIP_ORGANIZATION_ID:crypto.randomUUID(),PLAYWRIGHT_BROWSERS_PATH:path.join(root,'.tools/playwright'),NEXT_TELEMETRY_DISABLED:'1'};
let child,output='';
(async()=>{try{
 child=cp.spawn(process.execPath,[launcher,'start','--scope','admin'],{cwd:root,env,windowsHide:true,stdio:['pipe','pipe','pipe']});for(const stream of [child.stdout,child.stderr])stream.on('data',b=>output=(output+b.toString()).slice(-6000));const deadline=Date.now()+65000;while(Date.now()<deadline&&!output.includes('"status":"ready"')&&child.exitCode===null)await new Promise(r=>setTimeout(r,150));if(!output.includes('"status":"ready"'))throw Error('REVIEW_LAUNCH_FAILED');
 const r=cp.spawnSync(process.execPath,[path.join(root,'node_modules/@playwright/test/cli.js'),'test','tests/e2e/attendance-review.spec.ts'],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:150000,maxBuffer:2*1024*1024});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);if(r.error||r.status!==0)throw Error('REVIEW_BROWSER_FAILED');
 }catch(e){process.exitCode=1;console.error(e.message);console.error(output.replace(/postgres(?:ql)?:\/\/[^\s"']+/g,'[redacted]'));}
 finally{const r=cp.spawnSync(process.execPath,[launcher,'stop'],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:30000});if(r.stdout)process.stdout.write(r.stdout);if(r.status!==0){process.exitCode=1;console.error('REVIEW_CLEANUP_FAILED');}}
})();
