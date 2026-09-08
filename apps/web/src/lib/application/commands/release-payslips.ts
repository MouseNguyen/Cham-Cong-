import {randomUUID} from 'node:crypto';
import {releaseTransaction,checkedPreview,type ReleaseContext,type Credentials} from './preview-payslip-release';
import {PAYSLIP_SUBJECT,PAYSLIP_BODY,type FakeMessage} from '../../delivery/types';
import {assertSyntheticMessage} from '../../delivery/fake-adapter';
export async function releasePayslips(ctx:ReleaseContext,credentials:Credentials,input:{previewId:string;hash:string}):Promise<{status:'queued_fake';jobId:string}>{
 return releaseTransaction(ctx,credentials,true,async(tx,actor)=>{
  const {binding,status}=await checkedPreview(tx,ctx,input);
  const prior=(await tx.query("SELECT job_id FROM payslip_release_receipts WHERE preview_id=$1 AND kind='queued_fake'",[input.previewId])).rows[0];
  if(prior)return {status:'queued_fake',jobId:prior.job_id};
  if(status!=='draft')throw Error('RELEASE_STATE_CONFLICT');
  const jobId=randomUUID();
  const message:FakeMessage={jobId,idempotencyKey:jobId,to:binding.to,subject:PAYSLIP_SUBJECT,body:PAYSLIP_BODY,attachment:binding};
  assertSyntheticMessage(message);
  await tx.query("INSERT INTO outbox_jobs(id,organization_id,pay_run_id,idempotency_key,payload,kind,employee_id,destination_id,destination_hash,created_at) VALUES($1,$2,$3,$4,$5,'synthetic_payslip_release',$6,$7,$8,$9)",[jobId,ctx.organizationId,binding.payRunId,'payslip-release:'+input.previewId,message,binding.employeeId,binding.destinationId,binding.destinationHash,ctx.now()]);
  await tx.query('INSERT INTO outbox_dispatches(job_id,organization_id,available_at) VALUES($1,$2,$3)',[jobId,ctx.organizationId,ctx.now()]);
  await tx.query("INSERT INTO payslip_release_receipts(id,organization_id,preview_id,actor_id,kind,channel,job_id,created_at) VALUES($1,$2,$3,$4,'queued_fake','fake_email',$5,$6)",[randomUUID(),ctx.organizationId,input.previewId,actor,jobId,ctx.now()]);
  await tx.query("UPDATE delivery_drafts SET status='queued_fake',version=version+1 WHERE id=$1",[input.previewId]);
  return {status:'queued_fake',jobId};
 });
}
