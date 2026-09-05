import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { conflict } from "../transaction";
export interface ClockRequest {
  id: string; organizationId: string; workplaceId: string; employeeId: string;
  idempotencyKey: string; direction: "IN" | "OUT"; occurredAt: Date;
}
export async function recordClockEvent(tx: PoolClient, input: ClockRequest) {
  if (!input.idempotencyKey || !Number.isFinite(input.occurredAt.getTime())) throw conflict("INVALID_CLOCK_REQUEST");
  const hash = createHash("sha256").update(JSON.stringify([input.organizationId, input.workplaceId, input.employeeId, input.direction, input.occurredAt.toISOString()])).digest("hex");
  const inserted = await tx.query(
    "INSERT INTO clock_events(id,organization_id,workplace_id,employee_id,idempotency_key,direction,occurred_at,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (organization_id,workplace_id,employee_id,idempotency_key) DO NOTHING RETURNING *",
    [input.id,input.organizationId,input.workplaceId,input.employeeId,input.idempotencyKey,input.direction,input.occurredAt,hash]);
  const row = inserted.rows[0] ?? (await tx.query(
    "SELECT * FROM clock_events WHERE organization_id=$1 AND workplace_id=$2 AND employee_id=$3 AND idempotency_key=$4",
    [input.organizationId,input.workplaceId,input.employeeId,input.idempotencyKey])).rows[0];
  if (!row || row.request_hash !== hash) throw conflict("IDEMPOTENCY_CONFLICT");
  return row;
}
