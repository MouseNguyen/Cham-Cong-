import { afterEach, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createAttendanceServer } from '../../../apps/attendance-ingress/src/server.ts';
import { PgAttendanceIngressRepository } from '../../../apps/attendance-ingress/src/repository.ts';
import { ingressFixture } from './ingress-support.ts';
const fixtures: Awaited<ReturnType<typeof ingressFixture>>[]=[];
async function setup(){const f=await ingressFixture();fixtures.push(f);const repo=new PgAttendanceIngressRepository(f.ingress,()=>new Date(f.s.clock.value));const server=createAttendanceServer({repository:repo,now:()=>new Date(f.s.clock.value)});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const a=server.address();if(!a||typeof a==='string')throw Error('LISTENER');return {f,server,base:`http://127.0.0.1:${a.port}`};}
afterEach(async()=>{await Promise.all(fixtures.splice(0).map(f=>f.close()));});
async function clock(base:string,token:string,body:object){return fetch(base+'/clock',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});}
test('PG durable clock replay uses original timestamp and changed action conflicts',async()=>{const x=await setup();try{const key=randomUUID(),body={employeeCode:x.f.code,pin:x.f.pin,action:'CLOCK_IN',idempotencyKey:key};const first=await clock(x.base,x.f.device.token,body);expect(first.status).toBe(200);const result=await first.json() as {recordedAt:string};x.f.s.clock.value+=60_000;const replay=await clock(x.base,x.f.device.token,body);expect(await replay.json()).toMatchObject({recorded:true,replayed:true,recordedAt:result.recordedAt});expect((await clock(x.base,x.f.device.token,{...body,action:'CLOCK_OUT'})).status).toBe(409);expect((await x.f.app.query('SELECT count(*)::int n FROM clock_events WHERE employee_id=$1',[x.f.employeeId])).rows[0].n).toBe(1);}finally{await new Promise<void>(r=>x.server.close(()=>r()));}});
test('PG concurrent employee clock on one device accepts one event and rejects invalid OUT',async()=>{const x=await setup();try{const out=await clock(x.base,x.f.device.token,{employeeCode:x.f.code,pin:x.f.pin,action:'CLOCK_OUT',idempotencyKey:randomUUID()});expect(out.status).toBe(409);const requests=[clock(x.base,x.f.device.token,{employeeCode:x.f.code,pin:x.f.pin,action:'CLOCK_IN',idempotencyKey:randomUUID()}),clock(x.base,x.f.device.token,{employeeCode:x.f.code,pin:x.f.pin,action:'CLOCK_IN',idempotencyKey:randomUUID()})];const responses=await Promise.all(requests);expect(responses.filter(r=>r.status===200)).toHaveLength(1);expect((await x.f.app.query('SELECT count(*)::int n FROM clock_events WHERE employee_id=$1',[x.f.employeeId])).rows[0].n).toBe(1);}finally{await new Promise<void>(r=>x.server.close(()=>r()));}});
import { Pool } from 'pg';
import { KioskAdminRepository } from '../../../apps/web/src/lib/db/repositories/kiosk-admin';
import { scenario, login, protector } from '../auth/support';

function credentials(f:Awaited<ReturnType<typeof ingressFixture>>){return {sessionToken:f.session.token,csrfToken:f.session.csrfToken}}
async function reconcileRequest(x:Awaited<ReturnType<typeof setup>>,key:string,code=x.f.code,token=x.f.device.token){return fetch(x.base+'/reconcile',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({employeeCode:code,idempotencyKey:key})});}

test('restricted ingress role cannot read private records or employee names or modify history',async()=>{
 const f=await ingressFixture();fixtures.push(f);
 for(const sql of ['SELECT * FROM users','SELECT * FROM pay_runs','SELECT * FROM payslips','SELECT * FROM document_artifacts','SELECT display_name FROM employees','UPDATE clock_events SET direction=direction','DELETE FROM clock_events','UPDATE kiosk_devices SET token_hash=token_hash'])await expect(f.ingress.query(sql)).rejects.toMatchObject({code:'42501'});
});

