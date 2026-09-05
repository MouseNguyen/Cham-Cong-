import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { appPool, seedScenario, sha } from "./support";

let pool: Pool;

beforeAll(async () => {
  pool = await appPool();
});

afterAll(async () => {
  await pool.end();
});

async function scenario() {
  const client = await pool.connect();
  try {
    return await seedScenario(client);
  } finally {
    client.release();
  }
}

async function expectCode(action: Promise<unknown>, code: string): Promise<void> {
  await expect(action).rejects.toMatchObject({ code });
}

describe("DB04 synthetic legal rule packs", () => {
  it("keeps test-only packs draft and prevents direct promotion by the application role", async () => {
    const fixture = await scenario();
    const client = await pool.connect();
    try {
      const result = await client.query<{ status: string; evidence_mode: string }>(
        "SELECT status, evidence_mode FROM legal_rule_packs WHERE id = $1", [fixture.rulePackId],
      );
      expect(result.rows).toEqual([{ status: "draft", evidence_mode: "synthetic" }]);
      await expectCode(
        client.query("UPDATE legal_rule_packs SET status = 'released' WHERE id = $1", [fixture.rulePackId]),
        "42501",
      );
    } finally {
      client.release();
    }
  });
});

describe("DB06 immutable input bindings", () => {
  it("persists matching scope and hashes, and rejects a pay-run employee with a mismatched compensation hash", async () => {
    const fixture = await scenario();
    const client = await pool.connect();
    try {
      const stored = await client.query<{
        organization_id: string; workplace_id: string; employee_id: string; snapshot_id: string; snapshot_hash: string;
        compensation_id: string; compensation_hash: string; rule_pack_id: string; rule_pack_hash: string;
      }>(
        `SELECT pr.organization_id, pre.workplace_id, pre.employee_id, pre.snapshot_id, pre.snapshot_hash,
                pre.compensation_id, pre.compensation_hash, pre.rule_pack_id, pre.rule_pack_hash
         FROM pay_run_employees pre JOIN pay_runs pr ON pr.id = pre.pay_run_id WHERE pre.id = $1`,
        [fixture.runEmployeeId],
      );
      expect(stored.rows).toEqual([{
        organization_id: fixture.orgId, workplace_id: fixture.workplaceId, employee_id: fixture.employeeId,
        snapshot_id: fixture.snapshotId, snapshot_hash: fixture.snapshotHash,
        compensation_id: fixture.compensationId, compensation_hash: fixture.compensationHash,
        rule_pack_id: fixture.rulePackId, rule_pack_hash: fixture.ruleHash,
      }]);

      await expectCode(client.query("UPDATE pay_run_employees SET compensation_hash=$2 WHERE id=$1", [fixture.runEmployeeId, sha("incorrect-compensation")]), "23503");
    } finally {
      client.release();
    }
  });
});

describe("DB09 append-only audit history", () => {
  it("does not grant the application role update or delete access to audit records", async () => {
    const fixture = await scenario();
    const client = await pool.connect();
    try {
      await expectCode(client.query(
        "UPDATE audit_events SET action = 'tampered' WHERE aggregate_id = $1", [fixture.runId],
      ), "42501");
      await expectCode(client.query("DELETE FROM audit_events WHERE aggregate_id = $1", [fixture.runId]), "42501");
    } finally {
      client.release();
    }
  });
});
describe("DB03/DB04/DB06 hostile bindings", () => {
  it("rejects forged bytes, employee/workplace/hash references and synthetic production promotion", async () => {
    const f=await scenario(); const c=await pool.connect();
    try {
      for(const [column,value] of [["snapshot_hash",sha("wrong")],["rule_pack_hash",sha("wrong")],["employee_id",randomUUID()],["workplace_id",randomUUID()]]){
        await expect(c.query("UPDATE pay_run_employees SET "+column+"=$2 WHERE id=$1",[f.runEmployeeId,value])).rejects.toMatchObject({code:"23503"});
      }
      await expect(c.query("INSERT INTO legal_rule_packs(id,organization_id,status,canonical_payload,content_hash,evidence_mode) VALUES($1,$2,'draft','{}',$3,'synthetic')",[randomUUID(),f.orgId,sha("wrong")])).rejects.toMatchObject({code:"23514"});
      await expect(c.query("INSERT INTO legal_rule_packs(id,organization_id,status,canonical_payload,content_hash,evidence_mode) VALUES($1,$2,'released','{}',$3,'production')",[randomUUID(),f.orgId,sha("{}")])).rejects.toMatchObject({code:"23514"});
      await expect(c.query("INSERT INTO pay_runs(id,organization_id,workplace_id,evidence_mode,period_start,period_end) VALUES($1,$2,$3,'production','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z')",[randomUUID(),f.orgId,f.workplaceId])).rejects.toMatchObject({code:"23514"});
      await expect(c.query("UPDATE pay_run_employees SET canonical_result='tampered' WHERE id=$1",[f.runEmployeeId])).rejects.toMatchObject({code:"23514"});
    } finally {c.release();}
  });
});
