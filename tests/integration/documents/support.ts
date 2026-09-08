import { Pool } from 'pg';
import { join } from 'node:path';
import { readFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fixture, authForFixture, calculatorContext, credentials, sourceBinding } from '../pay-runs/support';
import { PayRunRepository } from '../../../apps/web/src/lib/db/repositories/pay-runs';
import { createWindowsDpapi } from '../../../apps/web/src/lib/secrets/windows-dpapi';
import { privateDirectory } from '../../../apps/web/src/lib/documents/store-document';

export const root = process.cwd();
export const qpdfPath = join(root,'.tools/qpdf/12.4.1/qpdf-12.4.1-mingw64/bin/qpdf.exe');
export const bundled = 'C:/Users/ducng/.cache/codex-runtimes/codex-primary-runtime/dependencies';
export const chromiumPath = join(root,'.tools/playwright/chromium-1243/chrome-win64/chrome.exe');
export function documentPool() {
  const value = process.env.PAYSLIP_TEST_DATABASE_URL;
  if (!value) throw Error('OWNED_DOCUMENT_DATABASE_REQUIRED');
  const url = new URL(value);
  if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/payslip_w6_01_synthetic' || url.username !== 'payslip_app') throw Error('UNSAFE_DOCUMENT_DATABASE');
  return new Pool({ connectionString:value,max:4,statement_timeout:10000 });
}
export async function finalizedFixture(pool: Pool, finalized=true) {
  const client = await pool.connect();
  let f;
  const previous = process.env.PAYSLIP_DB_TEST_MODE;
  try { process.env.PAYSLIP_DB_TEST_MODE='Green'; f=await fixture(client); }
  finally { if(previous===undefined)delete process.env.PAYSLIP_DB_TEST_MODE;else process.env.PAYSLIP_DB_TEST_MODE=previous;client.release(); }
  const repo = new PayRunRepository(pool,authForFixture(pool,f),{organizationId:f.organizationId,now:()=>new Date('2026-09-05T00:05:00Z'),calculator:calculatorContext(f)});
  const run=await repo.create(credentials(f,'accountant'),{workplaceId:f.workplaceId,periodStart:'2026-08-31T17:00:00Z',periodEnd:'2026-09-30T17:00:00Z'});
  await repo.calculate(credentials(f,'accountant'),{payRunId:run.id,expectedVersion:0,sources:[sourceBinding(f)]});
  await repo.submit(credentials(f,'accountant'),{payRunId:run.id,expectedVersion:1});
  await repo.approve(credentials(f,'owner'),{payRunId:run.id,expectedVersion:2});
  if(finalized)await repo.finalize(credentials(f,'owner'),{payRunId:run.id,expectedVersion:3});
  const employee=(await pool.query('SELECT id FROM pay_run_employees WHERE pay_run_id=$1',[run.id])).rows[0] as {id:string};
  const storageRoot=join(root,'.tmp/PAY-W6-01/documents',randomUUID());
  return { f, run, payRunEmployeeId:employee.id, deps:{pool,projectRoot:root,storageRoot,qpdfPath,chromiumPath,protector:createWindowsDpapi({projectRoot:root}),now:()=>new Date('2026-10-01T03:00:00Z')} };
}
export function qpdf(args: string[]) {
  if(args.some(arg=>/[\r\n]/.test(arg)))throw Error('INVALID_QPDF_ARGUMENT');
  const result=spawnSync(qpdfPath,['@-'],{input:Buffer.from(args.join('\n')+'\n'),windowsHide:true,timeout:15000,maxBuffer:20*1024*1024});
  if(result.error)throw Error('QPDF_QA_PROCESS_FAILED');
  // Never forward stderr: qpdf inspection can contain a supplied password.
  return {status:result.status,output:result.stdout};
}
export async function passwordFor(storageRoot:string,artifactId:string,protector:ReturnType<typeof createWindowsDpapi>) {
  const cipher=await readFile(join(storageRoot,`${artifactId}.secret`));
  const plain=await protector.unprotect(cipher,`payslip:${artifactId}`);
  try{return (JSON.parse(plain.toString('utf8')) as {password:string}).password;}finally{plain.fill(0);}
}
export function inspectPdf(bytes:Buffer) {
  const code="import sys,io,json; from pypdf import PdfReader; r=PdfReader(io.BytesIO(sys.stdin.buffer.read())); fonts=[v.get_object() for p in r.pages for v in p.get('/Resources',{}).get('/Font',{}).values()]; embedded=all(('/FontDescriptor' in f and any(k in f['/FontDescriptor'] for k in ['/FontFile','/FontFile2','/FontFile3'])) or ('/DescendantFonts' in f and any(k in f['/DescendantFonts'][0].get_object().get('/FontDescriptor',{}) for k in ['/FontFile','/FontFile2','/FontFile3'])) for f in fonts); print(json.dumps({'text':'\\n'.join(p.extract_text() for p in r.pages),'pages':len(r.pages),'embedded':embedded and len(fonts)>0},ensure_ascii=True))";
  const result=spawnSync(join(bundled,'python/python.exe'),['-c',code],{input:bytes,windowsHide:true,timeout:15000,maxBuffer:4*1024*1024});
  if(result.status!==0)throw Error('PDF_TEXT_QA_FAILED');
  return JSON.parse(result.stdout.toString('utf8')) as {text:string;pages:number;embedded:boolean};
}
export async function rasterize(bytes:Buffer,name:string) {
  const dir=join(root,'.tmp/PAY-W6-01/qa',randomUUID());await privateDirectory(root,dir);
  const {writeFile}=await import('node:fs/promises');const input=join(dir,'input.pdf');
  try {
    await writeFile(input,bytes,{flag:'wx'});
    const output=join(root,`ops/evidence/PAY-W6-01-${name}`);
    const result=spawnSync(join(bundled,'native/poppler/Library/bin/pdftoppm.exe'),['-png','-r','90',input,output],{windowsHide:true,timeout:30000,stdio:'pipe'});
    if(result.status!==0)throw Error('PDF_RASTER_QA_FAILED');
  } finally {for(const file of await readdir(dir))await unlink(join(dir,file));await rmdir(dir);}
}
