import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { PoolClient } from "pg";
import { conflict } from "../transaction";
import { enqueueDraft } from "./outbox";
export interface PayRunChange { id: string; expectedVersion: number; actorId: string; status: "reviewed" | "finalized" }
export async function changePayRun(tx: PoolClient, input: PayRunChange) {
  // SAVEPOINT also rejects accidental use outside an explicit transaction.
  await tx.query("SAVEPOINT pay_run_change");
  try {
    const result = await tx.query(
      "UPDATE pay_runs SET status=$3,version=version+1 WHERE id=$1 AND version=$2 RETURNING *",
      [input.id,input.expectedVersion,input.status]);
    const row = result.rows[0];
    if (!row) throw conflict("STATE_VERSION_CONFLICT");
    await tx.query("INSERT INTO audit_events(id,organization_id,actor_id,action,aggregate_id) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(),row.organization_id,input.actorId,"pay_run."+input.status,input.id]);
    await tx.query("RELEASE SAVEPOINT pay_run_change");
    return row;
  } catch (error) {
    await tx.query("ROLLBACK TO SAVEPOINT pay_run_change");
    await tx.query("RELEASE SAVEPOINT pay_run_change");
    throw error;
  }
}
export async function finalizeWithOutbox(tx: PoolClient, input: Omit<PayRunChange,"status"> & { idempotencyKey: string }) {
  await tx.query("SAVEPOINT finalize_outbox");
  try {
    const run = (await tx.query("SELECT * FROM pay_runs WHERE id=$1 FOR UPDATE",[input.id])).rows[0];
    if (!run) throw conflict("STATE_VERSION_CONFLICT");
    const payload = { kind:"synthetic_payslip_draft",payRunId:input.id,actorId:input.actorId,expectedVersion:input.expectedVersion };
    const prior = (await tx.query("SELECT * FROM outbox_jobs WHERE organization_id=$1 AND idempotency_key=$2",[run.organization_id,input.idempotencyKey])).rows[0];
    if (prior) {
      if (prior.pay_run_id!==input.id || !isDeepStrictEqual(prior.payload,payload)) throw conflict("IDEMPOTENCY_CONFLICT");
      if(run.status!=="finalized") throw conflict("STATE_VERSION_CONFLICT");
      await tx.query("RELEASE SAVEPOINT finalize_outbox");
      return prior;
    }
    await changePayRun(tx,{id:input.id,expectedVersion:input.expectedVersion,actorId:input.actorId,status:"finalized"});
    const job=await enqueueDraft(tx,{organizationId:run.organization_id,payRunId:input.id,idempotencyKey:input.idempotencyKey,payload});
    await tx.query("RELEASE SAVEPOINT finalize_outbox");
    return job;
  } catch(error) {
    await tx.query("ROLLBACK TO SAVEPOINT finalize_outbox");
    await tx.query("RELEASE SAVEPOINT finalize_outbox");
    throw error;
  }
}
