import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { appPool, seedScenario, sha, waitUntilBlocked } from "./support";

let pool: Pool;
beforeAll(async () => { pool = appPool(); });
afterAll(async () => { await pool.end(); });
async function fresh() { const client = await pool.connect(); try { return await seedScenario(client); } finally { client.release(); } }
async function rejectCode(action: Promise<unknown>, code: string) { await expect(action).rejects.toMatchObject(code === "IMMUTABLE_RECORD" ? { code: "55000", message: expect.stringContaining("IMMUTABLE_RECORD") } : { code }); }

describe("DB02 raw clock events", () => {
  it("replays identical scoped requests, rejects changed requests, and denies direct mutation", async () => {
    const { withTransaction } = await import("../../../apps/web/src/lib/db/transaction");
    const { recordClockEvent } = await import("../../../apps/web/src/lib/db/repositories/clock-events");
    const fixture = await fresh(); const key = `clock-${randomUUID()}`; const id = randomUUID(); const occurredAt = new Date("2026-09-02T08:00:00.123Z");
    const first = await withTransaction(pool, (tx) => recordClockEvent(tx, { id, organizationId: fixture.orgId, workplaceId: fixture.workplaceId, employeeId: fixture.employeeId, idempotencyKey: key, direction: "IN", occurredAt }));
    const replay = await withTransaction(pool, (tx) => recordClockEvent(tx, { id: randomUUID(), organizationId: fixture.orgId, workplaceId: fixture.workplaceId, employeeId: fixture.employeeId, idempotencyKey: key, direction: "IN", occurredAt }));
    expect(replay).toEqual(first);
    await rejectCode(withTransaction(pool, (tx) => recordClockEvent(tx, { id: randomUUID(), organizationId: fixture.orgId, workplaceId: fixture.workplaceId, employeeId: fixture.employeeId, idempotencyKey: key, direction: "OUT", occurredAt })), "IDEMPOTENCY_CONFLICT");
    const client = await pool.connect(); try { await rejectCode(client.query("UPDATE clock_events SET direction = 'OUT' WHERE id = $1", [id]), "42501"); } finally { client.release(); }
  });
});

describe("DB03 approved snapshots", () => {
  it("preserves exact canonical bytes and hash and denies direct update or deletion", async () => {
    const fixture = await fresh(); const client = await pool.connect();
    try {
      const result = await client.query<{canonical_payload:string;content_hash:string;organization_id:string;workplace_id:string;employee_id:string}>("SELECT canonical_payload, content_hash, organization_id, workplace_id, employee_id FROM attendance_snapshots WHERE id = $1", [fixture.snapshotId]);
      expect(result.rows).toEqual([{ canonical_payload: "{}", content_hash: fixture.snapshotHash, organization_id: fixture.orgId, workplace_id: fixture.workplaceId, employee_id: fixture.employeeId }]);
      expect(sha(result.rows[0]!.canonical_payload)).toBe(result.rows[0]!.content_hash);
      await rejectCode(client.query("UPDATE attendance_snapshots SET canonical_payload = '{}' WHERE id = $1", [fixture.snapshotId]), "42501");
      await rejectCode(client.query("DELETE FROM attendance_snapshots WHERE id = $1", [fixture.snapshotId]), "42501");
    } finally { client.release(); }
  });
});

