import { afterAll, expect, test } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { generatePayslip } from '../../../apps/web/src/lib/documents/generate-payslip';
import { documentPool, finalizedFixture, qpdf, passwordFor, inspectPdf, rasterize } from './support';

const pool=documentPool();afterAll(()=>pool.end());
test('finalized synthetic payroll becomes an encrypted hash-bound Vietnamese payslip and replays the same artifact',async()=>{
  const {f,payRunEmployeeId,deps}=await finalizedFixture(pool);
  const artifact=await generatePayslip({organizationId:f.organizationId,payRunEmployeeId},deps);
  expect(artifact.encryption).toBe('AES-256');expect(artifact.employeeId).toBe(f.employeeId);
  const file=join(deps.storageRoot,artifact.relativePath),encrypted=await readFile(file);
  expect(createHash('sha256').update(encrypted).digest('hex')).toBe(artifact.sha256);
  expect(qpdf([file,'--check']).status).toBe(2);
  expect(qpdf([file,'--password=incorrect-synthetic-password','--check']).status).toBe(2);
  const password=await passwordFor(deps.storageRoot,artifact.id,deps.protector);
  expect(password.length).toBeGreaterThanOrEqual(32);
  expect(qpdf([file,`--password=${password}`,'--check']).status).toBe(0);
  const info=qpdf([file,`--password=${password}`,'--show-encryption']);
  expect(info.status).toBe(0);expect(info.output.includes(Buffer.from('AESv3'))).toBe(true);info.output.fill(0);
  const decrypted=qpdf([file,`--password=${password}`,'--decrypt','-']);expect(decrypted.status).toBe(0);
  const inspected=inspectPdf(decrypted.output);
  expect(inspected.pages).toBe(1);expect(inspected.embedded).toBe(true);
  for(const text of ['PHIẾU LƯƠNG','Synthetic W4 employee','09/2026','8.000.000','840.000','7.160.000','Doanh nghiệp đóng','fixture-1',artifact.payslipId])expect(inspected.text).toContain(text);
  expect(inspected.text).not.toContain(password);
  await rasterize(decrypted.output,'one-page');decrypted.output.fill(0);
  expect(await generatePayslip({organizationId:f.organizationId,payRunEmployeeId},deps)).toEqual(artifact);
  const stored=(await pool.query('SELECT d.* FROM document_artifacts d JOIN payslips p ON p.id=d.payslip_id WHERE p.pay_run_employee_id=$1',[payRunEmployeeId])).rows;
  expect(stored).toHaveLength(1);expect(stored[0].content_hash).toBe(artifact.sha256);
  expect((await readdir(deps.storageRoot)).filter(name=>name.endsWith('.pdf'))).toHaveLength(1);
  expect((await readdir(join(deps.storageRoot,'work')))).toHaveLength(0);
},60000);

test('unknown and cross-organization finalized row identifiers never generate a document',async()=>{
  const {f,payRunEmployeeId,deps}=await finalizedFixture(pool);
  await expect(generatePayslip({organizationId:'00000000-0000-4000-8000-000000000001',payRunEmployeeId},deps)).rejects.toThrow('FINALIZED_SOURCE_REQUIRED');
  await expect(generatePayslip({organizationId:f.organizationId,payRunEmployeeId:'../escape'},deps)).rejects.toThrow('INVALID_DOCUMENT_ID');
});

test('sealed inputs reject altered payloads and bindings, and a draft pay run cannot issue a document',async()=>{
  const {f,payRunEmployeeId,deps}=await finalizedFixture(pool);
  const {DOCUMENT_SOURCE_SQL}=await import('../../../apps/web/src/lib/documents/generate-payslip');
  const {payslipViewModel,money}=await import('../../../packages/document-domain/src/payslip-view-model');
  const source=(await pool.query(DOCUMENT_SOURCE_SQL,[payRunEmployeeId,f.organizationId])).rows[0];
  expect(()=>payslipViewModel({...source,canonical_result:source.canonical_result+' '},'synthetic',deps.now())).toThrow('DOCUMENT_SOURCE_HASH_MISMATCH');
  expect(()=>payslipViewModel({...source,input_hash:'0'.repeat(64)},'synthetic',deps.now())).toThrow('DOCUMENT_SOURCE_HASH_MISMATCH');
  expect(()=>payslipViewModel({...source,calculator_artifact_hash:'0'.repeat(64)},'synthetic',deps.now())).toThrow('DOCUMENT_SOURCE_BINDING_MISMATCH');
  expect(money('9007199254740993')).toBe('9.007.199.254.740.993');
  const view=payslipViewModel({...source,national_id:'NEVER_RENDER_NATIONAL_ID',bank_account:'NEVER_RENDER_BANK',social_insurance_id:'NEVER_RENDER_BHXH'},'synthetic',deps.now());
  expect(JSON.stringify(view)).not.toContain('NEVER_RENDER');
  const draft=await finalizedFixture(pool,false);
  await expect(generatePayslip({organizationId:draft.f.organizationId,payRunEmployeeId:draft.payRunEmployeeId},draft.deps)).rejects.toThrow('FINALIZED_SOURCE_REQUIRED');
});

