import {randomUUID} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import type {PoolClient} from 'pg';
import {releaseTransaction,loadReleaseBinding,hashBinding,type ReleaseContext,type Credentials,type ReleaseBinding} from '../application/commands/preview-payslip-release';
export type PasswordChannel='in_person'|'phone'|'zalo_manual';
async function handoffBinding(tx:PoolClient,ctx:ReleaseContext,input:{previewId:string;hash:string}){
 const row=(await tx.query(`SELECT p.binding,p.binding_hash,d.status FROM payslip_release_previews p JOIN delivery_drafts d ON d.id=p.draft_id AND d.organization_id=p.organization_id WHERE p.id=$1 AND p.organization_id=$2 FOR UPDATE OF d`,[input.previewId,ctx.organizationId])).rows[0];
 if(!row||row.binding_hash!==input.hash||hashBinding(row.binding)!==input.hash)throw Error('PREVIEW_MISMATCH');
 if(!['queued_fake','operator_confirmed_manual'].includes(row.status))throw Error('DELIVERY_CONFIRMATION_REQUIRED');
 // The original delivery preview expires; an already recorded handoff remains accessible after fresh MFA.
 const binding=await loadReleaseBinding(tx,ctx,row.binding as ReleaseBinding);
 if(hashBinding(binding)!==input.hash)throw Error('PREVIEW_STALE');
 return {binding,status:row.status as string};
}
/** Human-only response. Never register this operation as a page tool. */
export async function revealHandoffPassword(ctx:ReleaseContext,credentials:Credentials,input:{previewId:string;hash:string}){
 return releaseTransaction(ctx,credentials,true,async tx=>{
  const {binding,status}=await handoffBinding(tx,ctx,input);
  if(!['queued_fake','operator_confirmed_manual'].includes(status))throw Error('DELIVERY_CONFIRMATION_REQUIRED');
  const path=join(ctx.storageRoot,`${binding.artifactId}.secret`);
  if((await lstat(path)).isSymbolicLink())throw Error('ARTIFACT_MISMATCH');
  const cipher=await readFile(path),plain=await ctx.protector.unprotect(cipher,`payslip:${binding.artifactId}`);
  try{
   const secret=JSON.parse(plain.toString('utf8')) as {password:string;artifactId:string;sha256:string};
   if(secret.artifactId!==binding.artifactId||secret.sha256!==binding.sha256||typeof secret.password!=='string')throw Error('ARTIFACT_MISMATCH');
   return {password:secret.password};
  }finally{plain.fill(0);cipher.fill(0);}
 });
}
export async function confirmPasswordHandoff(ctx:ReleaseContext,credentials:Credentials,input:{previewId:string;hash:string;channel:PasswordChannel}){
 if(!['in_person','phone','zalo_manual'].includes(input.channel))throw Error('HANDOFF_CHANNEL_INVALID');
 return releaseTransaction(ctx,credentials,true,async(tx,actor)=>{
  const {binding,status}=await handoffBinding(tx,ctx,input);
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
