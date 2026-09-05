import type { PoolClient } from "pg";
export async function findCompensation(tx: PoolClient, input: { organizationId:string; employeeId:string; at:Date }) {
  return (await tx.query("SELECT * FROM compensation_terms WHERE organization_id=$1 AND employee_id=$2 AND valid_from<=$3 AND (valid_to IS NULL OR valid_to>$3)",[input.organizationId,input.employeeId,input.at])).rows[0] ?? null;
}
