import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { AttendanceReviewRepository } from '../../../apps/web/src/lib/db/repositories/attendance-review';
import { login, protector, scenario } from '../auth/support';
import { canonicalizeWeeklySchedule, hashWeeklySchedule, type WeeklySchedule } from '../../../packages/attendance-domain/src/schedule';
export function reviewPool(){const value=process.env.PAYSLIP_TEST_DATABASE_URL;if(!value)throw Error('OWNED_TEST_DATABASE_REQUIRED');const url=new URL(value);if(url.hostname!=='127.0.0.1'||url.port!=='55432'||url.pathname!=='/payslip_w3_03_synthetic'||url.username!=='payslip_app')throw Error('UNSAFE_TEST_DATABASE');return new Pool({connectionString:value,max:4,statement_timeout:10000});}
export async function reviewFixture(pool:Pool){
 const owner=await scenario(pool,'owner'),accountant=await scenario(pool,'accountant',owner.org),workplaceId=randomUUID(),employeeId=randomUUID();
 await pool.query("INSERT INTO workplaces(id,organization_id,name) VALUES($1,$2,'Synthetic review workplace')",[workplaceId,owner.org]);
 await pool.query("INSERT INTO employees(id,organization_id,workplace_id,display_name,status) VALUES($1,$2,$3,'Synthetic review employee','active')",[employeeId,owner.org,workplaceId]);
 const weekly=Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,[{start:'08:00',end:'18:00'}]])) as unknown as WeeklySchedule;
 const payload=canonicalizeWeeklySchedule(weekly),hash=hashWeeklySchedule(weekly),template=randomUUID();
 await pool.query('INSERT INTO opening_hour_versions(id,organization_id,workplace_id,valid_from,canonical_payload,content_hash) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),owner.org,workplaceId,new Date('2025-12-31T17:00:00Z'),payload,hash]);
 await pool.query("INSERT INTO schedule_templates(id,organization_id,name,canonical_payload,content_hash) VALUES($1,$2,'Synthetic review schedule',$3,$4)",[template,owner.org,payload,hash]);
 await pool.query('INSERT INTO schedule_assignments(id,organization_id,workplace_id,employee_id,template_id,valid_from) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),owner.org,workplaceId,employeeId,template,new Date('2025-12-31T17:00:00Z')]);
 const raw=async(direction:'IN'|'OUT',at:string)=>{const id=randomUUID();await pool.query('INSERT INTO clock_events(id,organization_id,workplace_id,employee_id,idempotency_key,direction,occurred_at,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,owner.org,workplaceId,employeeId,id,direction,new Date(at),createHash('sha256').update(id).digest('hex')]);return id;};
 await raw('IN','2026-01-06T01:00:00.000Z');await raw('OUT','2026-01-06T02:00:00.061Z');
 owner.clock.value=accountant.clock.value;const now=()=>new Date(owner.clock.value);
 return {owner,accountant,ownerSession:await login(owner),accountantSession:await login(accountant),employeeId,workplaceId,raw,ownerRepo:new AttendanceReviewRepository(pool,protector,{organizationId:owner.org,now}),accountantRepo:new AttendanceReviewRepository(pool,protector,{organizationId:owner.org,now})};
}
