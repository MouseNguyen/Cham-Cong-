import type { Pool } from 'pg';
import type { AuthRepository } from '../db/repositories/auth';
import type { EmployeesRepository } from '../db/repositories/employees';
import type { PayRunRepository } from '../db/repositories/pay-runs';
import { cookieValue, csrfForToken } from '../auth/session';
import { authorize } from '../auth/authorization';
import { createEmployee } from '../application/commands/create-employee';
import { listEmployees } from '../application/queries/list-employees';
import { getEmployee } from '../application/queries/get-employee';
import { createPayRun } from '../application/commands/create-pay-run';
import { calculatePayRun } from '../application/commands/calculate-pay-run';
import { submitPayRun } from '../application/commands/submit-pay-run';
import { approvePayRun } from '../application/commands/approve-pay-run';
import { finalizePayRun } from '../application/commands/finalize-pay-run';
import { getPayRun } from '../application/queries/get-pay-run';
import { explainCalculation } from '../application/queries/explain-calculation';
import type { CreateEmployeeInput } from '../../../../../packages/contracts/src/employee';
import type { EmployeeSourceBinding } from '../../../../../packages/contracts/src/pay-run';
import { AdminQueries, type CalculatorPeriod } from './queries';

export type AdminDependencies = {
  pool: Pool; auth: AuthRepository; employees: EmployeesRepository; payRuns: PayRunRepository | null;
  organizationId: string; origin: string; calculatorPeriod: CalculatorPeriod | null;
};
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('BAD_REQUEST');
  return value as Record<string, unknown>;
}
function id(value: unknown): string { if (typeof value !== 'string' || !UUID.test(value)) throw Error('BAD_REQUEST'); return value; }
function version(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw Error('BAD_REQUEST'); return value as number; }
async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw Error('BAD_REQUEST');
  const reader = request.body?.getReader(); if (!reader) throw Error('BAD_REQUEST');
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 131072) { await reader.cancel(); throw Error('BAD_REQUEST'); } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  try { return record(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { throw Error('BAD_REQUEST'); }
}

export function createAdminHandler(deps: AdminDependencies) {
  const origin = new URL(deps.origin); if (origin.origin !== deps.origin) throw Error('CONFIGURATION_REQUIRED');
  const queries = new AdminQueries(deps.pool, deps.organizationId);
  return async (request: Request): Promise<Response> => {
    try {
      const token = cookieValue(request.headers.get('cookie')); if (!token) throw Error('UNAUTHENTICATED');
      if (request.headers.get('host') !== origin.host || request.headers.get('sec-fetch-site') === 'cross-site') throw Error('CSRF');
      const session = await deps.auth.session(token);
      authorize(session.actor, 'EMPLOYEE_READ', new Date(), { organizationId: deps.organizationId });
      const readCredentials = { sessionToken: token, csrfToken: csrfForToken(token) };
      const url = new URL(request.url);
      if (request.method === 'GET') {
        switch (url.searchParams.get('view')) {
          case 'overview': return json({
            actor: session.actor, workplaces: await queries.workplaces(), employees: await listEmployees(deps.employees, readCredentials),
            payRuns: await queries.runs(), calculator: { available: !!deps.payRuns, periodStart: deps.calculatorPeriod?.periodStart ?? null, periodEnd: deps.calculatorPeriod?.periodEnd ?? null }, productionReady: false,
          });
          case 'employees': {
            const after = url.searchParams.get('after');
            return json(await listEmployees(deps.employees, readCredentials, after ? { after: id(after) } : {}));
          }
          case 'employee': return json(await getEmployee(deps.employees, readCredentials, id(url.searchParams.get('employeeId'))));
          case 'sources': return json(await queries.sources(id(url.searchParams.get('payRunId')), deps.calculatorPeriod));
          case 'payRun': {
            if (!deps.payRuns) throw Error('CALCULATOR_UNAVAILABLE');
            const runId = id(url.searchParams.get('payRunId'));
            const detail = await getPayRun(deps.payRuns, readCredentials, runId);
            return json({ ...detail, evidence: await queries.calculationEvidence(runId) });
          }
          case 'trace': if (!deps.payRuns) throw Error('CALCULATOR_UNAVAILABLE'); return json({ trace: await explainCalculation(deps.payRuns, readCredentials, id(url.searchParams.get('payRunId')), id(url.searchParams.get('employeeId'))) });
          default: throw Error('BAD_REQUEST');
        }
      }
      if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
      if (request.headers.get('origin') !== deps.origin) throw Error('CSRF');
      const credentials = { sessionToken: token, csrfToken: request.headers.get('x-csrf-token') ?? '' };
      await deps.auth.checkCsrf(credentials.sessionToken, credentials.csrfToken);
      const data = await body(request), input = record(data.input);
      if (data.action === 'createEmployee') {
        id(input.workplaceId); const contract = record(input.contract); record(input.compensation);
        if (typeof input.displayName !== 'string' || typeof contract.startDate !== 'string') throw Error('BAD_REQUEST');
        return json(await createEmployee(deps.employees, credentials, input as CreateEmployeeInput));
      }
      const runs = deps.payRuns, period = deps.calculatorPeriod;
      if (!runs || !period) throw Error('CALCULATOR_UNAVAILABLE');
      // This admin workflow has an accountant maker and a separate owner checker.
      if (['createPayRun','calculatePayRun','submitPayRun'].includes(String(data.action)) && session.actor.role !== 'accountant') throw Error('ACCOUNTANT_MAKER_REQUIRED');
      if (data.action === 'createPayRun') {
        const workplaceId = id(input.workplaceId);
        if (input.periodStart !== period.periodStart || input.periodEnd !== period.periodEnd) throw Error('CALCULATOR_PERIOD_UNAVAILABLE');
        if (!(await queries.workplaces()).some(w => w.id === workplaceId)) throw Error('WORKPLACE_NOT_FOUND');
        const guard = await deps.pool.connect();
        try {
          // Nonblocking shared database lock serializes this façade's base-run creation
          // across server processes without holding queued pool clients.
          const key = JSON.stringify([deps.organizationId, workplaceId, period.periodStart, period.periodEnd]);
          const lock = await guard.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired', [key]);
          if (!lock.rows[0]?.acquired) throw Error('PAY_RUN_CREATION_IN_PROGRESS');
          const existing = (await guard.query<{ id: string; version: number; status: string }>(
            'SELECT p.id,p.version,p.status FROM pay_runs p WHERE p.organization_id=$1 AND p.workplace_id=$2 AND p.period_start=$3 AND p.period_end=$4 AND NOT EXISTS (SELECT 1 FROM adjustment_links a WHERE a.adjustment_run_id=p.id AND a.organization_id=p.organization_id) ORDER BY p.id LIMIT 2',
            [deps.organizationId, workplaceId, period.periodStart, period.periodEnd],
          )).rows;
          if (existing.length > 1) throw Error('DUPLICATE_PAY_RUN_REVIEW_REQUIRED');
          if (existing[0]) return json({ ...existing[0], reconciled: true });
          return json(await createPayRun(runs, credentials, { workplaceId, periodStart: period.periodStart, periodEnd: period.periodEnd }));
        } finally {
          // Destroying this dedicated connection releases every session lock even
          // on query failure; no locked client is returned to the shared pool.
          guard.release(true);
        }
      }
      const target = { payRunId: id(input.payRunId), expectedVersion: version(input.expectedVersion) };
      if (data.action === 'calculatePayRun') {
        const current = await queries.sources(target.payRunId, period);
        if (current.blockers.length) return json({ code: 'SOURCE_REVIEW_REQUIRED', blockers: current.blockers }, 409);
        if (!Array.isArray(input.sources) || input.sources.length !== current.sources.length || !input.sources.length) throw Error('SOURCE_BINDING_STALE');
        const bindings = input.sources.map(value => {
          const row = record(value), existing = current.sources.find(s => s.employeeId === row.employeeId);
          const keys = ['employeeId','snapshotId','snapshotHash','compensationId','compensationHash','rulePackId','rulePackHash'] as const;
          if (!existing || keys.some(key => row[key] !== existing[key])) throw Error('SOURCE_BINDING_STALE');
          return Object.fromEntries(keys.map(key => [key, existing[key]])) as unknown as EmployeeSourceBinding;
        });
        return json(await calculatePayRun(runs, credentials, { ...target, sources: bindings }));
      }
      if (data.action === 'submitPayRun') return json(await submitPayRun(runs, credentials, target));
      if (data.action === 'approvePayRun' || data.action === 'finalizePayRun') {
        authorize(session.actor, data.action === 'approvePayRun' ? 'PAY_RUN_APPROVE' : 'PAY_RUN_FINALIZE', new Date(), { organizationId: deps.organizationId });
        if (data.confirmed !== true) throw Error('CONFIRMATION_REQUIRED');
        return json(await (data.action === 'approvePayRun' ? approvePayRun : finalizePayRun)(runs, credentials, target));
      }
      throw Error('BAD_REQUEST');
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (['UNAUTHENTICATED','AUTHENTICATION_FAILED'].includes(code)) return json({ code }, 401);
      if (['CSRF','FORBIDDEN','FRESH_TOTP_REQUIRED','ACCOUNTANT_MAKER_REQUIRED'].includes(code)) return json({ code }, 403);
      if (code === 'BAD_REQUEST') return json({ code }, 400);
      if (/^[A-Z][A-Z_]{2,80}$/.test(code) && !code.includes('CONFIGURATION')) return json({ code }, 409);
      return json({ code: 'ADMIN_UNAVAILABLE' }, 503);
    }
  };
}
