import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Pool } from "pg";
import { appPool, scenario, startTime } from "./support";
import { withTransaction } from "../../../apps/web/src/lib/db/transaction";
let pool:Pool;
beforeAll(()=>{pool=appPool();});
afterAll(async()=>{await pool.end();});
it("atomically queues a synthetic notification without requiring a finalized pay run",async()=>{
 const {enqueueSyntheticVerification}=await import("../../../apps/web/src/lib/delivery/outbox");
 const f=await scenario(pool),key=randomUUID();
 const input={organizationId:f.orgId,employeeId:f.employeeId,destinationId:f.destinationId,idempotencyKey:key,now:startTime};
 await expect(withTransaction(pool,async tx=>{await enqueueSyntheticVerification(tx,input);throw new Error("injected");})).rejects.toThrow("injected");
 expect((await pool.query("SELECT count(*)::int n FROM outbox_jobs WHERE organization_id=$1",[f.orgId])).rows[0].n).toBe(0);
 const first=await withTransaction(pool,tx=>enqueueSyntheticVerification(tx,input));
 expect(await withTransaction(pool,tx=>enqueueSyntheticVerification(tx,input))).toEqual(first);
 const row=(await pool.query("SELECT j.pay_run_id,j.kind,d.status FROM outbox_jobs j JOIN outbox_dispatches d ON d.job_id=j.id WHERE j.id=$1",[first.jobId])).rows[0];
 expect(row).toEqual({pay_run_id:null,kind:"synthetic_email_verification",status:"pending"});
});
it("rejects cross-identity destinations and protects referenced destination history",async()=>{
 const {enqueueSyntheticVerification}=await import("../../../apps/web/src/lib/delivery/outbox");
 const f=await scenario(pool),other=await scenario(pool);
 await expect(withTransaction(pool,tx=>enqueueSyntheticVerification(tx,{organizationId:f.orgId,employeeId:f.employeeId,destinationId:other.destinationId,idempotencyKey:randomUUID(),now:startTime}))).rejects.toMatchObject({code:"DESTINATION_MISMATCH"});
 await withTransaction(pool,tx=>enqueueSyntheticVerification(tx,{organizationId:f.orgId,employeeId:f.employeeId,destinationId:f.destinationId,idempotencyKey:randomUUID(),now:startTime}));
 await expect(pool.query("UPDATE delivery_destinations SET address='changed@example.invalid' WHERE id=$1",[f.destinationId])).rejects.toMatchObject({code:"55000"});
});
it("rejects a changed replay and forbids real-domain addresses in the fake queue",async()=>{
 const {enqueueSyntheticVerification}=await import("../../../apps/web/src/lib/delivery/outbox");
 const f=await scenario(pool),other=await scenario(pool),key=randomUUID();
 await withTransaction(pool,tx=>enqueueSyntheticVerification(tx,{organizationId:f.orgId,employeeId:f.employeeId,destinationId:f.destinationId,idempotencyKey:key,now:startTime}));
 // Existing key cannot be silently rebound to another employee.
 await expect(withTransaction(pool,tx=>enqueueSyntheticVerification(tx,{organizationId:f.orgId,employeeId:other.employeeId,destinationId:other.destinationId,idempotencyKey:key,now:startTime}))).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
 const bad=await scenario(pool);
 await pool.query("UPDATE delivery_destinations SET address='synthetic@example.com' WHERE id=$1",[bad.destinationId]);
 await expect(withTransaction(pool,tx=>enqueueSyntheticVerification(tx,{organizationId:bad.orgId,employeeId:bad.employeeId,destinationId:bad.destinationId,idempotencyKey:randomUUID(),now:startTime}))).rejects.toMatchObject({code:"SYNTHETIC_ONLY"});
});
