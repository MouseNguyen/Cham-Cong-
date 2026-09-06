import type { PoolClient } from "pg";
export async function findCompensation(tx: PoolClient, input: { organizationId:string; employeeId:string; at:Date }) {
  return (await tx.query("SELECT t.*,LEAST(t.valid_to,c.effective_to) AS valid_to,t.valid_to AS source_valid_to FROM compensation_terms t LEFT JOIN compensation_term_closures c ON c.term_id=t.id WHERE t.organization_id=$1 AND t.employee_id=$2 AND t.valid_from<=$3 AND (LEAST(t.valid_to,c.effective_to) IS NULL OR LEAST(t.valid_to,c.effective_to)>$3)",[input.organizationId,input.employeeId,input.at])).rows[0] ?? null;
}
