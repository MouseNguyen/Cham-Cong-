import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { expect, test } from 'vitest';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
const runtime=require('../../../scripts/windows/local-runtime.cjs') as {syntheticUrl:(value:string)=>string};
const command=resolve('scripts/windows/local-runtime.cjs');
function run(args:string[],env:NodeJS.ProcessEnv=process.env){return new Promise<{code:number|null;output:string}>(resolveRun=>{const child=spawn(process.execPath,[command,...args],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b.toString());child.stderr.on('data',b=>output+=b.toString());child.once('close',code=>resolveRun({code,output}));});}
test('launcher rejects implicit and non-approved database targets before connection',()=>{
 for(const url of ['', 'postgresql://host.example.invalid/payroll','postgresql://127.0.0.1:55432/real_payroll'])expect(()=>runtime.syntheticUrl(url)).toThrow();
});
test('busy admin port reports ownership and leaves the existing listener running',async()=>{
 const server=createServer(socket=>socket.end());await new Promise<void>(resolveListen=>server.listen(46217,'127.0.0.1',resolveListen));
 try{const result=await run(['start','--scope','admin']);expect(result.code).not.toBe(0);expect(result.output).toContain('PORT_ALREADY_OWNED:46217');expect(result.output).toContain(String(process.pid));expect(server.listening).toBe(true);}finally{await new Promise<void>((resolveClose,reject)=>server.close(e=>e?reject(e):resolveClose()));}
},20000);
test('built admin starts only after database health and the stop helper releases its exact listener',async()=>{
 const connection=process.env.PAYSLIP_TEST_DATABASE_URL;if(!connection)throw Error('OWNED_TEST_DATABASE_REQUIRED');
 const env={...process.env,PAYSLIP_AUTH_DATABASE_URL:connection,PAYSLIP_ORGANIZATION_ID:'11111111-1111-4111-8111-111111111111',PAYSLIP_PROJECT_ROOT:resolve('.')};
 const child=spawn(process.execPath,[command,'start','--scope','admin'],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b.toString());child.stderr.on('data',b=>output+=b.toString());
 try{const deadline=Date.now()+60000;while(Date.now()<deadline&&!output.includes('"status":"ready"')&&child.exitCode===null)await new Promise(r=>setTimeout(r,200));expect(output).toContain('"status":"ready"');const health=await run(['health']);expect(health.code).toBe(0);const stopped=await run(['stop']);expect(stopped.code).toBe(0);expect(stopped.output).toContain('"listeners_absent":true');}finally{if(child.exitCode===null)await run(['stop']);}
},90000);

test('foreground stop input follows launcher cleanup and leaves no app listener',async()=>{
 const connection=process.env.PAYSLIP_TEST_DATABASE_URL;if(!connection)throw Error('OWNED_TEST_DATABASE_REQUIRED');
 const env={...process.env,PAYSLIP_AUTH_DATABASE_URL:connection};const child=spawn(process.execPath,[command,'start','--scope','admin'],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b.toString());child.stderr.on('data',b=>output+=b.toString());
 try{const deadline=Date.now()+60000;while(Date.now()<deadline&&!output.includes('"status":"ready"')&&child.exitCode===null)await new Promise(r=>setTimeout(r,150));expect(output).toContain('"status":"ready"');child.stdin.write('stop\n');const end=Date.now()+20000;while(Date.now()<end&&child.exitCode===null)await new Promise(r=>setTimeout(r,100));expect(child.exitCode).toBe(0);expect(output).toContain('"listeners_absent":true');expect((await run(['health'])).code).not.toBe(0);}finally{if(child.exitCode===null)await run(['stop']);}
},90000);
