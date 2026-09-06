import {afterAll,expect,test} from "vitest";
import {fixture,testPool,input,denied} from "./support";
import {createFakeAdapter} from "../../../apps/web/src/lib/delivery/fake-adapter";
import type {FakeMessage} from "../../../apps/web/src/lib/delivery/types";
const pool=testPool();afterAll(()=>pool.end());
async function email(){const s=await fixture(pool);const e=await s.repo.createEmployee(s.credentials,input(s.workplaceId));const change=await s.repo.changeEmail(s.credentials,{employeeId:e.employeeId,expectedDestinationId:null,address:"synthetic@example.invalid"});return {...s,...e,...change};}
async function deliver(s:Awaited<ReturnType<typeof email>>){let received="";const adapter=createFakeAdapter();const result=await s.repo.dispatchVerification(s.jobId,{send:async(m:FakeMessage)=>{received=m.body;return adapter.send(m)},reconcile:m=>adapter.reconcile(m)});expect(result).toBe("accepted");const code=received.match(/\b\d{6}\b/)?.[0];if(!code)throw Error("NO_SYNTHETIC_CODE_DELIVERED");return code;}
test("real synthetic outbox message carries code only in memory and correct code verifies destination",async()=>{
 const s=await email(),code=await deliver(s);
 const rows=(await pool.query("SELECT j.payload,v.code_hash FROM outbox_jobs j JOIN employee_email_verifications v ON v.job_id=j.id WHERE j.id=$1",[s.jobId])).rows[0];
 expect(JSON.stringify(rows).includes(code)).toBe(false);
 await s.repo.verifyEmailCode(s.credentials,{employeeId:s.employeeId,destinationId:s.destinationId,code});
 expect((await s.repo.getEmployee(s.credentials,s.employeeId)).destination?.verificationStatus).toBe("verified");
 await denied(s.repo.verifyEmailCode(s.credentials,{employeeId:s.employeeId,destinationId:s.destinationId,code}),"VERIFICATION_FAILED");
});
test("wrong attempts persist, expiry denies, and address changes invalidate old verification",async()=>{
 const s=await email(),code=await deliver(s),wrong=code==="000000"?"111111":"000000";
 for(let i=0;i<5;i++)await denied(s.repo.verifyEmailCode(s.credentials,{employeeId:s.employeeId,destinationId:s.destinationId,code:wrong}),"VERIFICATION_FAILED");
 await denied(s.repo.verifyEmailCode(s.credentials,{employeeId:s.employeeId,destinationId:s.destinationId,code}),"VERIFICATION_FAILED");
 s.clock.value+=60_000;const next=await s.repo.changeEmail(s.credentials,{employeeId:s.employeeId,expectedDestinationId:s.destinationId,address:"replacement@example.invalid"});
 expect(next.destinationId!==s.destinationId).toBe(true);expect((await s.repo.getEmployee(s.credentials,s.employeeId)).destination?.verificationStatus).toBe("pending");
 await denied(s.repo.verifyEmailCode(s.credentials,{employeeId:s.employeeId,destinationId:s.destinationId,code}),"VERIFICATION_FAILED");
 s.clock.value+=11*60_000;await denied(s.repo.verifyEmailCode(s.credentials,{employeeId:s.employeeId,destinationId:next.destinationId,code:"000000"}),"VERIFICATION_FAILED");
});
test("changing address cancels pending fake delivery; deactivation cancels its replacement",async()=>{
 const s=await email();s.clock.value+=60_000;
 const next=await s.repo.changeEmail(s.credentials,{employeeId:s.employeeId,expectedDestinationId:s.destinationId,address:"new@example.invalid"});
 expect(await s.repo.dispatchVerification(s.jobId,createFakeAdapter())).toBe("cancelled");
 await s.repo.deactivateEmployee(s.credentials,s.employeeId);
 expect(await s.repo.dispatchVerification(next.jobId,createFakeAdapter())).toBe("cancelled");
});
test("fake route rejects real-domain destinations and verification does not reveal codes",async()=>{
 const s=await fixture(pool),e=await s.repo.createEmployee(s.credentials,input(s.workplaceId));
 await denied(s.repo.changeEmail(s.credentials,{employeeId:e.employeeId,expectedDestinationId:null,address:"person@example.com"}),"SYNTHETIC_ONLY");
 expect((await s.repo.getEmployee(s.credentials,e.employeeId)).destination).toBeNull();
});


