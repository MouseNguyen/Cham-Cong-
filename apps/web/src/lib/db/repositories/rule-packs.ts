import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
// W2 accepts synthetic drafts only. Signed production release remains a separate
// trusted-import task; a metadata flag cannot grant that authority.
export async function archiveSyntheticRuleDraft(tx: PoolClient, input: { id:string;organizationId:string;canonicalPayload:string }) {
  const hash=createHash("sha256").update(input.canonicalPayload,"utf8").digest("hex");
  return (await tx.query("INSERT INTO legal_rule_packs(id,organization_id,status,canonical_payload,content_hash,evidence_mode) VALUES($1,$2,'draft',$3,$4,'synthetic') RETURNING *",[input.id,input.organizationId,input.canonicalPayload,hash])).rows[0];
}
