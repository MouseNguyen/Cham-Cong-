import {randomUUID} from 'node:crypto';
import {releaseTransaction,checkedPreview,type ReleaseContext,type Credentials} from '../application/commands/preview-payslip-release';
export type PasswordChannel='in_person'|'phone'|'zalo_manual';
export async function confirmPasswordHandoff(ctx:ReleaseContext,credentials:Credentials,input:{previewId:string;hash:string;channel:PasswordChannel}){
 if(!['in_person','phone','zalo_manual'].includes(input.channel))throw Error('HANDOFF_CHANNEL_INVALID');
 return releaseTransaction(ctx,credentials,true,async(tx,actor)=>{
  const {binding,status}=await checkedPreview(tx,ctx,input);
  if(status==='draft')throw Error('DELIVERY_CONFIRMATION_REQUIRED');
  const prior=(await tx.query("SELECT id,channel FROM payslip_release_receipts WHERE preview_id=$1 AND kind='password_handoff_confirmed'",[input.previewId])).rows[0];
  if(prior){if(prior.channel!==input.channel)throw Error('HANDOFF_CONFLICT');return {receiptId:prior.id as string,passwordVersionId:binding.passwordVersionId,status:'password_handoff_confirmed' as const};}
  const id=randomUUID();
  await tx.query("INSERT INTO payslip_release_receipts(id,organization_id,preview_id,actor_id,kind,channel,password_version_id,created_at) VALUES($1,$2,$3,$4,'password_handoff_confirmed',$5,$6,$7)",[id,ctx.organizationId,input.previewId,actor,input.channel,binding.passwordVersionId,ctx.now()]);
  return {receiptId:id,passwordVersionId:binding.passwordVersionId,status:'password_handoff_confirmed' as const};
 });
}

/** Separate reviewable handoff intent, with no password or transport side effect. */
export function passwordHandoffDraft(preview:import('../application/commands/preview-payslip-release').ReleasePreview,channel:PasswordChannel){
 if(!['in_person','phone','zalo_manual'].includes(channel))throw Error('HANDOFF_CHANNEL_INVALID');
 return {previewId:preview.id,hash:preview.hash,employeeId:preview.binding.employeeId,passwordVersionId:preview.binding.passwordVersionId,channel,status:'password_handoff_draft' as const};
}
