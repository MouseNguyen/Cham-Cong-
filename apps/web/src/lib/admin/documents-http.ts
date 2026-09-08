import type {DocumentDependencies} from '../documents/generate-payslip';
import {generatePayslip} from '../documents/generate-payslip';
import {cookieValue,csrfForToken} from '../auth/session';
import {releaseTransaction,previewPayslipRelease,attachmentBytes,type ReleaseContext} from '../application/commands/preview-payslip-release';
import {releasePayslips} from '../application/commands/release-payslips';
import {confirmManualDelivery} from '../application/commands/confirm-manual-delivery';
import {confirmPasswordHandoff,revealHandoffPassword,type PasswordChannel} from '../delivery/password-handoff';
import {createFakeAdapter} from '../delivery/fake-adapter';
import {runOne} from '../delivery/worker';
const headers={'cache-control':'no-store, private','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
const id=(v:unknown)=>{if(typeof v!=='string'||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v))throw Error('BAD_REQUEST');return v;};
async function body(r:Request):Promise<Record<string,unknown>>{
 if(!r.headers.get('content-type')?.startsWith('application/json'))throw Error('BAD_REQUEST');
 const reader=r.body?.getReader();if(!reader)throw Error('BAD_REQUEST');let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>4096){await reader.cancel();throw Error('BAD_REQUEST');}chunks.push(p.value);}}finally{reader.releaseLock();}
 try{const b:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b as Record<string,unknown>;}catch{throw Error('BAD_REQUEST');}
}
export function createDocumentsHandler(deps:DocumentDependencies&{organizationId:string;origin:string}){
 const ctx:ReleaseContext=deps,origin=new URL(deps.origin);if(origin.origin!==deps.origin)throw Error('CONFIGURATION_REQUIRED');
 const adapter=createFakeAdapter();
 async function artifactGate<T>(artifactId:string,work:()=>Promise<T>):Promise<T>{
  const lock=await ctx.pool.connect();
  try{await lock.query('BEGIN');const row=(await lock.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',[`delivery-ui:${ctx.organizationId}:${artifactId}`])).rows[0];if(!row.locked)throw Error('DELIVERY_BUSY');const result=await work();await lock.query('COMMIT');return result;}
  catch(error){await lock.query('ROLLBACK');throw error;}finally{lock.release();}
 }
 return async(request:Request):Promise<Response>=>{
  try{
   if(request.headers.get('host')!==origin.host||request.headers.get('sec-fetch-site')==='cross-site')throw Error('CSRF');
   const token=cookieValue(request.headers.get('cookie'));if(!token)throw Error('UNAUTHENTICATED');
   const creds={sessionToken:token,csrfToken:request.method==='GET'?csrfForToken(token):request.headers.get('x-csrf-token')??''};
   const url=new URL(request.url);
   if(request.method==='GET')return await releaseTransaction(ctx,creds,false,async tx=>{
    if(url.searchParams.get('view')==='download'){
     const a=(await tx.query(`SELECT a.*,p.status,p.evidence_mode FROM document_artifacts a JOIN payslips s ON s.id=a.payslip_id AND s.organization_id=a.organization_id AND s.employee_id=a.employee_id JOIN pay_run_employees e ON e.id=s.pay_run_employee_id AND e.organization_id=s.organization_id JOIN pay_runs p ON p.id=e.pay_run_id AND p.organization_id=e.organization_id WHERE a.id=$1 AND a.employee_id=$2 AND a.organization_id=$3 AND p.status='finalized' AND p.evidence_mode='synthetic'`,[id(url.searchParams.get('artifactId')),id(url.searchParams.get('employeeId')),ctx.organizationId])).rows[0];
     if(!a)throw Error('NOT_FOUND');
     const bytes=await attachmentBytes(ctx,{artifactId:a.id,relativePath:a.relative_path,bytes:Number(a.size_bytes),sha256:a.content_hash} as Parameters<typeof attachmentBytes>[1]);
     return new Response(new Uint8Array(bytes),{headers:{...headers,'content-type':'application/pdf','content-disposition':`attachment; filename="${a.id}.pdf"`}});
    }
    const payRunId=id(url.searchParams.get('payRunId'));
    const run=(await tx.query("SELECT id FROM pay_runs WHERE id=$1 AND organization_id=$2 AND status='finalized' AND evidence_mode='synthetic'",[payRunId,ctx.organizationId])).rows[0];if(!run)throw Error('NOT_FOUND');
    const rows=(await tx.query(`SELECT e.id AS "payRunEmployeeId",e.employee_id AS "employeeId",n.display_name AS "employeeName",a.id AS "artifactId",a.content_hash AS sha256,a.size_bytes::text AS bytes,
      (SELECT json_agg(json_build_object('id',d.id,'address',d.address)) FROM delivery_destinations d JOIN employee_email_verifications v ON v.destination_id=d.id AND v.organization_id=d.organization_id AND v.employee_id=d.employee_id WHERE d.employee_id=e.employee_id AND d.organization_id=e.organization_id AND d.channel='email' AND v.verified_at IS NOT NULL AND v.invalidated_at IS NULL AND d.valid_from<=$3 AND (d.valid_to IS NULL OR d.valid_to>$3) AND NOT EXISTS(SELECT 1 FROM delivery_destination_closures c WHERE c.destination_id=d.id AND c.effective_to<=$3)) AS destinations,
      (SELECT json_agg(json_build_object('id',p.id,'binding',p.binding,'hash',p.binding_hash,'expiresAt',p.expires_at,'status',d.status,'dispatchStatus',o.status,'receipts',(SELECT coalesce(json_agg(json_build_object('kind',r.kind,'channel',r.channel,'createdAt',r.created_at)),'[]'::json) FROM payslip_release_receipts r WHERE r.preview_id=p.id AND r.organization_id=p.organization_id)) ORDER BY p.created_at DESC) FROM payslip_release_previews p JOIN delivery_drafts d ON d.id=p.draft_id AND d.organization_id=p.organization_id LEFT JOIN payslip_release_receipts r ON r.preview_id=p.id AND r.kind='queued_fake' LEFT JOIN outbox_dispatches o ON o.job_id=r.job_id WHERE p.organization_id=e.organization_id AND d.artifact_id=a.id) AS previews
      FROM pay_run_employees e JOIN employees n ON n.id=e.employee_id AND n.organization_id=e.organization_id LEFT JOIN payslips s ON s.pay_run_employee_id=e.id AND s.organization_id=e.organization_id LEFT JOIN document_artifacts a ON a.payslip_id=s.id AND a.organization_id=s.organization_id WHERE e.pay_run_id=$1 AND e.organization_id=$2 ORDER BY n.display_name,e.id`,[payRunId,ctx.organizationId,ctx.now()])).rows;
    return json({payRunId,rows});
   });
   if(request.method!=='POST')return json({code:'METHOD_NOT_ALLOWED'},405);
   if(request.headers.get('origin')!==deps.origin)throw Error('CSRF');
   const b=await body(request);
   // Authorize before body-specific errors, and repeat inside each consequential service transaction.
   await releaseTransaction(ctx,creds,false,async()=>undefined);
   if(b.confirmed!==true)throw Error('CONFIRMATION_REQUIRED');
   if(b.action==='generate'){
    const payRunEmployeeId=id(b.payRunEmployeeId),employeeId=id(b.employeeId);
    await releaseTransaction(ctx,creds,false,async tx=>{if(!(await tx.query("SELECT e.id FROM pay_run_employees e JOIN pay_runs p ON p.id=e.pay_run_id AND p.organization_id=e.organization_id WHERE e.id=$1 AND e.employee_id=$2 AND e.organization_id=$3 AND p.status='finalized' AND p.evidence_mode='synthetic'",[payRunEmployeeId,employeeId,ctx.organizationId])).rowCount)throw Error('NOT_FOUND');});
    return json(await generatePayslip({organizationId:ctx.organizationId,payRunEmployeeId},deps));
   }
   if(b.action==='preview'){
    const input={employeeId:id(b.employeeId),artifactId:id(b.artifactId),destinationId:id(b.destinationId)};
    return await artifactGate(input.artifactId,async()=>{
     if((await ctx.pool.query("SELECT 1 FROM delivery_drafts WHERE organization_id=$1 AND artifact_id=$2 AND status IN ('queued_fake','operator_confirmed_manual')",[ctx.organizationId,input.artifactId])).rowCount)throw Error('DELIVERY_ALREADY_RECORDED');
     return json(await previewPayslipRelease(ctx,creds,input));
    });
   }
   const input={previewId:id(b.previewId),hash:typeof b.hash==='string'&&/^[a-f0-9]{64}$/.test(b.hash)?b.hash:''};if(!input.hash)throw Error('BAD_REQUEST');
   if(b.action==='release'||b.action==='manual'){
    const p=(await ctx.pool.query('SELECT binding FROM payslip_release_previews WHERE id=$1 AND organization_id=$2',[input.previewId,ctx.organizationId])).rows[0];if(!p)throw Error('PREVIEW_MISMATCH');
    return await artifactGate(id(p.binding.artifactId),async()=>{
     if((await ctx.pool.query("SELECT 1 FROM delivery_drafts WHERE organization_id=$1 AND artifact_id=$2 AND id<>$3 AND status IN ('queued_fake','operator_confirmed_manual')",[ctx.organizationId,p.binding.artifactId,input.previewId])).rowCount)throw Error('DELIVERY_ALREADY_RECORDED');
     if(b.action==='manual')return json(await confirmManualDelivery(ctx,creds,input));
     const result=await releasePayslips(ctx,creds,input);
     const dispatch=(await ctx.pool.query('SELECT status FROM outbox_dispatches WHERE job_id=$1 AND organization_id=$2',[result.jobId,ctx.organizationId])).rows[0];
     if(dispatch?.status==='pending')await runOne({pool:ctx.pool,adapter,organizationId:ctx.organizationId,workerId:'delivery-ui-fake',clock:ctx.now,leaseMs:60000,releaseContext:ctx});
     return json(result);
    });
   }
   if(b.action==='password')return json(await revealHandoffPassword(ctx,creds,input));
   if(b.action==='handoff')return json(await confirmPasswordHandoff(ctx,creds,{...input,channel:b.channel as PasswordChannel}));
   throw Error('BAD_REQUEST');
  }catch(error){
   const code=error instanceof Error?error.message:'';
   const known=['BAD_REQUEST','CSRF','UNAUTHENTICATED','OWNER_REQUIRED','FRESH_MFA_REQUIRED','CONFIRMATION_REQUIRED','NOT_FOUND','RELEASE_BINDING_MISMATCH','ARTIFACT_MISMATCH','PREVIEW_MISMATCH','PREVIEW_STALE','PREVIEW_EXPIRED','RELEASE_STATE_CONFLICT','DELIVERY_ALREADY_RECORDED','DELIVERY_BUSY','DELIVERY_CONFIRMATION_REQUIRED','HANDOFF_CHANNEL_INVALID','HANDOFF_CONFLICT'];
   return json({code:known.includes(code)?code:'DELIVERY_UNAVAILABLE'},code==='UNAUTHENTICATED'?401:code==='NOT_FOUND'?404:code==='BAD_REQUEST'?400:known.includes(code)?409:503);
  }
 };
}