describe("DB05, DB10 and DB12 finalized child history", () => {
  it("serializes finalization against child writes and blocks late inserts, reassignments, and referenced-term mutations", async () => {
    const { withTransaction } = await import("../../../apps/web/src/lib/db/transaction");
    const { changePayRun } = await import("../../../apps/web/src/lib/db/repositories/pay-runs");
    const fixture = await fresh();
    const initial = Number((await pool.query<{version:number}>("SELECT version FROM pay_runs WHERE id = $1", [fixture.runId])).rows[0]!.version);
    await withTransaction(pool, (tx) => changePayRun(tx, { id: fixture.runId, expectedVersion: initial, actorId: fixture.ownerId, status: "reviewed" }));
    const finalizer = await pool.connect(); const writer = await pool.connect();
    try {
      await finalizer.query("BEGIN");
      await finalizer.query("SELECT id FROM pay_runs WHERE id = $1 FOR UPDATE", [fixture.runId]);
      await changePayRun(finalizer, { id: fixture.runId, expectedVersion: initial + 1, actorId: fixture.ownerId, status: "finalized" });
      const writerPid=(await writer.query("SELECT pg_backend_pid() pid")).rows[0].pid;
      const lateWrite = writer.query("INSERT INTO calculation_lines (id, pay_run_employee_id, code, amount_vnd) VALUES ($1,$2,$3,$4)", [randomUUID(), fixture.runEmployeeId, "RACE", 1]);
      const lateAssertion=rejectCode(lateWrite,"IMMUTABLE_RECORD");
      await waitUntilBlocked(pool,writerPid);
      await finalizer.query("COMMIT");
      await lateAssertion;
    } finally { await finalizer.query("ROLLBACK"); finalizer.release(); writer.release(); }
    const client = await pool.connect();
    try {
      await rejectCode(client.query("INSERT INTO calculation_lines (id, pay_run_employee_id, code, amount_vnd) VALUES ($1,$2,$3,$4)", [randomUUID(), fixture.runEmployeeId, "LATE", 1]), "IMMUTABLE_RECORD");
      const alternateRun = randomUUID();
      await client.query("INSERT INTO pay_runs (id, organization_id, workplace_id, status, version, evidence_mode, period_start, period_end) VALUES ($1,$2,$3,'draft',0,'synthetic','2026-10-01T00:00:00Z','2026-11-01T00:00:00Z')", [alternateRun, fixture.orgId, fixture.workplaceId]);
      await rejectCode(client.query("UPDATE pay_run_employees SET pay_run_id = $2 WHERE id = $1", [fixture.runEmployeeId, alternateRun]), "IMMUTABLE_RECORD");
      await rejectCode(client.query("UPDATE compensation_terms SET monthly_salary_vnd = monthly_salary_vnd + 1 WHERE id = $1", [fixture.compensationId]), "IMMUTABLE_RECORD");
    } finally { client.release(); }
  });
});
describe("DB05/DB09/DB10 replayable document and payroll history", () => {
  it("retains finalized rows and destination versions and denies append-only table mutation", async () => {
    const {withTransaction}=await import("../../../apps/web/src/lib/db/transaction");
    const {changePayRun}=await import("../../../apps/web/src/lib/db/repositories/pay-runs");
    const f=await fresh(); const c=await pool.connect();
    try {
      const lineId=randomUUID();
      await c.query("INSERT INTO calculation_lines(id,pay_run_employee_id,code,amount_vnd) VALUES($1,$2,'synthetic',9007199254740993)",[lineId,f.runEmployeeId]);
      expect((await c.query("SELECT amount_vnd FROM calculation_lines WHERE id=$1",[lineId])).rows[0].amount_vnd).toBe("9007199254740993");
      await withTransaction(pool,tx=>changePayRun(tx,{id:f.runId,expectedVersion:0,actorId:f.ownerId,status:"reviewed"}));
      await withTransaction(pool,tx=>changePayRun(tx,{id:f.runId,expectedVersion:1,actorId:f.ownerId,status:"finalized"}));
      for(const [table,id] of [["pay_runs",f.runId],["pay_run_employees",f.runEmployeeId],["calculation_lines",lineId]]){
        await rejectCode(c.query("UPDATE "+table+" SET id=id WHERE id=$1",[id]),"IMMUTABLE_RECORD");
        await rejectCode(c.query("DELETE FROM "+table+" WHERE id=$1",[id]),"IMMUTABLE_RECORD");
      }
      const payslipId=randomUUID(),artifactId=randomUUID(),destinationId=randomUUID(),draftId=randomUUID();
      await c.query("INSERT INTO payslips(id,organization_id,employee_id,pay_run_employee_id,content_hash) VALUES($1,$2,$3,$4,$5)",[payslipId,f.orgId,f.employeeId,f.runEmployeeId,sha("synthetic")]);
      await c.query("INSERT INTO document_artifacts(id,organization_id,employee_id,payslip_id,relative_path,content_hash,size_bytes) VALUES($1,$2,$3,$4,'synthetic.pdf',$5,1)",[artifactId,f.orgId,f.employeeId,payslipId,sha("synthetic")]);
      await c.query("INSERT INTO delivery_destinations(id,organization_id,employee_id,channel,address,valid_from,valid_to,canonical_payload,content_hash) VALUES($1,$2,$3,'email','synthetic@example.invalid','2026-01-01T00:00:00Z','2027-01-01T00:00:00Z','{}',$4)",[destinationId,f.orgId,f.employeeId,sha("{}")]);
      await c.query("INSERT INTO delivery_drafts(id,organization_id,employee_id,artifact_id,destination_id,destination_hash) VALUES($1,$2,$3,$4,$5,$6)",[draftId,f.orgId,f.employeeId,artifactId,destinationId,sha("{}")]);
      await c.query("INSERT INTO delivery_attempts(id,organization_id,draft_id,attempt_number,outcome) VALUES($1,$2,$3,1,'unknown')",[randomUUID(),f.orgId,draftId]);
      await c.query("INSERT INTO approval_events(id,organization_id,pay_run_id,actor_id,action) VALUES($1,$2,$3,$4,'synthetic')",[randomUUID(),f.orgId,f.runId,f.ownerId]);
      await rejectCode(c.query("UPDATE delivery_destinations SET address='changed@example.invalid' WHERE id=$1",[destinationId]),"IMMUTABLE_RECORD");
      await rejectCode(c.query("DELETE FROM delivery_destinations WHERE id=$1",[destinationId]),"IMMUTABLE_RECORD");
      await rejectCode(c.query("DELETE FROM compensation_terms WHERE id=$1",[f.compensationId]),"IMMUTABLE_RECORD");
      for(const table of ["clock_events","attendance_snapshots","legal_rule_packs","payslips","document_artifacts","delivery_attempts","approval_events","audit_events"]){
        await rejectCode(c.query("UPDATE "+table+" SET id=id"),"42501");
        await rejectCode(c.query("DELETE FROM "+table),"42501");
        await rejectCode(c.query("TRUNCATE "+table),"42501");
      }
      await expect(c.query("ALTER TABLE clock_events DISABLE TRIGGER ALL")).rejects.toMatchObject({code:"42501"});
    } finally {c.release();}
  });
});
