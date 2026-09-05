import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
export async function archiveSnapshot(tx: PoolClient, input: { id:string;organizationId:string;workplaceId:string;employeeId:string;periodStart:Date;periodEnd:Date;canonicalPayload:string;approvedBy:string }) {
  const hash=createHash("sha256").update(input.canonicalPayload,"utf8").digest("hex");
  return (await tx.query("INSERT INTO attendance_snapshots(id,organization_id,workplace_id,employee_id,period_start,period_end,canonical_payload,content_hash,status,approved_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'approved',$9) RETURNING *",[input.id,input.organizationId,input.workplaceId,input.employeeId,input.periodStart,input.periodEnd,input.canonicalPayload,hash,input.approvedBy])).rows[0];
}
