import { Pool, type PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
export const sha=(text:string):string=>createHash('sha256').update(text,'utf8').digest('hex');
export function appPool():Pool {
 const value=process.env.PAYSLIP_TEST_DATABASE_URL;
 if(!value)throw new Error('OWNED_TEST_DATABASE_REQUIRED');
 const url=new URL(value);
 if(url.hostname!=='127.0.0.1'||url.port!=='55432'||url.pathname!=='/payslip_w2_01_synthetic'||url.username!=='payslip_app')throw new Error('UNSAFE_TEST_DATABASE');
 return new Pool({connectionString:value,max:4,connectionTimeoutMillis:3000,statement_timeout:5000});
}
export interface Scenario {orgId:string;workplaceId:string;employeeId:string;ownerId:string;contractId:string;compensationId:string;snapshotId:string;rulePackId:string;runId:string;runEmployeeId:string;clockId:string;compensationHash:string;snapshotHash:string;ruleHash:string}
export async function seedScenario(c:PoolClient):Promise<Scenario>{
 const s={orgId:randomUUID(),workplaceId:randomUUID(),employeeId:randomUUID(),ownerId:randomUUID(),contractId:randomUUID(),compensationId:randomUUID(),snapshotId:randomUUID(),rulePackId:randomUUID(),runId:randomUUID(),runEmployeeId:randomUUID(),clockId:randomUUID(),compensationHash:sha('{}'),snapshotHash:sha('{}'),ruleHash:sha('{}')};
 await c.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[s.orgId,'Synthetic Gelato']);
 await c.query('INSERT INTO workplaces(id,organization_id,name) VALUES($1,$2,$3)',[s.workplaceId,s.orgId,'Synthetic Shop']);
 await c.query('INSERT INTO employees(id,organization_id,workplace_id,display_name) VALUES($1,$2,$3,$4)',[s.employeeId,s.orgId,s.workplaceId,'Synthetic Employee']);
 await c.query('INSERT INTO users(id,organization_id,role,email) VALUES($1,$2,$3,$4)',[s.ownerId,s.orgId,'owner','synthetic@example.invalid']);
 await c.query("INSERT INTO employment_contracts(id,organization_id,employee_id,kind,valid_from,valid_to) VALUES($1,$2,$3,'full_time','2026-01-01T00:00:00Z','2027-01-01T00:00:00Z')",[s.contractId,s.orgId,s.employeeId]);
 await c.query("INSERT INTO compensation_terms(id,organization_id,employee_id,contract_id,monthly_salary_vnd,valid_from,valid_to,canonical_payload,content_hash) VALUES($1,$2,$3,$4,8000000,'2026-01-01T00:00:00Z','2027-01-01T00:00:00Z','{}',$5)",[s.compensationId,s.orgId,s.employeeId,s.contractId,s.compensationHash]);
 await c.query("INSERT INTO clock_events(id,organization_id,workplace_id,employee_id,idempotency_key,direction,occurred_at,request_hash) VALUES($1,$2,$3,$4,'seed','IN','2026-09-01T08:00:00.123Z',$5)",[s.clockId,s.orgId,s.workplaceId,s.employeeId,sha('seed')]);
 await c.query("INSERT INTO attendance_snapshots(id,organization_id,workplace_id,employee_id,period_start,period_end,canonical_payload,content_hash,status,approved_by) VALUES($1,$2,$3,$4,'2026-08-31T17:00:00Z','2026-09-30T17:00:00Z','{}',$5,'approved',$6)",[s.snapshotId,s.orgId,s.workplaceId,s.employeeId,s.snapshotHash,s.ownerId]);
 await c.query("INSERT INTO legal_rule_packs(id,organization_id,status,canonical_payload,content_hash,evidence_mode) VALUES($1,$2,'draft','{}',$3,'synthetic')",[s.rulePackId,s.orgId,s.ruleHash]);
 await c.query("INSERT INTO pay_runs(id,organization_id,workplace_id,status,version,evidence_mode,period_start,period_end) VALUES($1,$2,$3,'draft',0,'synthetic','2026-08-31T17:00:00Z','2026-09-30T17:00:00Z')",[s.runId,s.orgId,s.workplaceId]);
 await c.query("INSERT INTO pay_run_employees(id,organization_id,workplace_id,employee_id,pay_run_id,snapshot_id,snapshot_hash,compensation_id,compensation_hash,rule_pack_id,rule_pack_hash,calculator_version,calculator_artifact_hash,canonicalization_version,result_schema_version,canonical_input,input_hash,canonical_result,result_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'0.1.0',$12,'1','1','{}',$13,'{}',$13)",[s.runEmployeeId,s.orgId,s.workplaceId,s.employeeId,s.runId,s.snapshotId,s.snapshotHash,s.compensationId,s.compensationHash,s.rulePackId,s.ruleHash,sha('synthetic calculator'),sha('{}')]);
 return s;
}

export async function waitUntilBlocked(pool:Pool, pid:number):Promise<void> {
 for(let attempt=0;attempt<100;attempt++) {
  const r=await pool.query("SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked",[pid]);
  if(r.rows[0].blocked)return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw new Error("EXPECTED_DATABASE_LOCK_NOT_OBSERVED");
}