test('long Vietnamese names and multi-page earnings remain embedded, encrypted, readable, and failures clean plaintext',async()=>{
  const {f,payRunEmployeeId,deps}=await finalizedFixture(pool);
  const {DOCUMENT_SOURCE_SQL}=await import('../../../apps/web/src/lib/documents/generate-payslip');
  const {payslipViewModel}=await import('../../../packages/document-domain/src/payslip-view-model');
  const {renderPayslip}=await import('../../../apps/web/src/lib/documents/render-payslip');
  const {storeDocument}=await import('../../../apps/web/src/lib/documents/store-document');
  const {randomBytes,randomUUID}=await import('node:crypto');
  const source=(await pool.query(DOCUMENT_SOURCE_SQL,[payRunEmployeeId,f.organizationId])).rows[0];
  const view=payslipViewModel(source,randomUUID(),deps.now());
  // Presentation stress fixture only; not a fabricated finalized payroll result.
  view.employee='Nguyễn Thị Hoàng Anh Đặng Trần Bảo Ngọc · Nhân viên tổng hợp thử nghiệm';
  view.earnings=Array.from({length:45},(_,i)=>({label:`Khoản thu nhập thử nghiệm ${i+1} · Công việc ngày lễ`,amount:'123.456'}));
  const pdf=await renderPayslip(view,deps);
  try {
    const id=randomUUID(),password=randomBytes(32).toString('base64url'),ownerPassword=randomBytes(32).toString('base64url');
    const artifact=await storeDocument({...deps,id,pdf:Buffer.from(pdf),password,ownerPassword});
    const decrypted=qpdf([join(deps.storageRoot,artifact.relativePath),`--password=${password}`,'--decrypt','-']);
    expect(decrypted.status).toBe(0);
    const inspected=inspectPdf(decrypted.output);
    expect(inspected.pages).toBeGreaterThan(1);expect(inspected.pages).toBeLessThanOrEqual(3);expect(inspected.embedded).toBe(true);
    expect(inspected.text).toContain('Nguyễn Thị Hoàng Anh');expect(inspected.text).toContain('thử nghiệm 45');expect(inspected.text).toContain('THỰC NHẬN');
    await rasterize(decrypted.output,'multi-page');decrypted.output.fill(0);
    for(const failure of ['qpdf','dpapi'] as const){
      const failedId=randomUUID();
      const options={...deps,id:failedId,pdf:Buffer.from(pdf),password,ownerPassword};
      if(failure==='qpdf')options.qpdfPath=join(deps.storageRoot,'absent-qpdf.exe');
      else options.protector={protect:async()=>{throw Error('INJECTED_DPAPI_FAILURE');},unprotect:deps.protector.unprotect};
      await expect(storeDocument(options)).rejects.toThrow('DOCUMENT_STORE_FAILED');
      expect((await readdir(deps.storageRoot)).some(name=>name.startsWith(failedId))).toBe(false);
      expect(await readdir(join(deps.storageRoot,'work'))).toEqual([]);
    }
  } finally {pdf.fill(0);}
},60000);


test('metadata failure rolls back the payslip and removes already-promoted ciphertext and password sidecar',async()=>{
  const {f,payRunEmployeeId,deps}=await finalizedFixture(pool);
  const failingPool=new Proxy(pool,{get(target,key,receiver){
    if(key==='connect')return async()=>{
      const client=await target.connect();
      return new Proxy(client,{get(c,k){
        if(k==='query')return (...args:unknown[])=>{
          if(typeof args[0]==='string'&&args[0].startsWith('INSERT INTO document_artifacts'))return Promise.reject(Error('INJECTED_METADATA_FAILURE'));
          return Reflect.apply(c.query,c,args);
        };
        const value=Reflect.get(c,k);return typeof value==='function'?value.bind(c):value;
      }});
    };
    return Reflect.get(target,key,receiver);
  }});
  await expect(generatePayslip({organizationId:f.organizationId,payRunEmployeeId},{...deps,pool:failingPool})).rejects.toThrow('INJECTED_METADATA_FAILURE');
  expect((await pool.query('SELECT id FROM payslips WHERE pay_run_employee_id=$1',[payRunEmployeeId])).rows).toEqual([]);
  expect(await readdir(deps.storageRoot)).toEqual(['work']);
  expect(await readdir(join(deps.storageRoot,'work'))).toEqual([]);
},60000);
