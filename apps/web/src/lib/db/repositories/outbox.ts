import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { conflict } from "../transaction";

export type OutboxDraftInput = {
  organizationId: string;
  payRunId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  eventKind?: string;
  eventVersion?: number;
};

export async function enqueueDraft(tx: PoolClient, input: OutboxDraftInput) {
  const eventKind = input.eventKind;
  const eventVersion = input.eventVersion;
  if ((eventKind === undefined) !== (eventVersion === undefined)) {
    throw conflict("INVALID_OUTBOX_EVENT");
  }
  const payload = JSON.stringify(input.payload);
  if (eventKind === undefined && eventVersion === undefined) {
    const created = await tx.query(
      "INSERT INTO outbox_jobs(id,organization_id,pay_run_id,idempotency_key,event_kind,event_version,payload,status) VALUES($1,$2,$3,$4,NULL,NULL,$5,'draft') ON CONFLICT (organization_id,idempotency_key) DO NOTHING RETURNING *",
      [randomUUID(), input.organizationId, input.payRunId, input.idempotencyKey, payload],
    );
    if (created.rows[0]) return created.rows[0];
    const prior = await tx.query("SELECT * FROM outbox_jobs WHERE organization_id=$1 AND pay_run_id=$2 AND idempotency_key=$3 AND event_kind IS NULL AND event_version IS NULL AND payload=$4::jsonb", [input.organizationId, input.payRunId, input.idempotencyKey, payload]);
    if (!prior.rows[0]) throw conflict("IDEMPOTENCY_CONFLICT");
    return prior.rows[0];
  }
  if (!eventKind || eventVersion === undefined || !Number.isInteger(eventVersion) || eventVersion < 1) throw conflict("INVALID_OUTBOX_EVENT");
  const created = await tx.query(
    "INSERT INTO outbox_jobs(id,organization_id,pay_run_id,idempotency_key,event_kind,event_version,payload,status) VALUES($1,$2,$3,$4,$5,$6,$7,'draft') ON CONFLICT (organization_id,pay_run_id,event_kind,event_version) WHERE event_kind IS NOT NULL DO NOTHING RETURNING *",
    [randomUUID(), input.organizationId, input.payRunId, input.idempotencyKey, eventKind, eventVersion, payload],
  );
  if (created.rows[0]) return created.rows[0];
  const prior = await tx.query("SELECT * FROM outbox_jobs WHERE organization_id=$1 AND pay_run_id=$2 AND event_kind=$3 AND event_version=$4 AND idempotency_key=$5 AND payload=$6::jsonb", [input.organizationId, input.payRunId, eventKind, eventVersion, input.idempotencyKey, payload]);
  if (!prior.rows[0]) throw conflict("IDEMPOTENCY_CONFLICT");
  return prior.rows[0];
}
