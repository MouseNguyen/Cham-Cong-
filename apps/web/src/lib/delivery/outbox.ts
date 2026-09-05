import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { conflict } from "../db/transaction";
import { assertSyntheticMessage } from "./fake-adapter";
import { BODY, SUBJECT, type FakeMessage, type Lease, type Outcome } from "./types";

async function atomic<T>(tx: PoolClient, work: () => Promise<T>): Promise<T> {
  // SAVEPOINT also rejects a bare client without BEGIN (25P01).
  await tx.query("SAVEPOINT outbox_operation");
  try {
    const result = await work();
    await tx.query("RELEASE SAVEPOINT outbox_operation");
    return result;
  } catch (error) {
    await tx.query("ROLLBACK TO SAVEPOINT outbox_operation");
    await tx.query("RELEASE SAVEPOINT outbox_operation");
    throw error;
  }
}
function validTime(now: Date) {
  if (!Number.isFinite(now.getTime())) throw conflict("INVALID_CLOCK");
}
export async function enqueueSyntheticVerification(tx: PoolClient, input: {
  organizationId: string; employeeId: string; destinationId: string; idempotencyKey: string; now: Date;
}): Promise<{ jobId: string }> {
  validTime(input.now);
  if (!input.idempotencyKey || input.idempotencyKey.length > 200) throw conflict("INVALID_IDEMPOTENCY_KEY");
  return atomic(tx, async () => {
    // Serialize same-key creation before the destination lookup, including racing replays.
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [input.organizationId + ":" + input.idempotencyKey]);
    const prior = (await tx.query("SELECT id,kind,employee_id,destination_id FROM outbox_jobs WHERE organization_id=$1 AND idempotency_key=$2", [input.organizationId, input.idempotencyKey])).rows[0];
    if (prior) {
      if (prior.kind !== "synthetic_email_verification" || prior.employee_id !== input.employeeId || prior.destination_id !== input.destinationId) throw conflict("IDEMPOTENCY_CONFLICT");
      return { jobId: prior.id as string };
    }
    const destination = (await tx.query("SELECT * FROM delivery_destinations WHERE id=$1 AND organization_id=$2 AND employee_id=$3 AND channel='email' AND valid_from<=$4 AND (valid_to IS NULL OR valid_to>$4) FOR UPDATE", [input.destinationId, input.organizationId, input.employeeId, input.now])).rows[0];
    if (!destination) throw conflict("DESTINATION_MISMATCH");
    const jobId = randomUUID();
    const message: FakeMessage = { jobId, idempotencyKey: jobId, to: destination.address as string, subject: SUBJECT, body: BODY };
    assertSyntheticMessage(message);
    await tx.query("INSERT INTO outbox_jobs(id,organization_id,pay_run_id,idempotency_key,payload,kind,employee_id,destination_id,destination_hash,created_at) VALUES($1,$2,NULL,$3,$4,'synthetic_email_verification',$5,$6,$7,$8)", [jobId, input.organizationId, input.idempotencyKey, message, input.employeeId, input.destinationId, destination.content_hash, input.now]);
    await tx.query("INSERT INTO outbox_dispatches(job_id,organization_id,available_at) VALUES($1,$2,$3)", [jobId, input.organizationId, input.now]);
    return { jobId };
  });
}
export async function claimNext(tx: PoolClient, input: {
  organizationId: string; workerId: string; now: Date; leaseMs: number;
}): Promise<Lease | null> {
  validTime(input.now);
  if (!input.workerId || input.workerId.length > 100 || !Number.isInteger(input.leaseMs) || input.leaseMs < 1 || input.leaseMs > 300000) throw conflict("INVALID_LEASE");
  return atomic(tx, async () => {
    const row = (await tx.query(
      "SELECT d.*,j.payload FROM outbox_dispatches d JOIN outbox_jobs j ON j.id=d.job_id WHERE d.organization_id=$1 AND j.kind='synthetic_email_verification' AND ((d.status IN ('pending','retry_wait','reconcile') AND d.available_at<=$2) OR (d.status='leased' AND d.lease_expires_at<=$2)) ORDER BY d.available_at,d.job_id LIMIT 1 FOR UPDATE OF d SKIP LOCKED",
      [input.organizationId, input.now])).rows[0];
    if (!row) return null;
    const phase = row.status === "leased" || row.status === "reconcile" ? "reconcile" : "send";
    // Expired reconciliation claims consume their budget even when their process vanishes.
    if ((phase === "reconcile" && row.reconcile_attempts >= 3) || (phase === "send" && row.send_attempts >= 3)) {
      await tx.query("UPDATE outbox_dispatches SET status='dead_letter',terminal_reason='attempt_budget_exhausted',lease_token=NULL,lease_expires_at=NULL,worker_id=NULL,lease_phase=NULL WHERE job_id=$1", [row.job_id]);
      await tx.query("INSERT INTO outbox_dispatch_attempts(id,job_id,organization_id,generation,phase,event,outcome,created_at) VALUES($1,$2,$3,$4,$5,'terminal','attempt_budget_exhausted',$6)", [randomUUID(), row.job_id, input.organizationId, row.generation, phase, input.now]);
      return null;
    }
    const token = randomUUID(), generation = Number(row.generation) + 1;
    const message = row.payload as FakeMessage;
    assertSyntheticMessage(message);
    await tx.query("UPDATE outbox_dispatches SET status='leased',lease_token=$2,generation=$3,lease_phase=$4,worker_id=$5,lease_expires_at=$6,send_attempts=send_attempts+$7,reconcile_attempts=reconcile_attempts+$8 WHERE job_id=$1", [row.job_id, token, generation, phase, input.workerId, new Date(input.now.getTime() + input.leaseMs), phase === "send" ? 1 : 0, phase === "reconcile" ? 1 : 0]);
    await tx.query("INSERT INTO outbox_dispatch_attempts(id,job_id,organization_id,generation,phase,event,outcome,created_at) VALUES($1,$2,$3,$4,$5,'claim','claimed',$6)", [randomUUID(), row.job_id, input.organizationId, generation, phase, input.now]);
    return { jobId: row.job_id as string, organizationId: input.organizationId, token, generation, phase, message };
  });
}
export async function finishAttempt(tx: PoolClient, lease: Lease, outcome: Outcome, now: Date): Promise<void> {
  validTime(now);
  return atomic(tx, async () => {
    const row = (await tx.query("SELECT * FROM outbox_dispatches WHERE job_id=$1 AND organization_id=$2 FOR UPDATE", [lease.jobId, lease.organizationId])).rows[0];
    if (!row || row.status !== "leased" || row.lease_token !== lease.token || row.generation !== lease.generation || row.lease_expires_at.getTime() <= now.getTime()) throw conflict("LEASE_CONFLICT");
    const phase = row.lease_phase;
    if (!["accepted","unknown",phase === "send" ? "definitely_failed" : "not_found"].includes(outcome.kind) ||
        (outcome.kind === "accepted" && (!outcome.reference || !outcome.reference.startsWith("fake-") || outcome.reference.length > 200))) throw conflict("INVALID_OUTCOME");
    let status: string, delay = 0, reason: string | null = null;
    if (outcome.kind === "accepted") status = "accepted";
    else if (outcome.kind === "unknown") {
      status = row.reconcile_attempts >= 3 ? "dead_letter" : "reconcile";
      delay = 1000;
      if (status === "dead_letter") reason = "reconciliation_unknown";
    } else {
      status = row.send_attempts >= 3 ? "dead_letter" : "retry_wait";
      delay = 1000 * 2 ** (row.send_attempts - 1);
      if (status === "dead_letter") reason = "send_budget_exhausted";
    }
    const reference = outcome.kind === "accepted" ? outcome.reference : null;
    await tx.query("UPDATE outbox_dispatches SET status=$2,available_at=$3,terminal_reason=$4,provider_reference=$5,lease_token=NULL,lease_expires_at=NULL,worker_id=NULL,lease_phase=NULL WHERE job_id=$1", [lease.jobId, status, new Date(now.getTime() + delay), reason, reference]);
    await tx.query("INSERT INTO outbox_dispatch_attempts(id,job_id,organization_id,generation,phase,event,outcome,provider_reference,created_at) VALUES($1,$2,$3,$4,$5,'result',$6,$7,$8)", [randomUUID(), lease.jobId, lease.organizationId, lease.generation, phase, outcome.kind, reference, now]);
  });
}
