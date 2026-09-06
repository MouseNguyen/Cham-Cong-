import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { authForFixture, calculatorContext, credentials, expectedW1Calculation, fixture, hash, payRunPool, sourceBinding } from "./support";

let pool: Pool;
beforeAll(() => { pool = payRunPool(); });
afterAll(async () => { await pool.end(); });

it("persists actual W1 output from immutable bindings and keeps the finalized synthetic result non-production", async () => {
  const client = await pool.connect(); let f;
  try { f = await fixture(client); } finally { client.release(); }
  const { PayRunRepository } = await import("../../../apps/web/src/lib/db/repositories/pay-runs");
  const repo = new PayRunRepository(pool, authForFixture(pool, f), { organizationId: f.organizationId, now: () => new Date("2026-09-05T00:05:00Z"), calculator: calculatorContext(f) });
  const expected = expectedW1Calculation(f);
  const expectedStoredTrace = (JSON.parse(expected.canonicalResult) as { trace: unknown }).trace;
  const created = await repo.create(credentials(f, "accountant"), { workplaceId: f.workplaceId, periodStart: "2026-08-31T17:00:00.000Z", periodEnd: "2026-09-30T17:00:00.000Z" });
  const calculated = await repo.calculate(credentials(f, "accountant"), { payRunId: created.id, expectedVersion: created.version, sources: [sourceBinding(f)] });
  const before = await repo.get(credentials(f, "accountant"), created.id);
  expect(before.employees[0]?.canonical_result).toBe(expected.canonicalResult);
  expect(before.employees[0]?.result_hash).toBe(expected.resultSha256);
  const submitted = await repo.submit(credentials(f, "accountant"), { payRunId: created.id, expectedVersion: calculated.version });
  const approved = await repo.approve(credentials(f, "owner"), { payRunId: created.id, expectedVersion: submitted.version });
  const finalized = await repo.finalize(credentials(f, "owner"), { payRunId: created.id, expectedVersion: approved.version });
  expect(finalized.productionReady).toBe(false);
  const laterCompensation = '{"basis":"monthly_salary","monthlySalaryVnd":"9000000"}';
  await pool.query("INSERT INTO compensation_terms(id,organization_id,employee_id,contract_id,monthly_salary_vnd,valid_from,valid_to,canonical_payload,content_hash) VALUES($1,$2,$3,$4,9000000,'2027-01-01T00:00:00Z','2028-01-01T00:00:00Z',$5,$6)", [randomUUID(), f.organizationId, f.employeeId, f.contractId, laterCompensation, hash(laterCompensation)]);
  const laterRule = '{"synthetic":true,"version":"later-draft"}';
  await pool.query("INSERT INTO legal_rule_packs(id,organization_id,status,canonical_payload,content_hash,evidence_mode,release_evidence) VALUES($1,$2,'draft',$3,$4,'synthetic',NULL)", [randomUUID(), f.organizationId, laterRule, hash(laterRule)]);
  const changedCalculator = { ...calculatorContext(f), version: "later-untrusted-for-history", artifactHash: "b".repeat(64) };
  const historical = new PayRunRepository(pool, authForFixture(pool, f), { organizationId: f.organizationId, now: () => new Date("2026-09-05T00:05:00Z"), calculator: changedCalculator });
  const after = await historical.get(credentials(f, "accountant"), created.id);
  expect(after.employees[0]?.canonical_result).toBe(before.employees[0]?.canonical_result);
  expect(await historical.explain(credentials(f, "accountant"), created.id, f.employeeId)).toEqual(expectedStoredTrace);
});