test('owner enrollment and PIN commands reject missing CSRF, accountant, expired MFA and foreign organization',async()=>{
 const f=await ingressFixture();fixtures.push(f);const input={workplaceId:f.workplaceId,expiresAt:new Date(f.s.clock.value+3600000)};
 await expect(f.admin.enroll({...credentials(f),csrfToken:'invalid'},input)).rejects.toThrow();
 const a=await scenario(f.app,'accountant',f.s.org),sa=await login(a),admin=new KioskAdminRepository(f.app,protector,f.s.org,()=>new Date(a.clock.value));
 await expect(admin.enroll({sessionToken:sa.token,csrfToken:sa.csrfToken},input)).rejects.toThrow('FORBIDDEN');
 await expect(f.admin.enroll(credentials(f),{...input,workplaceId:randomUUID()})).rejects.toThrow('WORKPLACE_NOT_FOUND');
 f.s.clock.value+=11*60000;await expect(f.admin.enroll(credentials(f),input)).rejects.toThrow('FRESH_TOTP_REQUIRED');
});

test('real two-device concurrent clock-in shares one employee state',async()=>{
 const x=await setup();try{const second=await x.f.admin.enroll(credentials(x.f),{workplaceId:x.f.workplaceId,expiresAt:new Date(x.f.s.clock.value+3600000)});await x.f.admin.setEmployeePin(credentials(x.f),{employeeId:x.f.employeeId,deviceId:second.deviceId,employeeCode:x.f.code,pin:x.f.pin});
 const responses=await Promise.all([x.f.device.token,second.token].map(token=>clock(x.base,token,{employeeCode:x.f.code,pin:x.f.pin,action:'CLOCK_IN',idempotencyKey:randomUUID()})));expect(responses.filter(r=>r.status===200)).toHaveLength(1);
 expect((await x.f.app.query('SELECT count(*)::int n FROM clock_events WHERE employee_id=$1',[x.f.employeeId])).rows[0].n).toBe(1);
 }finally{await new Promise<void>(r=>x.server.close(()=>r()));}
});

test('proof recovers committed event without PIN and rejects another code or device session',async()=>{
 const x=await setup();try{const key=randomUUID();const result=await (await clock(x.base,x.f.device.token,{employeeCode:x.f.code,pin:x.f.pin,action:'CLOCK_IN',idempotencyKey:key})).json();
 expect(await (await reconcileRequest(x,key)).json()).toMatchObject({recorded:true,eventId:result.eventId,recordedAt:result.recordedAt});expect((await reconcileRequest(x,key,'unknown')).status).toBe(202);
 const rotated=await x.f.admin.rotate(credentials(x.f),x.f.device.deviceId,new Date(x.f.s.clock.value+3600000));expect((await reconcileRequest(x,key)).status).toBe(401);expect((await reconcileRequest(x,key,x.f.code,rotated.token)).status).toBe(202);
 await x.f.admin.revoke(credentials(x.f),x.f.device.deviceId);expect((await clock(x.base,rotated.token,{employeeCode:x.f.code,pin:x.f.pin,action:'CLOCK_OUT',idempotencyKey:randomUUID()})).status).toBe(401);
 }finally{await new Promise<void>(r=>x.server.close(()=>r()));}
});

test('unknown and wrong PIN responses are generic; durable lockout survives repository recreation',async()=>{
 const x=await setup();try{const body={employeeCode:x.f.code,pin:x.f.pin==='000000'?'999999':'000000',action:'CLOCK_IN',idempotencyKey:randomUUID()};const wrong=await (await clock(x.base,x.f.device.token,body)).json();const unknown=await (await clock(x.base,x.f.device.token,{...body,employeeCode:'unknown'})).json();expect(wrong.message).toBe(unknown.message);expect(wrong.code).toBe(unknown.code);
 for(let i=0;i<4;i++)await clock(x.base,x.f.device.token,body);
 const repo=new PgAttendanceIngressRepository(x.f.ingress,()=>new Date(x.f.s.clock.value));expect(await repo.authenticateEmployee({deviceId:x.f.device.deviceId,employeeCode:x.f.code,pin:x.f.pin})).toBeNull();
 x.f.s.clock.value+=16*60000;expect(await repo.authenticateEmployee({deviceId:x.f.device.deviceId,employeeCode:x.f.code,pin:x.f.pin})).toMatchObject({employeeId:x.f.employeeId});
 const rows=JSON.stringify((await x.f.app.query('SELECT * FROM kiosk_rate_limits')).rows);expect(rows).not.toContain(x.f.code);expect(rows).not.toContain(x.f.pin);
 }finally{await new Promise<void>(r=>x.server.close(()=>r()));}
});

