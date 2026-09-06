import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { enqueueDraft } from "../../../apps/web/src/lib/db/repositories/outbox";
import { addEmployeeSource, authForFixture, calculatorContext, credentials, fixture, NOW, payRunPool, sourceBinding, type PayRunFixture } from "./support";

let pool: Pool;
beforeAll(() => { pool = payRunPool(); });
afterAll(async () => { await pool.end(); });

async function repository(f: PayRunFixture, overrides: { enqueueFinalization?: typeof enqueueDraft } = {}) {
  const { PayRunRepository } = await import("../../../apps/web/src/lib/db/repositories/pay-runs");
  return new PayRunRepository(pool, authForFixture(pool, f), {
    organizationId: f.organizationId,
    now: () => NOW,
    calculator: calculatorContext(f),
    ...overrides,
  });
}

async function approvedRun(f: PayRunFixture) {
  const repo = await repository(f);
  const created = await repo.create(credentials(f, "accountant"), { workplaceId: f.workplaceId, periodStart: "2026-08-31T17:00:00.000Z", periodEnd: "2026-09-30T17:00:00.000Z" });
  const calculated = await repo.calculate(credentials(f, "accountant"), { payRunId: created.id, expectedVersion: created.version, sources: [sourceBinding(f)] });
  const submitted = await repo.submit(credentials(f, "accountant"), { payRunId: created.id, expectedVersion: calculated.version });
  const approved = await repo.approve(credentials(f, "owner"), { payRunId: created.id, expectedVersion: submitted.version });
  return { repo, created, approved };
}

