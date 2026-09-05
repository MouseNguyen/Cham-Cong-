import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { appPool, seedScenario, sha, type Scenario } from "../db/support";
export { appPool };
export async function scenario(pool:Pool):Promise<Scenario & {destinationId:string}> {
 const c=await pool.connect();
 try {
  const f=await seedScenario(c),destinationId=randomUUID();
  const address="synthetic-"+f.employeeId+"@example.invalid";
  const payload=JSON.stringify({address,channel:"email"});
  await c.query("INSERT INTO delivery_destinations(id,organization_id,employee_id,channel,address,valid_from,valid_to,canonical_payload,content_hash) VALUES($1,$2,$3,'email',$4,'2026-01-01T00:00:00Z','2027-01-01T00:00:00Z',$5,$6)",[destinationId,f.orgId,f.employeeId,address,payload,sha(payload)]);
  return {...f,destinationId};
 } finally {c.release();}
}
export const startTime=new Date("2026-09-05T00:00:00Z");
