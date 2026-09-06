import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { AuthRepository } from './auth';
import { authorize, type Command, type UserActor } from '../../auth/authorization';
import { hashSecret, validCsrf } from '../../auth/csrf';
import { withTransaction } from '../transaction';
import type { WindowsSecretProtector } from '../../secrets/windows-dpapi';
import {
  canonicalizeWeeklySchedule,
  hashWeeklySchedule,
  normalizeWeeklySchedule,
  resolveScheduleContext,
  type LocalInterval,
  type ScheduleExceptionKind,
  type WeeklySchedule,
} from '../../../../../../packages/attendance-domain/src/schedule';

export type ScheduleCredentials = { sessionToken: string; csrfToken: string };
type OpeningRow = { id: string; valid_from: Date; effective_to: Date | null; canonical_payload: string; content_hash: string };
type AssignmentRow = { id: string; template_id: string; valid_from: Date; effective_to: Date | null; canonical_payload: string; content_hash: string };
type ExceptionRow = { id: string; kind: ScheduleExceptionKind; local_date: string; canonical_payload: string };

function fail(code: string): never { throw Object.assign(new Error(code), { code }); }
function shopDate(value: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('SCHEDULE_LOCAL_DATE_INVALID');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('SCHEDULE_LOCAL_DATE_INVALID');
  return new Date(parsed.getTime() - 7 * 60 * 60 * 1000);
}
function toShopDate(value: Date): string { return new Date(value.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10); }
function asWeekly(payload: string): WeeklySchedule {
  try { return normalizeWeeklySchedule(JSON.parse(payload) as WeeklySchedule); } catch { fail('SCHEDULE_PAYLOAD_INVALID'); }
}
function asIntervals(payload: string): readonly LocalInterval[] {
  try {
    const parsed = JSON.parse(payload) as { intervals?: readonly LocalInterval[] };
    if (!parsed || !Array.isArray(parsed.intervals)) fail('SCHEDULE_PAYLOAD_INVALID');
    return parsed.intervals;
  } catch (error) {
    if (error instanceof Error && error.message === 'SCHEDULE_PAYLOAD_INVALID') throw error;
    fail('SCHEDULE_PAYLOAD_INVALID');
  }
}

export class SchedulesRepository {
  private readonly auth: AuthRepository;
  private readonly now: () => Date;
  private readonly org: string;

  constructor(private readonly pool: Pool, protector: WindowsSecretProtector, options: { organizationId: string; now?: () => Date }) {
    this.auth = new AuthRepository(pool, protector, options);
    this.org = options.organizationId;
    this.now = options.now ?? (() => new Date());
  }