describe("PAY-W4-01 immutable synthetic pay-run lifecycle", () => {
  it("uses session credentials, a source batch, a released synthetic pack, and a distinct approver", async () => {
    const client = await pool.connect(); let f;
    try { f = await fixture(client); } finally { client.release(); }
    const { PayRunRepository } = await import("../../../apps/web/src/lib/db/repositories/pay-runs");
    const repo = new PayRunRepository(pool, authForFixture(pool, f), { organizationId: f.organizationId, now: () => new Date("2026-09-05T00:05:00Z"), calculator: calculatorContext(f) });
    const created = await repo.create(credentials(f, "accountant"), { workplaceId: f.workplaceId, periodStart: "2026-08-31T17:00:00.000Z", periodEnd: "2026-09-30T17:00:00.000Z" });
    await expect(repo.calculate(credentials(f, "accountant"), { payRunId: created.id, expectedVersion: created.version, sources: [] })).rejects.toThrow("INVALID_CALCULATION_BATCH");
    const calculated = await repo.calculate(credentials(f, "accountant"), { payRunId: created.id, expectedVersion: created.version, sources: [sourceBinding(f)] });
    const submitted = await repo.submit(credentials(f, "accountant"), { payRunId: created.id, expectedVersion: calculated.version });
    await expect(repo.approve(credentials(f, "accountant"), { payRunId: created.id, expectedVersion: submitted.version })).rejects.toThrow("FORBIDDEN");
    const approved = await repo.approve(credentials(f, "owner"), { payRunId: created.id, expectedVersion: submitted.version });
    await expect(repo.finalize(credentials(f, "accountant"), { payRunId: created.id, expectedVersion: approved.version })).rejects.toThrow("FORBIDDEN");
    const finalized = await repo.finalize(credentials(f, "owner"), { payRunId: created.id, expectedVersion: approved.version });
    expect(finalized).toMatchObject({ status: "finalized", productionReady: false, replayed: false });
    await expect(repo.finalize(credentials(f, "owner"), { payRunId: created.id, expectedVersion: approved.version })).resolves.toMatchObject({ replayed: true, version: finalized.version });
    await expect(repo.finalize(credentials(f, "owner"), { payRunId: created.id, expectedVersion: finalized.version })).rejects.toThrow("STALE_VERSION");
    expect((await pool.query("SELECT count(*)::int count FROM outbox_jobs WHERE pay_run_id=$1 AND event_kind='pay_run_finalized' AND event_version=$2", [created.id, finalized.version])).rows[0]?.count).toBe(1);
    const adjustment = await repo.createAdjustment(credentials(f, "owner"), { originalRunId: created.id, reason: "Synthetic correction" });
    expect(adjustment).toMatchObject({ status: "draft", version: 0 });
    expect((await pool.query("SELECT reason FROM adjustment_links WHERE original_run_id=$1 AND adjustment_run_id=$2", [created.id, adjustment.id])).rows[0]?.reason).toBe("Synthetic correction");
    await expect(pool.query("UPDATE pay_runs SET status='calculated' WHERE id=$1", [created.id])).rejects.toBeDefined();
  });

  it("rejects a draft or unsigned rule pack before it can become a synthetic finalized orchestration run", async () => {
    const client = await pool.connect(); let f;
    try { f = await fixture(client, "draft"); } finally { client.release(); }
    const { PayRunRepository } = await import("../../../apps/web/src/lib/db/repositories/pay-runs");
    const repo = new PayRunRepository(pool, authForFixture(pool, f), { organizationId: f.organizationId, now: () => new Date("2026-09-05T00:05:00Z"), calculator: calculatorContext(f) });
    const created = await repo.create(credentials(f, "accountant"), { workplaceId: f.workplaceId, periodStart: "2026-08-31T17:00:00.000Z", periodEnd: "2026-09-30T17:00:00.000Z" });
    await expect(repo.calculate(credentials(f, "accountant"), { payRunId: created.id, expectedVersion: created.version, sources: [sourceBinding(f)] })).rejects.toThrow("RULE_PACK_NOT_RELEASED");
  });

  it("calculates two employees atomically and rolls back a stale or duplicate source batch", async () => {
    const client = await pool.connect(); let f: PayRunFixture; let second;
    try { f = await fixture(client); second = await addEmployeeSource(client, f); } finally { client.release(); }
    const repo = await repository(f);
    const created = await repo.create(credentials(f, "accountant"), { workplaceId: f.workplaceId, periodStart: "2026-08-31T17:00:00.000Z", periodEnd: "2026-09-30T17:00:00.000Z" });
    await expect(repo.calculate(credentials(f, "accountant"), { payRunId: created.id, expectedVersion: created.version, sources: [sourceBinding(f), { ...second, snapshotHash: "a".repeat(64) }] })).rejects.toThrow("SOURCE_BINDING_STALE");
    expect((await pool.query("SELECT count(*)::int count FROM pay_run_employees WHERE pay_run_id=$1", [created.id])).rows[0]?.count).toBe(0);
    await expect(repo.calculate(credentials(f, "accountant"), { payRunId: created.id, expectedVersion: created.version, sources: [sourceBinding(f), sourceBinding(f)] })).rejects.toThrow("INVALID_CALCULATION_BATCH");
    const calculated = await repo.calculate(credentials(f, "accountant"), { payRunId: created.id, expectedVersion: created.version, sources: [sourceBinding(f), second] });
    expect(calculated.status).toBe("calculated");
    expect((await pool.query("SELECT count(*)::int count FROM pay_run_employees WHERE pay_run_id=$1", [created.id])).rows[0]?.count).toBe(2);
    await expect(repo.submit(credentials(f, "accountant"), { payRunId: created.id, expectedVersion: created.version })).rejects.toThrow("STALE_VERSION");
  });

  it("enforces real CSRF, active session state, and fresh non-future owner MFA", async () => {
    const client = await pool.connect(); let invalidCsrf: PayRunFixture; let revoked: PayRunFixture; let expired: PayRunFixture; let inactive: PayRunFixture; let future: PayRunFixture; let stale: PayRunFixture;
    try {
      invalidCsrf = await fixture(client);
      revoked = await fixture(client);
      expired = await fixture(client);
      inactive = await fixture(client);
      future = await fixture(client);
      stale = await fixture(client);
    } finally { client.release(); }

    const invalidRepo = await repository(invalidCsrf);
    await expect(invalidRepo.create({ ...credentials(invalidCsrf, "accountant"), csrfToken: "wrong" }, { workplaceId: invalidCsrf.workplaceId, periodStart: "2026-08-31T17:00:00Z", periodEnd: "2026-09-30T17:00:00Z" })).rejects.toThrow("CSRF");

    await pool.query("UPDATE sessions SET revoked_at=$2 WHERE id=$1", [revoked.accountantSessionId, NOW]);
    await expect((await repository(revoked)).create(credentials(revoked, "accountant"), { workplaceId: revoked.workplaceId, periodStart: "2026-08-31T17:00:00Z", periodEnd: "2026-09-30T17:00:00Z" })).rejects.toThrow("UNAUTHENTICATED");

    await pool.query("UPDATE sessions SET expires_at=$2 WHERE id=$1", [expired.accountantSessionId, new Date(NOW.getTime() - 1)]);
    await expect((await repository(expired)).create(credentials(expired, "accountant"), { workplaceId: expired.workplaceId, periodStart: "2026-08-31T17:00:00Z", periodEnd: "2026-09-30T17:00:00Z" })).rejects.toThrow("UNAUTHENTICATED");

    await pool.query("UPDATE users SET active=false WHERE id=$1", [inactive.accountantId]);
    await expect((await repository(inactive)).create(credentials(inactive, "accountant"), { workplaceId: inactive.workplaceId, periodStart: "2026-08-31T17:00:00Z", periodEnd: "2026-09-30T17:00:00Z" })).rejects.toThrow("UNAUTHENTICATED");

    await pool.query("UPDATE sessions SET mfa_satisfied_at=$2 WHERE id=$1", [future.ownerSessionId, new Date(NOW.getTime() + 1)]);
    await expect((await repository(future)).createAdjustment(credentials(future, "owner"), { originalRunId: randomUUID(), reason: "future MFA" })).rejects.toThrow("UNAUTHENTICATED");

    const prepared = await approvedRun(stale);
    await pool.query("UPDATE sessions SET mfa_satisfied_at=$2 WHERE id=$1", [stale.ownerSessionId, new Date(NOW.getTime() - 660_000)]);
    await expect(prepared.repo.finalize(credentials(stale, "owner"), { payRunId: prepared.created.id, expectedVersion: prepared.approved.version })).rejects.toThrow("FRESH_TOTP_REQUIRED");
  });

  it("rejects direct finalization without evidence and rolls back an injected outbox failure", async () => {
    const client = await pool.connect(); let direct: PayRunFixture; let rollback: PayRunFixture;
    try { direct = await fixture(client); rollback = await fixture(client); } finally { client.release(); }
    const directPrepared = await approvedRun(direct);
    const tx = await pool.connect();
    try {
      await tx.query("BEGIN");
      await tx.query("UPDATE pay_runs SET status='finalized',version=version+1 WHERE id=$1", [directPrepared.created.id]);
      await expect(tx.query("COMMIT")).rejects.toThrow("FINALIZATION_EVIDENCE_REQUIRED");
      await tx.query("ROLLBACK").catch(() => undefined);
    } finally { tx.release(); }
    expect((await pool.query("SELECT status FROM pay_runs WHERE id=$1", [directPrepared.created.id])).rows[0]?.status).toBe("approved");

    const rollbackPrepared = await approvedRun(rollback);
    const failing = await repository(rollback, { enqueueFinalization: async () => { throw new Error("INJECTED_OUTBOX_FAILURE"); } });
    await expect(failing.finalize(credentials(rollback, "owner"), { payRunId: rollbackPrepared.created.id, expectedVersion: rollbackPrepared.approved.version })).rejects.toThrow("INJECTED_OUTBOX_FAILURE");
    expect((await pool.query("SELECT status FROM pay_runs WHERE id=$1", [rollbackPrepared.created.id])).rows[0]?.status).toBe("approved");
    expect((await pool.query("SELECT count(*)::int count FROM outbox_jobs WHERE pay_run_id=$1", [rollbackPrepared.created.id])).rows[0]?.count).toBe(0);
  });

  it("enforces one finalization event per run/version and tenant-scoped reads", async () => {
    const client = await pool.connect(); let first: PayRunFixture; let other: PayRunFixture;
    try { first = await fixture(client); other = await fixture(client); } finally { client.release(); }
    const prepared = await approvedRun(first);
    const finalized = await prepared.repo.finalize(credentials(first, "owner"), { payRunId: prepared.created.id, expectedVersion: prepared.approved.version });
    const payload = { eventKind: "pay_run_finalized", payRunId: prepared.created.id, finalVersion: finalized.version, evidenceMode: "synthetic" };
    await expect(pool.query("INSERT INTO outbox_jobs(id,organization_id,pay_run_id,idempotency_key,event_kind,event_version,payload,status) VALUES($1,$2,$3,$4,'pay_run_finalized',$5,$6,'draft')", [randomUUID(), first.organizationId, prepared.created.id, randomUUID(), finalized.version, JSON.stringify(payload)])).rejects.toBeDefined();
    await expect(prepared.repo.get(credentials(first, "accountant"), randomUUID())).rejects.toThrow("NOT_FOUND");
    const otherPrepared = await repository(other);
    const otherCreated = await otherPrepared.create(credentials(other, "accountant"), { workplaceId: other.workplaceId, periodStart: "2026-08-31T17:00:00Z", periodEnd: "2026-09-30T17:00:00Z" });
    await expect(prepared.repo.get(credentials(first, "accountant"), otherCreated.id)).rejects.toThrow("NOT_FOUND");
    await expect(prepared.repo.explain(credentials(first, "accountant"), otherCreated.id, other.employeeId)).rejects.toThrow("NOT_FOUND");
  });
});
