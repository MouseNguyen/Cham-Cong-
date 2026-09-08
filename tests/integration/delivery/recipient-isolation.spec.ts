import {test,expect,afterAll,beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {previewPayslipRelease} from '../../../apps/web/src/lib/application/commands/preview-payslip-release';
import {releasePayslips} from '../../../apps/web/src/lib/application/commands/release-payslips';
import {confirmManualDelivery} from '../../../apps/web/src/lib/application/commands/confirm-manual-delivery';
import {confirmPasswordHandoff,passwordHandoffDraft} from '../../../apps/web/src/lib/delivery/password-handoff';
import {manualHandoff} from '../../../apps/web/src/lib/delivery/zalo-manual-adapter';
import {createFakeAdapter} from '../../../apps/web/src/lib/delivery/fake-adapter';
import {runOne} from '../../../apps/web/src/lib/delivery/worker';
import {createGmailAdapter,payslipMime} from '../../../apps/web/src/lib/delivery/gmail-adapter';
import {PAYSLIP_SUBJECT,PAYSLIP_BODY} from '../../../apps/web/src/lib/delivery/types';
import {releasePool,releaseFixture} from './release-support';
const pool=releasePool();afterAll(()=>pool.end());let f:Awaited<ReturnType<typeof releaseFixture>>;
beforeAll(async()=>{f=await releaseFixture(pool);},60000);
test('unauthenticated caller cannot preview a release',async()=>{await expect(previewPayslipRelease(f.ctx,{sessionToken:'invalid',csrfToken:'invalid'},f.input)).rejects.toThrow('UNAUTHENTICATED');});
test('owner preview -> release -> fake acceptance is bound and idempotent',async()=>{
 const preview=await previewPayslipRelease(f.ctx,f.f.ownerCredentials,f.input);
 expect(preview.binding.sha256).toBe(f.artifact.sha256);expect(preview.binding.employeeId).toBe(f.f.employeeId);
 const request={previewId:preview.id,hash:preview.hash},released=await releasePayslips(f.ctx,f.f.ownerCredentials,request);
 expect(await releasePayslips(f.ctx,f.f.ownerCredentials,request)).toEqual(released);
 const adapter=createFakeAdapter();const result=await runOne({pool,adapter,organizationId:f.f.organizationId,workerId:'synthetic-release',clock:f.ctx.now,leaseMs:60000,releaseContext:f.ctx});
 expect(result).toEqual({jobId:released.jobId,outcome:'accepted'});expect(adapter.sendCount).toBe(1);
 expect(await runOne({pool,adapter,organizationId:f.f.organizationId,workerId:'synthetic-release',clock:f.ctx.now,leaseMs:60000,releaseContext:f.ctx})).toBeNull();
 const rows=(await pool.query('SELECT kind,channel FROM payslip_release_receipts WHERE preview_id=$1',[preview.id])).rows;
 expect(rows).toEqual([{kind:'queued_fake',channel:'fake_email'}]);
 expect((await pool.query('SELECT status FROM pay_runs WHERE id=$1',[f.run.id])).rows[0].status).toBe('finalized');
});
test('wrong role, CSRF, stale MFA, cross-employee and mismatched preview all reject',async()=>{
 await expect(previewPayslipRelease(f.ctx,f.f.accountantCredentials,f.input)).rejects.toThrow('OWNER_REQUIRED');
 await expect(previewPayslipRelease(f.ctx,{...f.f.ownerCredentials,csrfToken:'wrong'},f.input)).rejects.toThrow('CSRF');
 await expect(previewPayslipRelease(f.ctx,f.f.ownerCredentials,{...f.input,employeeId:randomUUID()})).rejects.toThrow('RELEASE_BINDING_MISMATCH');
 const preview=await previewPayslipRelease(f.ctx,f.f.ownerCredentials,f.input);
 await expect(releasePayslips(f.ctx,f.f.ownerCredentials,{previewId:preview.id,hash:'0'.repeat(64)})).rejects.toThrow('PREVIEW_MISMATCH');
 await expect(releasePayslips({...f.ctx,now:()=>new Date('2026-09-05T00:11:00Z')},f.f.ownerCredentials,{previewId:preview.id,hash:preview.hash})).rejects.toThrow('FRESH_MFA_REQUIRED');
});
test('changed PDF and invalidated destination cannot release an approved preview',async()=>{
 const p=await previewPayslipRelease(f.ctx,f.f.ownerCredentials,f.input),request={previewId:p.id,hash:p.hash},file=join(f.ctx.storageRoot,f.artifact.relativePath),bytes=await readFile(file);
 try{await writeFile(file,Buffer.from('synthetic-corruption'));await expect(releasePayslips(f.ctx,f.f.ownerCredentials,request)).rejects.toThrow('ARTIFACT_MISMATCH');}finally{await writeFile(file,bytes);}
 await pool.query('UPDATE employee_email_verifications SET invalidated_at=$2 WHERE destination_id=$1',[f.destinationId,f.ctx.now()]);
 try{await expect(releasePayslips(f.ctx,f.f.ownerCredentials,request)).rejects.toThrow('RELEASE_BINDING_MISMATCH');}finally{await pool.query('UPDATE employee_email_verifications SET invalidated_at=NULL WHERE destination_id=$1',[f.destinationId]);}
});
test('manual receipt and separate password handoff are truthful and secret-free',async()=>{
 const p=await previewPayslipRelease(f.ctx,f.f.ownerCredentials,f.input),request={previewId:p.id,hash:p.hash};
 const draft=manualHandoff(p);expect(draft.status).toBe('manual_handoff_draft');expect(draft.sha256).toBe(f.artifact.sha256);
 const confirmed=await confirmManualDelivery(f.ctx,f.f.ownerCredentials,request);expect(confirmed.status).toBe('operator_confirmed_manual');
 expect(await confirmManualDelivery(f.ctx,f.f.ownerCredentials,request)).toEqual(confirmed);
 await expect(releasePayslips(f.ctx,f.f.ownerCredentials,request)).rejects.toThrow('RELEASE_STATE_CONFLICT');
 const passwordDraft=passwordHandoffDraft(p,'in_person');expect(passwordDraft.status).toBe('password_handoff_draft');expect('password' in passwordDraft).toBe(false);
 const handoff=await confirmPasswordHandoff(f.ctx,f.f.ownerCredentials,passwordDraft);expect(handoff.passwordVersionId).toBe(f.artifact.id);
 const receipts=(await pool.query('SELECT * FROM payslip_release_receipts WHERE preview_id=$1',[p.id])).rows;
 expect(receipts).toHaveLength(2);expect(receipts.every(r=>r.actor_id===f.f.ownerId)).toBe(true);
 expect(receipts.every(r=>!('password' in r))).toBe(true);
 await expect(pool.query("UPDATE payslip_release_receipts SET channel='phone' WHERE preview_id=$1",[p.id])).rejects.toThrow();
});
test('MIME contains one exact encrypted PDF and Gmail stays disabled',async()=>{
 const p=await previewPayslipRelease(f.ctx,f.f.ownerCredentials,f.input),pdf=await readFile(join(f.ctx.storageRoot,f.artifact.relativePath));
 const message={jobId:randomUUID(),idempotencyKey:randomUUID(),to:p.binding.to,subject:PAYSLIP_SUBJECT,body:PAYSLIP_BODY,attachment:p.binding};
 const mime=payslipMime(message,pdf).toString('utf8');expect((mime.match(/^To:/gm)||[])).toHaveLength(1);expect(mime).not.toMatch(/^(Cc|Bcc):/m);expect((mime.match(/Content-Disposition: attachment/g)||[])).toHaveLength(1);
 const body=mime.split('Content-Transfer-Encoding: base64\r\n\r\n').at(-1)!.split('\r\n--')[0]!.replace(/\r\n/g,'');expect(Buffer.from(body,'base64')).toEqual(pdf);
 expect(()=>payslipMime({...message,to:'outsider@example.com'},pdf)).toThrow('SYNTHETIC_ONLY');expect(()=>payslipMime(message,Buffer.from('wrong'))).toThrow('ATTACHMENT_MISMATCH');
 await expect(createGmailAdapter().send()).rejects.toThrow('GMAIL_DISABLED');
});