test('inactive employees and public private-path requests fail closed',async()=>{
 const x=await setup();try{for(const path of ['/admin','/api/auth/session','/payroll','/payslips','/document.pdf','/%2e%2e/.env'])expect((await fetch(x.base+path)).status).toBe(404);
 expect((await fetch(x.base+'/clock',{method:'POST',headers:{origin:'https://evil.example.invalid'}})).status).toBe(403);
 await x.f.app.query("UPDATE employees SET status='inactive' WHERE id=$1",[x.f.employeeId]);expect((await clock(x.base,x.f.device.token,{employeeCode:x.f.code,pin:x.f.pin,action:'CLOCK_IN',idempotencyKey:randomUUID()})).status).toBe(409);
 }finally{await new Promise<void>(r=>x.server.close(()=>r()));}
});

for(const kind of ['before_commit','commit_ack_lost'] as const)test('actual PostgreSQL '+kind+' produces truthful outcome',async()=>{
 const f=await ingressFixture();fixtures.push(f);const actual=f.ingress;
 // Wrap the actual driver: the lost-ack case executes COMMIT on PostgreSQL before throwing.
 const driver={connect:async()=>{const c=await actual.connect();return {query:async(sql:string,values?:unknown[])=>{const r=await c.query(sql,values);if(sql==='COMMIT'&&kind==='commit_ack_lost')throw Error('SYNTHETIC_ACK_LOST');return r;},release:()=>c.release()};}} as unknown as Pool;
 const repo=new PgAttendanceIngressRepository(driver,()=>new Date(f.s.clock.value),kind==='before_commit'?{beforeCommit:()=>{throw Error('SYNTHETIC_PRECOMMIT')}}:{});
 const key=randomUUID(),result=await repo.recordClock({idempotencyKey:key,action:'CLOCK_IN',occurredAtUtcMs:f.s.clock.value,employeeId:f.employeeId,deviceId:f.device.deviceId,sessionId:f.device.sessionId});
 expect(result.kind).toBe(kind==='before_commit'?'not_recorded':'pending_confirmation');expect((await f.app.query('SELECT count(*)::int n FROM clock_events WHERE employee_id=$1',[f.employeeId])).rows[0].n).toBe(kind==='before_commit'?0:1);
 if(kind==='commit_ack_lost')expect((await new PgAttendanceIngressRepository(actual,()=>new Date(f.s.clock.value)).reconcile({idempotencyKey:key,deviceId:f.device.deviceId,sessionId:f.device.sessionId,employeeCode:f.code})).kind).toBe('recorded');
});

test('device request budget bounds guessed-code requests and recorded audit uses the server request ID',async()=>{
 const x=await setup();try{const good=await (await clock(x.base,x.f.device.token,{employeeCode:x.f.code,pin:x.f.pin,action:'CLOCK_IN',idempotencyKey:randomUUID()})).json();
 const audit=(await x.f.app.query('SELECT * FROM kiosk_audit_events WHERE id=$1',[good.requestId])).rows[0];expect(audit).toMatchObject({outcome:'recorded',employee_id:x.f.employeeId});expect(JSON.stringify(audit)).not.toContain(x.f.pin);expect(JSON.stringify(audit)).not.toContain(x.f.device.token);
 const repo=new PgAttendanceIngressRepository(x.f.ingress,()=>new Date(x.f.s.clock.value));for(let i=0;i<22;i++)await repo.authenticateEmployee({deviceId:x.f.device.deviceId,employeeCode:'guess-'+i,pin:'000000'});
 expect(await repo.authenticateEmployee({deviceId:x.f.device.deviceId,employeeCode:x.f.code,pin:x.f.pin})).toBeNull();
 x.f.s.clock.value+=60001;expect(await repo.authenticateEmployee({deviceId:x.f.device.deviceId,employeeCode:x.f.code,pin:x.f.pin})).toMatchObject({employeeId:x.f.employeeId});
 }finally{await new Promise<void>(r=>x.server.close(()=>r()));}
});
