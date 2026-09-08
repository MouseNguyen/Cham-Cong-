import type { Pool } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { WindowsSecretProtector } from '../secrets/windows-dpapi';
import type { DocumentArtifact } from '../../../../../packages/document-domain/src/artifact';
import { payslipViewModel, type PayslipSource } from '../../../../../packages/document-domain/src/payslip-view-model';
import { renderPayslip } from './render-payslip';
import { storeDocument, removeOwnedFile, digest, privateDirectory } from './store-document';
export type DocumentDependencies = { pool: Pool; protector: WindowsSecretProtector; projectRoot: string; storageRoot: string; qpdfPath: string; chromiumPath: string; now: () => Date };
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DOCUMENT_SOURCE_SQL=`SELECT e.*,p.period_start,p.period_end,o.name company_name,n.display_name employee_name,w.timezone,
 s.canonical_payload snapshot_payload,c.canonical_payload compensation_payload,
 public.w4_released_rule_pack_payload(e.rule_pack_id,e.organization_id,e.rule_pack_hash) rule_payload
 FROM pay_run_employees e JOIN pay_runs p ON p.id=e.pay_run_id AND p.organization_id=e.organization_id
 JOIN organizations o ON o.id=e.organization_id JOIN employees n ON n.id=e.employee_id AND n.organization_id=e.organization_id
 JOIN workplaces w ON w.id=e.workplace_id AND w.organization_id=e.organization_id
 JOIN attendance_snapshots s ON s.id=e.snapshot_id AND s.organization_id=e.organization_id AND s.employee_id=e.employee_id AND s.workplace_id=e.workplace_id AND s.content_hash=e.snapshot_hash AND s.status='approved' AND s.period_start=p.period_start AND s.period_end=p.period_end
 JOIN compensation_terms c ON c.id=e.compensation_id AND c.organization_id=e.organization_id AND c.employee_id=e.employee_id AND c.content_hash=e.compensation_hash
 WHERE e.id=$1 AND e.organization_id=$2 AND p.status='finalized' AND p.evidence_mode='synthetic'`;
/** Internal trusted worker entrypoint. Authentication belongs to the caller; no public route. */
export async function generatePayslip(input: { organizationId: string; payRunEmployeeId: string }, deps: DocumentDependencies): Promise<DocumentArtifact> {
  if(!UUID.test(input.organizationId)||!UUID.test(input.payRunEmployeeId))throw Error('INVALID_DOCUMENT_ID');
  const tx=await deps.pool.connect();
  let stored:DocumentArtifact|undefined,commitStarted=false;
  try {
    await tx.query('BEGIN');
    const lock=(await tx.query<{locked:boolean}>('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) locked',[`payslip:${input.organizationId}:${input.payRunEmployeeId}`])).rows[0];
    if(!lock?.locked)throw Error('DOCUMENT_GENERATION_BUSY');
    const source=(await tx.query<PayslipSource & {employee_id:string;pay_run_id:string}>(DOCUMENT_SOURCE_SQL,[input.payRunEmployeeId,input.organizationId])).rows[0];
    if(!source)throw Error('FINALIZED_SOURCE_REQUIRED');
    const payslipId=randomUUID(),view=payslipViewModel(source,payslipId,deps.now());
    const existing=(await tx.query<{id:string;payslip_id:string;employee_id:string;relative_path:string;content_hash:string;payslip_hash:string;size_bytes:string}>(`SELECT d.*,p.content_hash payslip_hash FROM document_artifacts d JOIN payslips p ON p.id=d.payslip_id AND p.organization_id=d.organization_id AND p.employee_id=d.employee_id WHERE p.pay_run_employee_id=$1 AND p.organization_id=$2`,[input.payRunEmployeeId,input.organizationId])).rows;
    if(existing.length>1)throw Error('DOCUMENT_DUPLICATE_METADATA');
    if(existing[0]){
      const row=existing[0];
      if(!UUID.test(row.id)||row.relative_path!==`${row.id}.pdf`||row.employee_id!==source.employee_id||row.payslip_hash!==row.content_hash)throw Error('DOCUMENT_ARTIFACT_MISMATCH');
      await privateDirectory(deps.projectRoot,deps.storageRoot);
      const path=join(deps.storageRoot,row.relative_path),secretPath=join(deps.storageRoot,`${row.id}.secret`);
      if((await lstat(path)).isSymbolicLink()||(await lstat(secretPath)).isSymbolicLink())throw Error('DOCUMENT_ARTIFACT_MISMATCH');
      const bytes=await readFile(path);
      if(digest(bytes)!==row.content_hash||String(bytes.length)!==row.size_bytes)throw Error('DOCUMENT_ARTIFACT_MISMATCH');
      const secret=await deps.protector.unprotect(await readFile(secretPath),`payslip:${row.id}`);
      try {const binding=JSON.parse(secret.toString('utf8')) as {artifactId:string;sha256:string;password:string};if(binding.artifactId!==row.id||binding.sha256!==row.content_hash||typeof binding.password!=='string'||binding.password.length<32)throw Error('DOCUMENT_ARTIFACT_MISMATCH');}finally{secret.fill(0);}
      await tx.query('COMMIT');
      return {id:row.id,payslipId:row.payslip_id,employeeId:row.employee_id,payRunId:source.pay_run_id,relativePath:row.relative_path,sha256:row.content_hash,bytes:bytes.length,mime:'application/pdf',encryption:'AES-256',passwordVersionId:row.id};
    }
    const id=randomUUID(),password=randomBytes(32).toString('base64url'),ownerPassword=randomBytes(32).toString('base64url');
    const pdf=await renderPayslip(view,deps);
    let file;
    try {file=await storeDocument({...deps,id,pdf,password,ownerPassword});}finally{pdf.fill(0);}
    stored={...file,id,payslipId,employeeId:source.employee_id,payRunId:source.pay_run_id,mime:'application/pdf',encryption:'AES-256',passwordVersionId:id};
    await tx.query('INSERT INTO payslips(id,organization_id,employee_id,pay_run_employee_id,content_hash) VALUES($1,$2,$3,$4,$5)',[payslipId,input.organizationId,source.employee_id,input.payRunEmployeeId,file.sha256]);
    await tx.query('INSERT INTO document_artifacts(id,organization_id,employee_id,payslip_id,relative_path,content_hash,size_bytes,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,input.organizationId,source.employee_id,payslipId,file.relativePath,file.sha256,file.bytes,deps.now()]);
    commitStarted=true;
    await tx.query('COMMIT');
    return stored;
  } catch(error) {
    await tx.query('ROLLBACK').catch(()=>undefined);
    // A lost COMMIT response is ambiguous: retain ciphertext for reconciliation.
    if(stored&&!commitStarted){await removeOwnedFile(join(deps.storageRoot,stored.relativePath));await removeOwnedFile(join(deps.storageRoot,`${stored.id}.secret`));}
    if(commitStarted)throw Error('DOCUMENT_COMMIT_OUTCOME_UNKNOWN');
    throw error;
  } finally {tx.release();}
}
