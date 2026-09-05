import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import { appPool, seedScenario, sha, waitUntilBlocked } from "./support";

let pool: Pool;
beforeAll(async () => { pool = appPool(); });
afterAll(async () => { await pool.end(); });
async function fresh() { const client = await pool.connect(); try { return await seedScenario(client); } finally { client.release(); } }
async function rejectCode(action: Promise<unknown>, code: string) { await expect(action).rejects.toMatchObject({ code }); }

async function employeeWithoutTerms(client: PoolClient, organizationId: string, workplaceId: string) {
  const employeeId = randomUUID();
  const contractId = randomUUID();
  await client.query("INSERT INTO employees (id, organization_id, workplace_id, display_name) VALUES ($1, $2, $3, $4)", [employeeId, organizationId, workplaceId, "Synthetic Effective Employee"]);
  await client.query("INSERT INTO employment_contracts (id, organization_id, employee_id, kind, valid_from, valid_to) VALUES ($1, $2, $3, 'full_time', '2026-01-01Z', '2027-01-01Z')", [contractId, organizationId, employeeId]);
  return { employeeId, contractId };
}
function values(orgId: string, employeeId: string, contractId: string, from: string, to: string) {
  const payload = `{"kind":"synthetic-compensation","from":"${from}","to":"${to}"}`;
  return [randomUUID(), orgId, employeeId, contractId, 8_000_000, from, to, payload, sha(payload)];
}
const insertTerm = (client: PoolClient, data: unknown[]) => client.query(
  "INSERT INTO compensation_terms (id, organization_id, employee_id, contract_id, monthly_salary_vnd, valid_from, valid_to, canonical_payload, content_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", data,
);

describe("DB01 effective compensation terms", () => {
  it("rejects overlap, accepts adjacent half-open intervals, and permits only one of two concurrent overlaps", async () => {
    const fixture = await fresh();
    const client = await pool.connect();
    try {
      const own = await employeeWithoutTerms(client, fixture.orgId, fixture.workplaceId);
      await insertTerm(client, values(fixture.orgId, own.employeeId, own.contractId, "2026-03-01Z", "2026-04-01Z"));
      await insertTerm(client, values(fixture.orgId, own.employeeId, own.contractId, "2026-04-01Z", "2026-05-01Z"));
      await rejectCode(insertTerm(client, values(fixture.orgId, own.employeeId, own.contractId, "2026-03-15Z", "2026-04-15Z")), "23P01");
    } finally { client.release(); }

    const left = await pool.connect();
    const right = await pool.connect();
    try {
      const own = await employeeWithoutTerms(left, fixture.orgId, fixture.workplaceId);
      await left.query("BEGIN");
      await right.query("BEGIN");
      await insertTerm(left, values(fixture.orgId, own.employeeId, own.contractId, "2026-06-01Z", "2026-07-01Z"));
      const writerPid=(await right.query("SELECT pg_backend_pid() pid")).rows[0].pid;
      const conflicting = insertTerm(right, values(fixture.orgId, own.employeeId, own.contractId, "2026-06-15Z", "2026-07-15Z"));
      const conflictAssertion=rejectCode(conflicting,"23P01");
      await waitUntilBlocked(pool,writerPid);
      await left.query("COMMIT");
      await conflictAssertion;
      await right.query("ROLLBACK");
    } finally { await left.query("ROLLBACK"); await right.query("ROLLBACK"); left.release(); right.release(); }
  });
});
describe("DB01 all effective version families", () => {
  it("accepts adjacent ranges and rejects overlaps for contracts, hours, schedules, destinations and policies", async () => {
    const f = await fresh(); const c = await pool.connect();
    try {
      const templateId=randomUUID();
      await c.query("INSERT INTO schedule_templates(id,organization_id,name,canonical_payload,content_hash) VALUES($1,$2,'synthetic','{}',$3)",[templateId,f.orgId,sha("{}")]);
      const families: {table:string; columns:string[]; fixed:unknown[]}[] = [
        {table:"employment_contracts",columns:["organization_id","employee_id","kind"],fixed:[f.orgId,f.employeeId,"full_time"]},
        {table:"opening_hour_versions",columns:["organization_id","workplace_id","canonical_payload","content_hash"],fixed:[f.orgId,f.workplaceId,"{}",sha("{}")]},
        {table:"schedule_assignments",columns:["organization_id","workplace_id","employee_id","template_id"],fixed:[f.orgId,f.workplaceId,f.employeeId,templateId]},
        {table:"delivery_destinations",columns:["organization_id","employee_id","channel","address","canonical_payload","content_hash"],fixed:[f.orgId,f.employeeId,"email","synthetic@example.invalid","{}",sha("{}")]},
        {table:"minimum_wages",columns:["organization_id","rule_pack_id","region","monthly_vnd","hourly_vnd"],fixed:[f.orgId,f.rulePackId,"synthetic",1,1]},
        ...["insurance_policies","pit_policies","earning_component_policies"].map(table=>({table,columns:["organization_id","rule_pack_id","policy_key","canonical_payload","content_hash"],fixed:[f.orgId,f.rulePackId,"synthetic","{}",sha("{}")]}))
      ];
      for(const family of families) {
        // Identifiers are a fixed test-owned allowlist; all values remain bound.
        const columns=["id",...family.columns,"valid_from","valid_to"];
        const sql="INSERT INTO "+family.table+"("+columns.join(",")+") VALUES("+columns.map((_,i)=>"$"+(i+1)).join(",")+")";
        await c.query(sql,[randomUUID(),...family.fixed,"2027-01-01T00:00:00Z","2027-02-01T00:00:00Z"]);
        await c.query(sql,[randomUUID(),...family.fixed,"2027-02-01T00:00:00Z","2027-03-01T00:00:00Z"]);
        await expect(c.query(sql,[randomUUID(),...family.fixed,"2027-01-15T00:00:00Z","2027-02-15T00:00:00Z"])).rejects.toMatchObject({code:"23P01"});
      }
    } finally {c.release();}
  });
});
