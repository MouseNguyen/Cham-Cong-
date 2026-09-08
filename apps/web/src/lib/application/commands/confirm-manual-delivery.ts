import {randomUUID} from 'node:crypto';
import {releaseTransaction,checkedPreview,type ReleaseContext,type Credentials} from './preview-payslip-release';
export async function confirmManualDelivery(ctx:ReleaseContext,credentials:Credentials,input:{previewId:string;hash:string}):Promise<{status:'operator_confirmed_manual';receiptId:string}>{
 return releaseTransaction(ctx,credentials,true,async(tx,actor)=>{
  const {status}=await checkedPreview(tx,ctx,input);
  const prior=(await tx.query("SELECT id FROM payslip_release_receipts WHERE preview_id=$1 AND kind='operator_confirmed_manual'",[input.previewId])).rows[0];
  if(prior)return {status:'operator_confirmed_manual',receiptId:prior.id};
  if(status!=='draft')throw Error('RELEASE_STATE_CONFLICT');
  const id=randomUUID();
  await tx.query("INSERT INTO payslip_release_receipts(id,organization_id,preview_id,actor_id,kind,channel,created_at) VALUES($1,$2,$3,$4,'operator_confirmed_manual','zalo_manual',$5)",[id,ctx.organizationId,input.previewId,actor,ctx.now()]);
  await tx.query("UPDATE delivery_drafts SET status='operator_confirmed_manual',version=version+1 WHERE id=$1",[input.previewId]);
  return {status:'operator_confirmed_manual',receiptId:id};
 });
}