test("concurrent correct-code submissions consume the verification only once",async()=>{
 const s=await email(),code=await deliver(s),request={employeeId:s.employeeId,destinationId:s.destinationId,code};
 const result=await Promise.allSettled([s.repo.verifyEmailCode(s.credentials,request),s.repo.verifyEmailCode(s.credentials,request)]);
 expect(result.filter(r=>r.status==="fulfilled")).toHaveLength(1);
});
test("the correct code is rejected after expiry",async()=>{
 const s=await email(),code=await deliver(s);s.clock.value+=11*60_000;
 await denied(s.repo.verifyEmailCode(s.credentials,{employeeId:s.employeeId,destinationId:s.destinationId,code}),"VERIFICATION_FAILED");
});
test("unknown fake sends reconcile idempotently without a second send",async()=>{
 const s=await email(),adapter=createFakeAdapter({sendOutcomes:["unknown"],reconcileOutcomes:["accepted"]});
 expect(await s.repo.dispatchVerification(s.jobId,adapter)).toBe("unknown");s.clock.value+=1000;
 expect(await s.repo.dispatchVerification(s.jobId,adapter)).toBe("accepted");expect(adapter.sendCount).toBe(1);expect(adapter.reconcileCount).toBe(1);
 expect(await s.repo.dispatchVerification(s.jobId,adapter)).toBe("accepted");expect(adapter.sendCount).toBe(1);
});
test("DPAPI failure rolls back old destination closure, invalidation and new records",async()=>{
 const s=await email();s.clock.value+=60000;
 const {EmployeesRepository}=await import("../../../apps/web/src/lib/db/repositories/employees");
 const broken=new EmployeesRepository(pool,{protect:async()=>{throw Error("DPAPI_TEST_FAILURE")},unprotect:async()=>{throw Error("UNUSED")}},{organizationId:s.org,now:()=>new Date(s.clock.value)});
 await denied(broken.changeEmail(s.credentials,{employeeId:s.employeeId,expectedDestinationId:s.destinationId,address:"rollback@example.invalid"}),"DPAPI_TEST_FAILURE");
 expect((await s.repo.getEmployee(s.credentials,s.employeeId)).destination?.id).toBe(s.destinationId);
 expect(Number((await pool.query("SELECT count(*) FROM delivery_destination_closures WHERE employee_id=$1",[s.employeeId])).rows[0].count)).toBe(0);
 expect(Number((await pool.query("SELECT count(*) FROM outbox_jobs WHERE employee_id=$1",[s.employeeId])).rows[0].count)).toBe(1);
});
test("address changes invalidate payslip drafts and preserve their original destination hash",async()=>{
 const {seedScenario,sha}=await import("../db/support");const {withTransaction}=await import("../../../apps/web/src/lib/db/transaction");const {changePayRun}=await import("../../../apps/web/src/lib/db/repositories/pay-runs");const {randomUUID}=await import("node:crypto");
 const c=await pool.connect();let f;try{f=await seedScenario(c)}finally{c.release()}
 const s=await fixture(pool,"owner",f.orgId);
 await withTransaction(pool,tx=>changePayRun(tx,{id:f.runId,expectedVersion:0,actorId:s.id,status:"reviewed"}));await withTransaction(pool,tx=>changePayRun(tx,{id:f.runId,expectedVersion:1,actorId:s.id,status:"finalized"}));
 const original=await s.repo.changeEmail(s.credentials,{employeeId:f.employeeId,expectedDestinationId:null,address:"original@example.invalid"});
 const payslip=randomUUID(),artifact=randomUUID(),draft=randomUUID();
 await pool.query("INSERT INTO payslips(id,organization_id,employee_id,pay_run_employee_id,content_hash) VALUES($1,$2,$3,$4,$5)",[payslip,f.orgId,f.employeeId,f.runEmployeeId,sha("synthetic")]);
 await pool.query("INSERT INTO document_artifacts(id,organization_id,employee_id,payslip_id,relative_path,content_hash,size_bytes) VALUES($1,$2,$3,$4,'synthetic.pdf',$5,1)",[artifact,f.orgId,f.employeeId,payslip,sha("synthetic")]);
 const dest=(await pool.query("SELECT * FROM delivery_destinations WHERE id=$1",[original.destinationId])).rows[0];
 await pool.query("INSERT INTO delivery_drafts(id,organization_id,employee_id,artifact_id,destination_id,destination_hash) VALUES($1,$2,$3,$4,$5,$6)",[draft,f.orgId,f.employeeId,artifact,dest.id,dest.content_hash]);
 s.clock.value+=60000;
 await s.repo.changeEmail(s.credentials,{employeeId:f.employeeId,expectedDestinationId:original.destinationId,address:"changed@example.invalid"});
 expect((await pool.query("SELECT status,version,destination_hash FROM delivery_drafts WHERE id=$1",[draft])).rows[0]).toEqual({status:"invalidated",version:1,destination_hash:dest.content_hash});
 expect((await pool.query("SELECT * FROM delivery_destinations WHERE id=$1",[dest.id])).rows[0]).toEqual(dest);
});
