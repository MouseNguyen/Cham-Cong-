import { Pool } from 'pg';
import { isAbsolute } from 'node:path';
import { AuthRepository } from '../db/repositories/auth';
import { EmployeesRepository } from '../db/repositories/employees';
import { PayRunRepository } from '../db/repositories/pay-runs';
import { createWindowsDpapi } from '../secrets/windows-dpapi';
import { inputFromFixture, calculatePayroll } from '../../../../../packages/payroll-domain/src/calculate';
import { createAdminHandler } from './http';
import { createDocumentsHandler } from './documents-http';

type Runtime = { pool: Pool; handle: ReturnType<typeof createAdminHandler>; documents: ReturnType<typeof createDocumentsHandler> | null };
type CalculatorConfig = { id: string; version: string; canonicalizationVersion: string; artifactHash: string; inputTemplate: Record<string, unknown>; periodStart: string; periodEnd: string };
const state = globalThis as typeof globalThis & { paySlipAdminRuntime?: Runtime };
function runtime(): Runtime {
  if (state.paySlipAdminRuntime) return state.paySlipAdminRuntime;
  const connection = process.env.PAYSLIP_AUTH_DATABASE_URL, organizationId = process.env.PAYSLIP_ORGANIZATION_ID,
    root = process.env.PAYSLIP_PROJECT_ROOT, origin = process.env.PAYSLIP_ADMIN_ORIGIN;
  if (!connection || !organizationId || !root || !isAbsolute(root) || !origin) throw Error('CONFIGURATION_REQUIRED');
  const protector = createWindowsDpapi({ projectRoot: root });
  // Configuration is explicit and supplied by the trusted server launcher. No test imports or silent defaults.
  const raw = process.env.PAYSLIP_CALCULATOR_CONFIG;
  let config: CalculatorConfig | null = null;
  if (raw) {
    const parsed = JSON.parse(raw) as CalculatorConfig;
    const input = inputFromFixture(parsed.inputTemplate);
    calculatePayroll(input);
    if (input.mode !== 'synthetic_preview' || parsed.id !== input.calculator.id || parsed.version !== input.calculator.version || parsed.artifactHash !== input.calculator.sourceArtifactSha256 || parsed.canonicalizationVersion !== input.calculator.canonicalizationVersion) throw Error('CONFIGURATION_REQUIRED');
    const start = new Date(parsed.periodStart), end = new Date(parsed.periodEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) throw Error('CONFIGURATION_REQUIRED');
    const localStart = new Date(start.getTime() + 7 * 3600000), localEnd = new Date(end.getTime() + 7 * 3600000);
    if (localStart.getUTCDate() !== 1 || localEnd.getUTCDate() !== 1 || localStart.toISOString().slice(11) !== '00:00:00.000Z' || localEnd.toISOString().slice(11) !== '00:00:00.000Z' || Date.UTC(localStart.getUTCFullYear(),localStart.getUTCMonth()+1,1) !== localEnd.getTime()) throw Error('CONFIGURATION_REQUIRED');
    const from = localStart.toISOString().slice(0,10), to = localEnd.toISOString().slice(0,10);
    if (Object.values(input.ruleBinding.componentDates).some(date => date < from || date >= to)) throw Error('CONFIGURATION_REQUIRED');
    config = { ...parsed, periodStart: start.toISOString(), periodEnd: end.toISOString() };
  }
  const pool = new Pool({ connectionString: connection, max: 3, connectionTimeoutMillis: 3000, statement_timeout: 10000 });
  const auth = new AuthRepository(pool, protector, { organizationId });
  const employees = new EmployeesRepository(pool, protector, { organizationId });
  const payRuns = config ? new PayRunRepository(pool, auth, { organizationId, now: () => new Date(), calculator: config }) : null;
  const storageRoot=process.env.PAYSLIP_DOCUMENT_STORAGE,qpdfPath=process.env.PAYSLIP_QPDF_PATH,chromiumPath=process.env.PAYSLIP_CHROMIUM_PATH;
  const documents=storageRoot&&qpdfPath&&chromiumPath&&[storageRoot,qpdfPath,chromiumPath].every(isAbsolute)
    ?createDocumentsHandler({pool,protector,projectRoot:root,storageRoot,qpdfPath,chromiumPath,organizationId,origin,now:()=>new Date()}):null;
  return state.paySlipAdminRuntime = { pool, documents, handle: createAdminHandler({ pool, auth, employees, payRuns, organizationId, origin, calculatorPeriod: config }) };
}
export async function documentsRoute(request:Request):Promise<Response>{
 try{const handle=runtime().documents;if(!handle)throw Error();return await handle(request);}
 catch{return Response.json({code:'DELIVERY_UNAVAILABLE'},{status:503,headers:{'cache-control':'no-store'}});}
}
export async function adminRoute(request: Request): Promise<Response> {
  try { return await runtime().handle(request); }
  catch { return Response.json({ code: 'ADMIN_UNAVAILABLE' }, { status: 503, headers: { 'cache-control': 'no-store' } }); }
}
