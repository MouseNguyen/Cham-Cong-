import type {Pool,PoolClient} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import {resolve,relative,sep,join} from 'node:path';
import {AuthRepository} from '../../db/repositories/auth';
import type {WindowsSecretProtector} from '../../secrets/windows-dpapi';
import {withTransaction} from '../../db/transaction';
import {hashSecret,validCsrf} from '../../auth/csrf';
import {canonicalize} from '../../../../../../packages/payroll-domain/src/trace';
export type Credentials={sessionToken:string;csrfToken:string};
export type ReleaseContext={pool:Pool;organizationId:string;storageRoot:string;protector:WindowsSecretProtector;now:()=>Date};
export type ReleaseBinding={employeeId:string;employeeName:string;artifactId:string;payslipId:string;payRunId:string;destinationId:string;destinationHash:string;to:string;periodStart:string;periodEnd:string;relativePath:string;sha256:string;bytes:number;passwordVersionId:string};
export type ReleasePreview={id:string;binding:ReleaseBinding;hash:string;expiresAt:string};
export const hashBinding=(binding:ReleaseBinding)=>createHash('sha256').update(canonicalize(binding)).digest('hex');
export async function releaseTransaction<T>(ctx:ReleaseContext,credentials:Credentials,fresh:boolean,work:(tx:PoolClient,actorId:string)=>Promise<T>):Promise<T>{
 if(typeof credentials?.sessionToken!=='string'||credentials.sessionToken.length<32)throw Error('UNAUTHENTICATED');
 const auth=new AuthRepository(ctx.pool,ctx.protector,{organizationId:ctx.organizationId,now:ctx.now});
 const actor=await auth.checkCsrf(credentials.sessionToken,credentials.csrfToken);
 return withTransaction(ctx.pool,async tx=>{
  const row=(await tx.query('SELECT s.*,u.role,u.active FROM sessions s JOIN users u ON u.id=s.user_id AND u.organization_id=s.organization_id WHERE s.id=$1 AND s.organization_id=$2 AND s.token_hash=$3 FOR UPDATE OF s,u',[actor.sessionId,ctx.organizationId,hashSecret(credentials.sessionToken)])).rows[0];
  const now=ctx.now();
  if(!row?.active||row.revoked_at||row.expires_at<=now||!row.mfa_satisfied_at||row.mfa_satisfied_at>now)throw Error('UNAUTHENTICATED');
  if(!validCsrf(row.csrf_hash,credentials.csrfToken))throw Error('CSRF');
  if(row.role!=='owner')throw Error('OWNER_REQUIRED');
  if(fresh&&now.getTime()-row.mfa_satisfied_at.getTime()>300000)throw Error('FRESH_MFA_REQUIRED');
  return work(tx,actor.userId);
 });
}
export async function loadReleaseBinding(tx:PoolClient,ctx:ReleaseContext,input:{employeeId:string;artifactId:string;destinationId:string}):Promise<ReleaseBinding>{
 const r=(await tx.query(`SELECT a.*,s.id slip_id,e.pay_run_id,n.display_name,p.period_start,p.period_end,d.id destination_id,d.address,d.content_hash destination_hash,d.canonical_payload
 FROM document_artifacts a JOIN payslips s ON s.id=a.payslip_id AND s.organization_id=a.organization_id AND s.employee_id=a.employee_id AND s.content_hash=a.content_hash
 JOIN pay_run_employees e ON e.id=s.pay_run_employee_id AND e.organization_id=a.organization_id AND e.employee_id=a.employee_id
 JOIN pay_runs p ON p.id=e.pay_run_id AND p.organization_id=e.organization_id
 JOIN employees n ON n.id=e.employee_id AND n.organization_id=e.organization_id
 JOIN delivery_destinations d ON d.id=$4 AND d.organization_id=a.organization_id AND d.employee_id=a.employee_id
 JOIN employee_email_verifications v ON v.destination_id=d.id AND v.organization_id=d.organization_id AND v.employee_id=d.employee_id
 WHERE a.id=$1 AND a.organization_id=$2 AND a.employee_id=$3 AND p.status='finalized' AND p.evidence_mode='synthetic'
 AND d.channel='email' AND v.verified_at IS NOT NULL AND v.invalidated_at IS NULL AND d.valid_from<=$5 AND (d.valid_to IS NULL OR d.valid_to>$5)
 AND NOT EXISTS(SELECT 1 FROM delivery_destination_closures c WHERE c.destination_id=d.id AND c.effective_to<=$5) FOR UPDATE OF d`,[input.artifactId,ctx.organizationId,input.employeeId,input.destinationId,ctx.now()])).rows[0];
 if(!r||!/^[A-Za-z0-9._+-]+@example\.invalid$/.test(r.address)||createHash('sha256').update(r.canonical_payload).digest('hex')!==r.destination_hash)throw Error('RELEASE_BINDING_MISMATCH');
 const binding:ReleaseBinding={employeeId:r.employee_id,employeeName:r.display_name,artifactId:r.id,payslipId:r.slip_id,payRunId:r.pay_run_id,destinationId:r.destination_id,destinationHash:r.destination_hash,to:r.address,periodStart:r.period_start.toISOString(),periodEnd:r.period_end.toISOString(),relativePath:r.relative_path,sha256:r.content_hash,bytes:Number(r.size_bytes),passwordVersionId:r.id};
 await attachmentBytes(ctx,binding);
 return binding;
}
export async function attachmentBytes(ctx:Pick<ReleaseContext,'storageRoot'>,binding:ReleaseBinding):Promise<Buffer>{
 if(binding.relativePath!==`${binding.artifactId}.pdf`||!Number.isSafeInteger(binding.bytes)||binding.bytes<1||binding.bytes>20*1024*1024)throw Error('ARTIFACT_MISMATCH');
 const root=resolve(ctx.storageRoot),file=join(root,binding.relativePath),rel=relative(root,file);
 if(rel.startsWith('..'+sep)||rel==='..'||(await lstat(root)).isSymbolicLink()||(await lstat(file)).isSymbolicLink())throw Error('ARTIFACT_MISMATCH');
 const bytes=await readFile(file);
 if(bytes.length!==binding.bytes||createHash('sha256').update(bytes).digest('hex')!==binding.sha256)throw Error('ARTIFACT_MISMATCH');
 return bytes;
}
export async function previewPayslipRelease(ctx:ReleaseContext,credentials:Credentials,input:{employeeId:string;artifactId:string;destinationId:string}):Promise<ReleasePreview>{
 return releaseTransaction(ctx,credentials,false,async(tx,actor)=>{
  const binding=await loadReleaseBinding(tx,ctx,input),id=randomUUID(),now=ctx.now(),expires=new Date(now.getTime()+600000),hash=hashBinding(binding);
  await tx.query('INSERT INTO delivery_drafts(id,organization_id,employee_id,artifact_id,destination_id,destination_hash) VALUES($1,$2,$3,$4,$5,$6)',[id,ctx.organizationId,binding.employeeId,binding.artifactId,binding.destinationId,binding.destinationHash]);
  await tx.query('INSERT INTO payslip_release_previews(id,organization_id,draft_id,actor_id,binding,binding_hash,created_at,expires_at) VALUES($1,$2,$1,$3,$4,$5,$6,$7)',[id,ctx.organizationId,actor,binding,hash,now,expires]);
  return {id,binding,hash,expiresAt:expires.toISOString()};
 });
}
export async function checkedPreview(tx:PoolClient,ctx:ReleaseContext,input:{previewId:string;hash:string}){
 const row=(await tx.query('SELECT p.*,d.status,d.version FROM payslip_release_previews p JOIN delivery_drafts d ON d.id=p.draft_id AND d.organization_id=p.organization_id WHERE p.id=$1 AND p.organization_id=$2 FOR UPDATE OF d',[input.previewId,ctx.organizationId])).rows[0];
 if(!row||row.binding_hash!==input.hash||hashBinding(row.binding)!==input.hash)throw Error('PREVIEW_MISMATCH');
 const binding=row.binding as ReleaseBinding;
 if(hashBinding(await loadReleaseBinding(tx,ctx,binding))!==input.hash)throw Error('PREVIEW_STALE');
 if(row.expires_at<=ctx.now())throw Error('PREVIEW_EXPIRED');
 return {binding,status:row.status as string};
}
