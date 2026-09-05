import type { Pool } from "pg";
import { withTransaction } from "../db/transaction";
import { claimNext, finishAttempt } from "./outbox";
import type { FakeAdapter, Outcome } from "./types";

/** One bounded step. Provider I/O occurs after claim commit, outside DB locks.
 * A lost result or late completion stays leased and is reconciled after expiry. */
export async function runOne(input: {
  pool: Pool; adapter: FakeAdapter; organizationId: string; workerId: string; clock: () => Date; leaseMs: number;
}): Promise<{ jobId: string; outcome: Outcome["kind"] } | null> {
  const lease = await withTransaction(input.pool, tx => claimNext(tx, {
    organizationId: input.organizationId, workerId: input.workerId, now: input.clock(), leaseMs: input.leaseMs
  }));
  if (!lease) return null;
  let outcome: Outcome;
  try { outcome = await input.adapter[lease.phase](lease.message); }
  catch { outcome = { kind: "unknown" }; }
  await withTransaction(input.pool, tx => finishAttempt(tx, lease, outcome, input.clock()));
  return { jobId: lease.jobId, outcome: outcome.kind };
}
