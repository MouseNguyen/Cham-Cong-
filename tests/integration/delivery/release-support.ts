import {Pool} from 'pg';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {finalizedFixture} from '../documents/support';
import {generatePayslip} from '../../../apps/web/src/lib/documents/generate-payslip';
import {enqueueSyntheticVerification} from '../../../apps/web/src/lib/delivery/outbox';
import {withTransaction} from '../../../apps/web/src/lib/db/transaction';
export function releasePool(){const value=process.env.PAYSLIP_TEST_DATABASE_URL;if(!value)throw Error('OWNED_DATABASE_REQUIRED');const u=new URL(value);if(u.hostname!=='127.0.0.1'||u.port!=='55432'||u.pathname!=='/payslip_w6_02b_synthetic'||u.username!=='payslip_app')throw Error('UNSAFE_DATABASE');return new Pool({connectionString:value,max:4,statement_timeout:10000});}
export async function releaseFixture(pool:Pool){
 const base=await finalizedFixture(pool);base.deps.storageRoot=join(process.cwd(),'.tmp/PAY-W6-02b/documents',randomUUID());base.deps.now=()=>new Date('2026-09-05T00:05:00Z');
 const artifact=await generatePayslip({organizationId:base.f.organizationId,payRunEmployeeId:base.payRunEmployeeId},base.deps);
 const destinationId=randomUUID(),address=`synthetic-${randomUUID()}@example.invalid`,payload=JSON.stringify({address,channel:'email'}),hash=createHash('sha256').update(payload).digest('hex');
 await withTransaction(pool,async tx=>{
 await tx.query("INSERT INTO delivery_destinations(id,organization_id,employee_id,channel,address,valid_from,valid_to,canonical_payload,content_hash) VALUES($1,$2,$3,'email',$4,'2026-01-01','2027-01-01',$5,$6)",[destinationId,base.f.organizationId,base.f.employeeId,address,payload,hash]);
 const job=await enqueueSyntheticVerification(tx,{organizationId:base.f.organizationId,employeeId:base.f.employeeId,destinationId,idempotencyKey:randomUUID(),now:base.deps.now()});
 await tx.query("INSERT INTO employee_email_verifications(id,organization_id,employee_id,destination_id,job_id,code_hash,expires_at,verified_at) VALUES($1,$2,$3,$4,$5,$6,'2027-01-01',$7)",[randomUUID(),base.f.organizationId,base.f.employeeId,destinationId,job.jobId,'0'.repeat(64),base.deps.now()]);
 // This seed notification is already settled; the test worker next claims the payslip job.
 await tx.query("UPDATE outbox_dispatches SET status='accepted',provider_reference='fake-seeded' WHERE job_id=$1",[job.jobId]);
 });
 return {...base,artifact,destinationId,ctx:{pool,organizationId:base.f.organizationId,storageRoot:base.deps.storageRoot,protector:base.deps.protector,now:base.deps.now},input:{employeeId:base.f.employeeId,artifactId:artifact.id,destinationId}};
}
