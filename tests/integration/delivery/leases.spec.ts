import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Pool } from "pg";
import { appPool, scenario, startTime } from "./support";
import { withTransaction } from "../../../apps/web/src/lib/db/transaction";
let pool:Pool;
beforeAll(()=>{pool=appPool();});
afterAll(async()=>{await pool.end();});
it("uses SKIP LOCKED so two real sessions cannot claim the same pending job",async()=>{
 const {enqueueSyntheticVerification,claimNext}=await import("../../../apps/web/src/lib/delivery/outbox");
 const f=await scenario(pool);
 await withTransaction(pool,tx=>enqueueSyntheticVerification(tx,{organizationId:f.orgId,employeeId:f.employeeId,destinationId:f.destinationId,idempotencyKey:randomUUID(),now:startTime}));
 const first=await pool.connect(),second=await pool.connect();
 try{
  await first.query("BEGIN");await second.query("BEGIN");
  const claim=await claimNext(first,{organizationId:f.orgId,workerId:"first",now:startTime,leaseMs:1000});
  expect(claim?.phase).toBe("send");
  // First transaction intentionally retains its row lock during second SELECT.
  expect(await claimNext(second,{organizationId:f.orgId,workerId:"second",now:startTime,leaseMs:1000})).toBeNull();
  await second.query("COMMIT");await first.query("COMMIT");
 } finally {await first.query("ROLLBACK");await second.query("ROLLBACK");first.release();second.release();}
});
it("reconciles expired send leases and rejects stale-worker completion",async()=>{
 const {enqueueSyntheticVerification,claimNext,finishAttempt}=await import("../../../apps/web/src/lib/delivery/outbox");
 const f=await scenario(pool);
 await withTransaction(pool,tx=>enqueueSyntheticVerification(tx,{organizationId:f.orgId,employeeId:f.employeeId,destinationId:f.destinationId,idempotencyKey:randomUUID(),now:startTime}));
 const old=await withTransaction(pool,tx=>claimNext(tx,{organizationId:f.orgId,workerId:"old",now:startTime,leaseMs:1000}));
 const later=new Date(startTime.getTime()+1001);
 const fresh=await withTransaction(pool,tx=>claimNext(tx,{organizationId:f.orgId,workerId:"new",now:later,leaseMs:1000}));
 expect(fresh?.phase).toBe("reconcile");
 await expect(withTransaction(pool,tx=>finishAttempt(tx,old!,{kind:"accepted",reference:"fake-old"},later))).rejects.toMatchObject({code:"LEASE_CONFLICT"});
 await withTransaction(pool,tx=>finishAttempt(tx,fresh!,{kind:"accepted",reference:"fake-new"},later));
 await expect(pool.query("UPDATE outbox_dispatch_attempts SET id=id")).rejects.toMatchObject({code:"42501"});
 await expect(pool.query("DELETE FROM outbox_dispatch_attempts")).rejects.toMatchObject({code:"42501"});
});

it("bounds abandoned reconciliation leases and rejects calls without an explicit transaction",async()=>{
 const {enqueueSyntheticVerification,claimNext}=await import("../../../apps/web/src/lib/delivery/outbox");
 const f=await scenario(pool);
 const client=await pool.connect();
 try {await expect(enqueueSyntheticVerification(client,{organizationId:f.orgId,employeeId:f.employeeId,destinationId:f.destinationId,idempotencyKey:randomUUID(),now:startTime})).rejects.toMatchObject({code:"25P01"});}
 finally {client.release();}
 const job=await withTransaction(pool,tx=>enqueueSyntheticVerification(tx,{organizationId:f.orgId,employeeId:f.employeeId,destinationId:f.destinationId,idempotencyKey:randomUUID(),now:startTime}));
 for(let i=0;i<4;i++){
  const lease=await withTransaction(pool,tx=>claimNext(tx,{organizationId:f.orgId,workerId:"abandoned",now:new Date(startTime.getTime()+i*1001),leaseMs:1000}));
  expect(lease?.phase).toBe(i===0?"send":"reconcile");
 }
 expect(await withTransaction(pool,tx=>claimNext(tx,{organizationId:f.orgId,workerId:"last",now:new Date(startTime.getTime()+4004),leaseMs:1000}))).toBeNull();
 expect((await pool.query("SELECT status,send_attempts,reconcile_attempts FROM outbox_dispatches WHERE job_id=$1",[job.jobId])).rows[0]).toEqual({status:"dead_letter",send_attempts:1,reconcile_attempts:3});
});
