import {Pool} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {finalizedFixture} from '../documents/support';
import {enqueueSyntheticVerification} from '../../../apps/web/src/lib/delivery/outbox';
import {withTransaction} from '../../../apps/web/src/lib/db/transaction';
export function deliveryPool(){
 const value=process.env.PAYSLIP_TEST_DATABASE_URL;const u=new URL(value||'http://invalid');
 if(u.hostname!=='127.0.0.1'||u.port!=='55432'||u.pathname!=='/payslip_w5_02b_synthetic'||u.username!=='payslip_app')throw Error('OWNED_DELIVERY_DATABASE_REQUIRED');
 return new Pool({connectionString:value!,max:3,statement_timeout:10000});
}
export function seedIds(){return JSON.parse(readFileSync(process.env.PAYSLIP_DELIVERY_SEED_FILE!,'utf8')) as {organizationId:string;payRunId:string;employeeId:string;payRunEmployeeId:string;destinationId:string};}
export async function seedDelivery(pool:Pool,persist=true){
 const base=await finalizedFixture(pool),destinationId=randomUUID(),address=`synthetic-${randomUUID()}@example.invalid`,payload=JSON.stringify({address,channel:'email'});
 await withTransaction(pool,async tx=>{
  await tx.query("INSERT INTO delivery_destinations(id,organization_id,employee_id,channel,address,valid_from,valid_to,canonical_payload,content_hash) VALUES($1,$2,$3,'email',$4,'2026-01-01','2027-01-01',$5,$6)",[destinationId,base.f.organizationId,base.f.employeeId,address,payload,createHash('sha256').update(payload).digest('hex')]);
  const job=await enqueueSyntheticVerification(tx,{organizationId:base.f.organizationId,employeeId:base.f.employeeId,destinationId,idempotencyKey:randomUUID(),now:new Date()});
  await tx.query("INSERT INTO employee_email_verifications(id,organization_id,employee_id,destination_id,job_id,code_hash,expires_at,verified_at) VALUES($1,$2,$3,$4,$5,$6,'2027-01-01',now())",[randomUUID(),base.f.organizationId,base.f.employeeId,destinationId,job.jobId,'0'.repeat(64)]);
  await tx.query("UPDATE outbox_dispatches SET status='accepted',provider_reference='fake-seeded' WHERE job_id=$1",[job.jobId]);
 });
 const ids={organizationId:base.f.organizationId,payRunId:base.run.id,employeeId:base.f.employeeId,payRunEmployeeId:base.payRunEmployeeId,destinationId};
 if(persist)writeFileSync(process.env.PAYSLIP_DELIVERY_SEED_FILE!,JSON.stringify(ids));return ids;
}
