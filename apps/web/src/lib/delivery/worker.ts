import {loadReleaseBinding,attachmentBytes,type ReleaseContext} from '../application/commands/preview-payslip-release';
import {payslipMime} from './gmail-adapter';
import type { Pool } from "pg";
import { withTransaction } from "../db/transaction";
import { claimNext, finishAttempt } from "./outbox";
import type { FakeAdapter, Outcome } from "./types";

/** One bounded step. Provider I/O occurs after claim commit, outside DB locks.
 * A lost result or late completion stays leased and is reconciled after expiry. */
export async function runOne(input: {
  releaseContext?:ReleaseContext; pool: Pool; adapter: FakeAdapter; organizationId: string; workerId: string; clock: () => Date; leaseMs: number;
}): Promise<{ jobId: string; outcome: Outcome["kind"] } | null> {
  const lease = await withTransaction(input.pool, tx => claimNext(tx, {
    organizationId: input.organizationId, workerId: input.workerId, now: input.clock(), leaseMs: input.leaseMs
  }));
  if (!lease) return null;
  let outcome: Outcome;
  try {
    if(lease.phase==='send'&&lease.message.attachment){
      if(!input.releaseContext||input.releaseContext.organizationId!==input.organizationId)throw Error('RELEASE_CONTEXT_REQUIRED');
      const context=input.releaseContext;
      const binding=await withTransaction(input.pool,tx=>loadReleaseBinding(tx,context,lease.message.attachment!));
      if(binding.sha256!==lease.message.attachment.sha256||binding.destinationHash!==lease.message.attachment.destinationHash)throw Error('RELEASE_BINDING_MISMATCH');
      const bytes=await attachmentBytes(context,binding);const mime=payslipMime(lease.message,bytes);mime.fill(0);
    }
    outcome = await input.adapter[lease.phase](lease.message);
  }
  catch { outcome = { kind: "unknown" }; }
  await withTransaction(input.pool, tx => finishAttempt(tx, lease, outcome, input.clock()));
  return { jobId: lease.jobId, outcome: outcome.kind };
}
