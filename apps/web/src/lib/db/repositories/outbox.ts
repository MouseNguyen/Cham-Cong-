import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { conflict } from "../transaction";
export async function enqueueDraft(tx: PoolClient, input: { organizationId:string; payRunId:string; idempotencyKey:string; payload:Record<string,unknown> }) {
  if(!input.idempotencyKey)throw conflict("INVALID_IDEMPOTENCY_KEY");
  const inserted=await tx.query("INSERT INTO outbox_jobs(id,organization_id,pay_run_id,idempotency_key,payload,status) VALUES($1,$2,$3,$4,$5,'draft') ON CONFLICT (organization_id,idempotency_key) DO NOTHING RETURNING *",
    [randomUUID(),input.organizationId,input.payRunId,input.idempotencyKey,JSON.stringify(input.payload)]);
  if(inserted.rows[0])return inserted.rows[0];
  const prior=await tx.query("SELECT * FROM outbox_jobs WHERE organization_id=$1 AND idempotency_key=$2 AND pay_run_id=$3 AND payload=$4::jsonb",[input.organizationId,input.idempotencyKey,input.payRunId,JSON.stringify(input.payload)]);
  if(!prior.rows[0])throw conflict("IDEMPOTENCY_CONFLICT");
  return prior.rows[0];
}