  private async command<T>(credentials: ScheduleCredentials, permission: Command, work: (tx: PoolClient, actor: UserActor) => Promise<T>): Promise<T> {
    const actor = await this.auth.checkCsrf(credentials.sessionToken, credentials.csrfToken);
    try {
      return await withTransaction(this.pool, async tx => {
        const user = (await tx.query<{ role: UserActor['role']; active: boolean }>('SELECT role, active FROM users WHERE id=$1 AND organization_id=$2 FOR UPDATE', [actor.userId, this.org])).rows[0];
        const session = (await tx.query<{ revoked_at: Date | null; expires_at: Date; mfa_satisfied_at: Date | null; csrf_hash: string | null }>('SELECT revoked_at, expires_at, mfa_satisfied_at, csrf_hash FROM sessions WHERE id=$1 AND organization_id=$2 AND token_hash=$3 FOR UPDATE', [actor.sessionId, this.org, hashSecret(credentials.sessionToken)])).rows[0];
        if (!user?.active || !session || session.revoked_at || session.expires_at <= this.now() || !session.mfa_satisfied_at) fail('UNAUTHENTICATED');
        if (!validCsrf(session.csrf_hash ?? '', credentials.csrfToken)) fail('CSRF');
        const trusted = { ...actor, role: user.role, mfaSatisfiedAt: session.mfa_satisfied_at } as UserActor;
        authorize(trusted, permission, this.now(), { organizationId: this.org });
        return work(tx, trusted);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23P01') fail('OVERLAPPING_PERIOD');
      throw error;
    }
  }

  private async audit(tx: PoolClient, actor: UserActor, action: string, aggregateId: string): Promise<void> {
    await tx.query('INSERT INTO audit_events(id, organization_id, actor_id, action, aggregate_id, created_at) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), this.org, actor.userId, action, aggregateId, this.now()]);
  }

  private async workplace(tx: PoolClient, workplaceId: string): Promise<void> {
    if (!(await tx.query('SELECT id FROM workplaces WHERE id=$1 AND organization_id=$2 FOR UPDATE', [workplaceId, this.org])).rowCount) fail('WORKPLACE_NOT_FOUND');
  }

  private async activeEmployee(tx: PoolClient, employeeId: string, workplaceId: string): Promise<void> {
    const row = (await tx.query<{ status: string }>('SELECT status FROM employees WHERE id=$1 AND organization_id=$2 AND workplace_id=$3 FOR UPDATE', [employeeId, this.org, workplaceId])).rows[0];
    if (!row) fail('EMPLOYEE_NOT_FOUND');
    if (row.status !== 'active') fail('EMPLOYEE_INACTIVE');
  }

  private rejectRetroactive(effectiveFrom: Date): void {
    if (toShopDate(effectiveFrom) < toShopDate(this.now())) fail('RETROACTIVE_SCHEDULE_CHANGE');
  }

  async saveOpeningHours(credentials: ScheduleCredentials, input: { workplaceId: string; expectedVersionId: string | null; effectiveFrom: string; weekly: WeeklySchedule }) {
    const effectiveFrom = shopDate(input.effectiveFrom);
    const canonicalPayload = canonicalizeWeeklySchedule(input.weekly);
    const contentHash = hashWeeklySchedule(input.weekly);
    this.rejectRetroactive(effectiveFrom);
    return this.command(credentials, 'SCHEDULE_MANAGE', async (tx, actor) => {
      await this.workplace(tx, input.workplaceId);
      const current = (await tx.query<OpeningRow>('SELECT v.id,v.valid_from,LEAST(v.valid_to,c.effective_to) AS effective_to,v.canonical_payload,v.content_hash FROM opening_hour_versions v LEFT JOIN opening_hour_closures c ON c.version_id=v.id WHERE v.organization_id=$1 AND v.workplace_id=$2 AND v.valid_from<=$3 AND (LEAST(v.valid_to,c.effective_to) IS NULL OR LEAST(v.valid_to,c.effective_to)>$3)', [this.org, input.workplaceId, effectiveFrom])).rows[0];
      if ((current?.id ?? null) !== input.expectedVersionId) fail('STALE_SCHEDULE_VERSION');
      if (current && effectiveFrom <= current.valid_from) fail('INVALID_EFFECTIVE_DATE');
      if (current) await tx.query('INSERT INTO opening_hour_closures(version_id,organization_id,workplace_id,source_hash,effective_to) VALUES($1,$2,$3,$4,$5)', [current.id, this.org, input.workplaceId, current.content_hash, effectiveFrom]);
      const id = randomUUID();
      await tx.query('INSERT INTO opening_hour_versions(id,organization_id,workplace_id,valid_from,canonical_payload,content_hash) VALUES($1,$2,$3,$4,$5,$6)', [id, this.org, input.workplaceId, effectiveFrom, canonicalPayload, contentHash]);
      await this.audit(tx, actor, 'schedule.opening_hours.saved', id);
      return { versionId: id, contentHash };
    });
  }

  async saveWeeklySchedule(credentials: ScheduleCredentials, input: { employeeId: string; workplaceId: string; expectedAssignmentId: string | null; effectiveFrom: string; weekly: WeeklySchedule }) {
    const effectiveFrom = shopDate(input.effectiveFrom);
    const canonicalPayload = canonicalizeWeeklySchedule(input.weekly);
    const contentHash = hashWeeklySchedule(input.weekly);
    this.rejectRetroactive(effectiveFrom);
    return this.command(credentials, 'SCHEDULE_MANAGE', async (tx, actor) => {
      await this.activeEmployee(tx, input.employeeId, input.workplaceId);
      const current = (await tx.query<AssignmentRow>('SELECT a.id,a.template_id,a.valid_from,LEAST(a.valid_to,c.effective_to) AS effective_to,t.canonical_payload,t.content_hash FROM schedule_assignments a JOIN schedule_templates t ON t.id=a.template_id AND t.organization_id=a.organization_id LEFT JOIN schedule_assignment_closures c ON c.assignment_id=a.id WHERE a.organization_id=$1 AND a.employee_id=$2 AND a.workplace_id=$3 AND a.valid_from<=$4 AND (LEAST(a.valid_to,c.effective_to) IS NULL OR LEAST(a.valid_to,c.effective_to)>$4)', [this.org, input.employeeId, input.workplaceId, effectiveFrom])).rows[0];
      if ((current?.id ?? null) !== input.expectedAssignmentId) fail('STALE_SCHEDULE_VERSION');
      if (current && effectiveFrom <= current.valid_from) fail('INVALID_EFFECTIVE_DATE');
      if (current) await tx.query('INSERT INTO schedule_assignment_closures(assignment_id,organization_id,workplace_id,employee_id,effective_to) VALUES($1,$2,$3,$4,$5)', [current.id, this.org, input.workplaceId, input.employeeId, effectiveFrom]);
      const templateId = randomUUID();
      const assignmentId = randomUUID();
      await tx.query('INSERT INTO schedule_templates(id,organization_id,name,canonical_payload,content_hash) VALUES($1,$2,$3,$4,$5)', [templateId, this.org, `weekly-${contentHash}`, canonicalPayload, contentHash]);
      await tx.query('INSERT INTO schedule_assignments(id,organization_id,workplace_id,employee_id,template_id,valid_from) VALUES($1,$2,$3,$4,$5,$6)', [assignmentId, this.org, input.workplaceId, input.employeeId, templateId, effectiveFrom]);
      await this.audit(tx, actor, 'schedule.weekly_assignment.saved', assignmentId);
      return { assignmentId, templateId, contentHash };
    });
  }

  async setScheduleException(credentials: ScheduleCredentials, input: { employeeId: string; workplaceId: string; expectedExceptionId: string | null; kind: ScheduleExceptionKind; localDate: string; intervals: readonly LocalInterval[] }) {
    const exceptionDate = shopDate(input.localDate);
    this.rejectRetroactive(exceptionDate);
    if (input.kind !== 'date' && input.kind !== 'public_holiday') fail('SCHEDULE_EXCEPTION_KIND_INVALID');
    const intervalPayload = JSON.stringify({ intervals: normalizeWeeklySchedule({ monday: input.intervals, tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] }).monday });
    const contentHash = hashSecret(intervalPayload);
    return this.command(credentials, 'SCHEDULE_MANAGE', async (tx, actor) => {
      await this.activeEmployee(tx, input.employeeId, input.workplaceId);
      if (input.kind === 'public_holiday' && !(await tx.query('SELECT id FROM public_holidays WHERE organization_id=$1 AND holiday_date=$2', [this.org, input.localDate])).rowCount) fail('PUBLIC_HOLIDAY_NOT_FOUND');
      const current = (await tx.query<ExceptionRow>('SELECT e.id,e.kind,e.local_date::text,e.canonical_payload FROM schedule_exceptions e WHERE e.organization_id=$1 AND e.employee_id=$2 AND e.workplace_id=$3 AND e.kind=$4 AND e.local_date=$5 AND NOT EXISTS (SELECT 1 FROM schedule_exception_supersessions s WHERE s.prior_exception_id=e.id) FOR UPDATE', [this.org, input.employeeId, input.workplaceId, input.kind, input.localDate])).rows[0];
      if ((current?.id ?? null) !== input.expectedExceptionId) fail('STALE_SCHEDULE_EXCEPTION');
      const id = randomUUID();
      await tx.query('INSERT INTO schedule_exceptions(id,organization_id,workplace_id,employee_id,kind,local_date,canonical_payload,content_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, this.org, input.workplaceId, input.employeeId, input.kind, input.localDate, intervalPayload, contentHash, this.now()]);
      if (current) await tx.query('INSERT INTO schedule_exception_supersessions(prior_exception_id,replacement_exception_id,organization_id,employee_id,created_at) VALUES($1,$2,$3,$4,$5)', [current.id, id, this.org, input.employeeId, this.now()]);
      await this.audit(tx, actor, 'schedule.exception.set', id);
      return { exceptionId: id, contentHash };
    });
  }

  async getEffectiveSchedule(credentials: ScheduleCredentials, input: { employeeId: string; workplaceId: string; localDate: string }) {
    const at = shopDate(input.localDate);
    return this.command(credentials, 'SCHEDULE_READ', async tx => {
      await this.activeEmployee(tx, input.employeeId, input.workplaceId);
      const opening = (await tx.query<OpeningRow>('SELECT v.id,v.valid_from,LEAST(v.valid_to,c.effective_to) AS effective_to,v.canonical_payload,v.content_hash FROM opening_hour_versions v LEFT JOIN opening_hour_closures c ON c.version_id=v.id WHERE v.organization_id=$1 AND v.workplace_id=$2 AND v.valid_from<=$3 AND (LEAST(v.valid_to,c.effective_to) IS NULL OR LEAST(v.valid_to,c.effective_to)>$3)', [this.org, input.workplaceId, at])).rows[0];
      if (!opening) fail('OPENING_HOURS_NOT_FOUND');
      const assignment = (await tx.query<AssignmentRow>('SELECT a.id,a.template_id,a.valid_from,LEAST(a.valid_to,c.effective_to) AS effective_to,t.canonical_payload,t.content_hash FROM schedule_assignments a JOIN schedule_templates t ON t.id=a.template_id AND t.organization_id=a.organization_id LEFT JOIN schedule_assignment_closures c ON c.assignment_id=a.id WHERE a.organization_id=$1 AND a.employee_id=$2 AND a.workplace_id=$3 AND a.valid_from<=$4 AND (LEAST(a.valid_to,c.effective_to) IS NULL OR LEAST(a.valid_to,c.effective_to)>$4)', [this.org, input.employeeId, input.workplaceId, at])).rows[0];
      const exceptions = (await tx.query<ExceptionRow>('SELECT e.id,e.kind,e.local_date::text,e.canonical_payload FROM schedule_exceptions e WHERE e.organization_id=$1 AND e.employee_id=$2 AND e.workplace_id=$3 AND e.local_date=$4 AND NOT EXISTS (SELECT 1 FROM schedule_exception_supersessions s WHERE s.prior_exception_id=e.id)', [this.org, input.employeeId, input.workplaceId, input.localDate])).rows.map(row => ({ id: row.id, kind: row.kind, localDate: row.local_date, intervals: asIntervals(row.canonical_payload) }));
      const holidays = (await tx.query<{ holiday_date: string }>('SELECT holiday_date::text FROM public_holidays WHERE organization_id=$1 AND holiday_date=$2', [this.org, input.localDate])).rows.map(row => row.holiday_date);
      return resolveScheduleContext({ localDate: input.localDate, openingHours: asWeekly(opening.canonical_payload), employeeWeekly: assignment ? asWeekly(assignment.canonical_payload) : null, exceptions, publicHolidayLocalDates: holidays });
    });
  }
}
