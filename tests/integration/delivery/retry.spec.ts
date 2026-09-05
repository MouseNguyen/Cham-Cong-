import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Pool } from "pg";
import { appPool, scenario, startTime } from "./support";
import { withTransaction } from "../../../apps/web/src/lib/db/transaction";
let pool:Pool;
beforeAll(()=>{pool=appPool();});
afterAll(async()=>{await pool.end();});
async function setup(){
 const {enqueueSyntheticVerification}=await import("../../../apps/web/src/lib/delivery/outbox");
 const f=await scenario(pool);
 const job=await withTransaction(pool,tx=>enqueueSyntheticVerification(tx,{organizationId:f.orgId,employeeId:f.employeeId,destinationId:f.destinationId,idempotencyKey:randomUUID(),now:startTime}));
 return {...f,...job};
}
it("backs off definite failures and stops after three sends",async()=>{
 const {runOne}=await import("../../../apps/web/src/lib/delivery/worker");
 const {createFakeAdapter}=await import("../../../apps/web/src/lib/delivery/fake-adapter");
 const f=await setup(),adapter=createFakeAdapter({sendOutcomes:["definitely_failed","definitely_failed","definitely_failed"]});
 let time=new Date(startTime);
 const options={pool,adapter,organizationId:f.orgId,workerId:"retry",clock:()=>time,leaseMs:1000};
 await runOne(options);
 expect((await pool.query("SELECT status FROM outbox_dispatches WHERE job_id=$1",[f.jobId])).rows[0].status).toBe("retry_wait");
 await runOne(options);expect(adapter.sendCount).toBe(1);
 time=new Date(startTime.getTime()+1000);await runOne(options);
 time=new Date(startTime.getTime()+3000);await runOne(options);
 expect(adapter.sendCount).toBe(3);
 expect((await pool.query("SELECT status FROM outbox_dispatches WHERE job_id=$1",[f.jobId])).rows[0].status).toBe("dead_letter");
});
it("reconciles fake acceptance after a lost worker result without another send",async()=>{
 const {claimNext}=await import("../../../apps/web/src/lib/delivery/outbox");
 const {runOne}=await import("../../../apps/web/src/lib/delivery/worker");
 const {createFakeAdapter}=await import("../../../apps/web/src/lib/delivery/fake-adapter");
 const f=await setup(),adapter=createFakeAdapter();
 const lease=await withTransaction(pool,tx=>claimNext(tx,{organizationId:f.orgId,workerId:"lost",now:startTime,leaseMs:1000}));
 expect((await adapter.send(lease!.message)).kind).toBe("accepted");
 // Simulated process loss: do not persist send result; provider receipt survives.
 await runOne({pool,adapter,organizationId:f.orgId,workerId:"recovery",clock:()=>new Date(startTime.getTime()+1001),leaseMs:1000});
 expect(adapter.sendCount).toBe(1);expect(adapter.reconcileCount).toBe(1);
 expect((await pool.query("SELECT status FROM outbox_dispatches WHERE job_id=$1",[f.jobId])).rows[0].status).toBe("accepted");
});
it("never blindly resends an unknown outcome and bounds reconciliation",async()=>{
 const {runOne}=await import("../../../apps/web/src/lib/delivery/worker");
 const {createFakeAdapter}=await import("../../../apps/web/src/lib/delivery/fake-adapter");
 const f=await setup(),adapter=createFakeAdapter({sendOutcomes:["unknown"],reconcileOutcomes:["unknown","unknown","unknown"]});
 for(let i=0;i<4;i++)await runOne({pool,adapter,organizationId:f.orgId,workerId:"unknown",clock:()=>new Date(startTime.getTime()+i*1000),leaseMs:1000});
 expect(adapter.sendCount).toBe(1);expect(adapter.reconcileCount).toBe(3);
 expect((await pool.query("SELECT status FROM outbox_dispatches WHERE job_id=$1",[f.jobId])).rows[0].status).toBe("dead_letter");
});

it("resends only after authoritative absence and keeps the same immutable envelope", async () => {
 const {runOne}=await import("../../../apps/web/src/lib/delivery/worker");
 const {createFakeAdapter}=await import("../../../apps/web/src/lib/delivery/fake-adapter");
 const f=await setup(),adapter=createFakeAdapter({sendOutcomes:["unknown","accepted"],reconcileOutcomes:["not_found"]});
 for(const elapsed of [0,1000,2000])await runOne({pool,adapter,organizationId:f.orgId,workerId:"absence",clock:()=>new Date(startTime.getTime()+elapsed),leaseMs:1000});
 expect(adapter.sendCount).toBe(2);expect(adapter.reconcileCount).toBe(1);
 const row=(await pool.query("SELECT status,send_attempts,provider_reference FROM outbox_dispatches WHERE job_id=$1",[f.jobId])).rows[0];
 expect(row).toEqual({status:"accepted",send_attempts:2,provider_reference:"fake-"+f.jobId});
 expect((await pool.query("SELECT phase,event,outcome FROM outbox_dispatch_attempts WHERE job_id=$1 ORDER BY generation,event",[f.jobId])).rows).toEqual([
  {phase:"send",event:"claim",outcome:"claimed"},{phase:"send",event:"result",outcome:"unknown"},
  {phase:"reconcile",event:"claim",outcome:"claimed"},{phase:"reconcile",event:"result",outcome:"not_found"},
  {phase:"send",event:"claim",outcome:"claimed"},{phase:"send",event:"result",outcome:"accepted"}]);
});
it("treats fake provider ledger loss as unknown and validates one neutral recipient",async()=>{
 const {createFakeAdapter}=await import("../../../apps/web/src/lib/delivery/fake-adapter");
 const {BODY,SUBJECT}=await import("../../../apps/web/src/lib/delivery/types");
 const message={jobId:randomUUID(),idempotencyKey:randomUUID(),to:"synthetic@example.invalid",subject:SUBJECT,body:BODY};
 const first=createFakeAdapter();
 expect((await first.send(message)).kind).toBe("accepted");
 expect(await createFakeAdapter().reconcile(message)).toEqual({kind:"unknown"});
 await expect(first.send({...message,to:"synthetic@example.com"})).rejects.toMatchObject({code:"SYNTHETIC_ONLY"});
 await expect(first.send({...message,to:"other@example.invalid"})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
 await expect(first.send({...message,body:"salary"})).rejects.toMatchObject({code:"SYNTHETIC_ONLY"});
});
