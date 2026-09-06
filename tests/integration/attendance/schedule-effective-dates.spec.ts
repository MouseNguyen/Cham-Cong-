import { afterAll, expect, test } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { SchedulesRepository } from '../../../apps/web/src/lib/db/repositories/schedules';
import { DEFAULT_OPENING_HOURS, type WeeklySchedule } from '../../../packages/attendance-domain/src/schedule';
import { fixture, input, denied } from '../employees/support';
import { Pool } from 'pg';
import { protector } from '../auth/support';

function schedulePool() {
  const value = process.env.PAYSLIP_TEST_DATABASE_URL;
  if (!value) throw Error('OWNED_TEST_DATABASE_REQUIRED');
  const url = new URL(value);
  if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/payslip_w3_01b_synthetic' || url.username !== 'payslip_app') throw Error('UNSAFE_TEST_DATABASE');
  return new Pool({ connectionString: value, max: 4, statement_timeout: 10000 });
}
const pool = schedulePool();
afterAll(() => pool.end());

const weekly: WeeklySchedule = {
  monday: [],
  tuesday: [{ start: '15:00', end: '21:00' }],
  wednesday: [{ start: '15:00', end: '21:00' }],
  thursday: [{ start: '15:00', end: '21:00' }],
  friday: [{ start: '15:00', end: '21:00' }],
  saturday: [{ start: '11:00', end: '21:00' }],
  sunday: [{ start: '11:00', end: '21:00' }],
};

async function scheduleFixture() {
  const base = await fixture(pool);
  const employee = await base.repo.createEmployee(base.credentials, input(base.workplaceId));
  const repo = new SchedulesRepository(pool, protector, { organizationId: base.org, now: () => new Date(base.clock.value) });
  return { ...base, employee, repo };
}

test('opening-hour and weekly versions use half-open effective dates without rewriting earlier context', async () => {
  const s = await scheduleFixture();
  const opening = await s.repo.saveOpeningHours(s.credentials, { workplaceId: s.workplaceId, expectedVersionId: null, effectiveFrom: '2026-01-01', weekly: DEFAULT_OPENING_HOURS });
  const assignment = await s.repo.saveWeeklySchedule(s.credentials, { employeeId: s.employee.employeeId, workplaceId: s.workplaceId, expectedAssignmentId: null, effectiveFrom: '2026-01-01', weekly });
  const laterOpening: WeeklySchedule = { ...DEFAULT_OPENING_HOURS, tuesday: [{ start: '11:00', end: '21:00' }], wednesday: [{ start: '11:00', end: '21:00' }], thursday: [{ start: '11:00', end: '21:00' }], friday: [{ start: '11:00', end: '21:00' }] };
  const later = await s.repo.saveOpeningHours(s.credentials, { workplaceId: s.workplaceId, expectedVersionId: opening.versionId, effectiveFrom: '2026-02-01', weekly: laterOpening });

  expect((await s.repo.getEffectiveSchedule(s.credentials, { employeeId: s.employee.employeeId, workplaceId: s.workplaceId, localDate: '2026-01-27' })).openingIntervals).toEqual([{ start: '15:00', end: '21:00' }]);
  expect((await s.repo.getEffectiveSchedule(s.credentials, { employeeId: s.employee.employeeId, workplaceId: s.workplaceId, localDate: '2026-02-03' })).openingIntervals).toEqual([{ start: '11:00', end: '21:00' }]);
  expect((await pool.query('SELECT count(*)::int AS count FROM opening_hour_versions WHERE organization_id=$1', [s.org])).rows[0].count).toBe(2);
  expect((await pool.query('SELECT source_hash FROM opening_hour_closures WHERE version_id=$1', [opening.versionId])).rows).toHaveLength(1);
  expect(assignment.assignmentId).toBeTruthy();
  expect(later.versionId).not.toBe(opening.versionId);
});

test('date exception has deterministic precedence over holiday exception and weekly schedule', async () => {
  const s = await scheduleFixture();
  await s.repo.saveOpeningHours(s.credentials, { workplaceId: s.workplaceId, expectedVersionId: null, effectiveFrom: '2026-01-01', weekly: DEFAULT_OPENING_HOURS });
  await s.repo.saveWeeklySchedule(s.credentials, { employeeId: s.employee.employeeId, workplaceId: s.workplaceId, expectedAssignmentId: null, effectiveFrom: '2026-01-01', weekly });
  await pool.query("INSERT INTO public_holidays(id,organization_id,holiday_date,name,source_ref) VALUES($1,$2,'2026-09-02','Synthetic holiday','fixture')", [randomUUID(), s.org]);
  const holiday = await s.repo.setScheduleException(s.credentials, { employeeId: s.employee.employeeId, workplaceId: s.workplaceId, expectedExceptionId: null, kind: 'public_holiday', localDate: '2026-09-02', intervals: [] });
  const date = await s.repo.setScheduleException(s.credentials, { employeeId: s.employee.employeeId, workplaceId: s.workplaceId, expectedExceptionId: null, kind: 'date', localDate: '2026-09-02', intervals: [{ start: '12:00', end: '16:00' }] });
  const context = await s.repo.getEffectiveSchedule(s.credentials, { employeeId: s.employee.employeeId, workplaceId: s.workplaceId, localDate: '2026-09-02' });

  expect(context.employeeSource).toBe('date_exception');
  expect(context.employeeIntervals).toEqual([{ start: '12:00', end: '16:00' }]);
  expect(context.isPublicHoliday).toBe(true);
  expect(holiday.exceptionId).not.toBe(date.exceptionId);
  expect(context).not.toHaveProperty('payableDurationMs');
});

test('authenticated commands reject stale versions, inactive/cross-workplace employees and a holiday override without its holiday', async () => {
  const s = await scheduleFixture();
  const opening = await s.repo.saveOpeningHours(s.credentials, { workplaceId: s.workplaceId, expectedVersionId: null, effectiveFrom: '2026-01-01', weekly: DEFAULT_OPENING_HOURS });
  await denied(s.repo.saveOpeningHours(s.credentials, { workplaceId: s.workplaceId, expectedVersionId: null, effectiveFrom: '2026-02-01', weekly: DEFAULT_OPENING_HOURS }), 'STALE_SCHEDULE_VERSION');
  await denied(s.repo.saveWeeklySchedule(s.credentials, { employeeId: s.employee.employeeId, workplaceId: '00000000-0000-0000-0000-000000000000', expectedAssignmentId: null, effectiveFrom: '2026-01-01', weekly }), 'EMPLOYEE_NOT_FOUND');
  await denied(s.repo.setScheduleException(s.credentials, { employeeId: s.employee.employeeId, workplaceId: s.workplaceId, expectedExceptionId: null, kind: 'public_holiday', localDate: '2026-09-02', intervals: [] }), 'PUBLIC_HOLIDAY_NOT_FOUND');
  await s.repo.saveWeeklySchedule(s.credentials, { employeeId: s.employee.employeeId, workplaceId: s.workplaceId, expectedAssignmentId: null, effectiveFrom: '2026-01-01', weekly });
  await s.repo.getEffectiveSchedule(s.credentials, { employeeId: s.employee.employeeId, workplaceId: s.workplaceId, localDate: '2026-01-06' });
  expect(opening.versionId).toBeTruthy();
  expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE organization_id=$1 AND action LIKE 'schedule.%'", [s.org])).rows[0].count).toBeGreaterThanOrEqual(2);
});

test('weekly replacements serialize concurrent callers and preserve immutable source bytes', async () => {
  const s = await scheduleFixture();
  await s.repo.saveOpeningHours(s.credentials, { workplaceId:s.workplaceId, expectedVersionId:null, effectiveFrom:'2026-01-01', weekly });
  const first = await s.repo.saveWeeklySchedule(s.credentials, { employeeId:s.employee.employeeId, workplaceId:s.workplaceId, expectedAssignmentId:null, effectiveFrom:'2026-01-01', weekly });
  const before = (await pool.query('SELECT * FROM schedule_assignments WHERE id=$1',[first.assignmentId])).rows;
  const next:WeeklySchedule = {...weekly,tuesday:[{start:'11:00',end:'21:00'}]};
  const change = { employeeId:s.employee.employeeId,workplaceId:s.workplaceId,expectedAssignmentId:first.assignmentId,effectiveFrom:'2026-02-01',weekly:next };
  const results = await Promise.allSettled([s.repo.saveWeeklySchedule(s.credentials,change),s.repo.saveWeeklySchedule(s.credentials,change)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;
  expect(rejected.reason.message).toBe('STALE_SCHEDULE_VERSION');
  expect((await s.repo.getEffectiveSchedule(s.credentials,{employeeId:s.employee.employeeId,workplaceId:s.workplaceId,localDate:'2026-01-27'})).employeeIntervals).toEqual(weekly.tuesday);
  expect((await s.repo.getEffectiveSchedule(s.credentials,{employeeId:s.employee.employeeId,workplaceId:s.workplaceId,localDate:'2026-02-03'})).employeeIntervals).toEqual(next.tuesday);
  expect((await pool.query('SELECT * FROM schedule_assignments WHERE id=$1',[first.assignmentId])).rows).toEqual(before);
  await expect(pool.query('UPDATE schedule_assignments SET valid_to=$2 WHERE id=$1',[first.assignmentId,new Date('2026-02-01Z')])).rejects.toMatchObject({code:'42501'});
  await expect(pool.query('DELETE FROM schedule_assignment_closures WHERE assignment_id=$1',[first.assignmentId])).rejects.toMatchObject({code:'55000'});
});

test('overlapping inserts roll back the new template and audit, preserving the future assignment', async () => {
  const s=await scheduleFixture();
  await s.repo.saveWeeklySchedule(s.credentials,{employeeId:s.employee.employeeId,workplaceId:s.workplaceId,expectedAssignmentId:null,effectiveFrom:'2026-03-01',weekly});
  const counts=async()=>({templates:(await pool.query('SELECT count(*)::int n FROM schedule_templates WHERE organization_id=$1',[s.org])).rows[0].n,audits:(await pool.query('SELECT count(*)::int n FROM audit_events WHERE organization_id=$1',[s.org])).rows[0].n});
  const before=await counts();
  await denied(s.repo.saveWeeklySchedule(s.credentials,{employeeId:s.employee.employeeId,workplaceId:s.workplaceId,expectedAssignmentId:null,effectiveFrom:'2026-02-01',weekly}),'OVERLAPPING_PERIOD');
  expect(await counts()).toEqual(before);
});

test('commands enforce CSRF, organization, current session and inactive employee boundaries', async () => {
  const s=await scheduleFixture();
  const request={employeeId:s.employee.employeeId,workplaceId:s.workplaceId,expectedAssignmentId:null,effectiveFrom:'2026-01-01',weekly};
  await denied(s.repo.saveWeeklySchedule({...s.credentials,csrfToken:'invalid'},request),'CSRF');
  const foreign=await scheduleFixture();
  await denied(s.repo.saveWeeklySchedule(s.credentials,{...request,employeeId:foreign.employee.employeeId,workplaceId:foreign.workplaceId}),'EMPLOYEE_NOT_FOUND');
  const accountant=await fixture(pool,'accountant',s.org);
  await s.repo.saveWeeklySchedule(accountant.credentials,request);
  await pool.query("UPDATE employees SET status='inactive' WHERE id=$1",[s.employee.employeeId]);
  await denied(s.repo.setScheduleException(s.credentials,{employeeId:s.employee.employeeId,workplaceId:s.workplaceId,expectedExceptionId:null,kind:'date',localDate:'2026-02-01',intervals:[]}),'EMPLOYEE_INACTIVE');
  await pool.query('UPDATE sessions SET revoked_at=$2 WHERE user_id=$1',[accountant.id,new Date(accountant.clock.value)]);
  await denied(s.repo.saveWeeklySchedule(accountant.credentials,request),'UNAUTHENTICATED');
});

test('exception supersession keeps prior bytes, rejects stale and retroactive changes, and audits atomically', async () => {
  const s=await scheduleFixture();
  await s.repo.saveOpeningHours(s.credentials,{workplaceId:s.workplaceId,expectedVersionId:null,effectiveFrom:'2026-01-01',weekly});
  const change={employeeId:s.employee.employeeId,workplaceId:s.workplaceId,expectedExceptionId:null,kind:'date' as const,localDate:'2026-02-03',intervals:[{start:'12:00',end:'16:00'}] as const};
  const first=await s.repo.setScheduleException(s.credentials,change);
  const before=(await pool.query('SELECT * FROM schedule_exceptions WHERE id=$1',[first.exceptionId])).rows;
  const second=await s.repo.setScheduleException(s.credentials,{...change,expectedExceptionId:first.exceptionId,intervals:[]});
  expect(second.exceptionId).not.toBe(first.exceptionId);
  await denied(s.repo.setScheduleException(s.credentials,{...change,expectedExceptionId:first.exceptionId}),'STALE_SCHEDULE_EXCEPTION');
  await denied(s.repo.setScheduleException(s.credentials,{...change,localDate:'2025-12-31'}),'RETROACTIVE_SCHEDULE_CHANGE');
  expect((await pool.query('SELECT * FROM schedule_exceptions WHERE id=$1',[first.exceptionId])).rows).toEqual(before);
  expect((await s.repo.getEffectiveSchedule(s.credentials,{employeeId:s.employee.employeeId,workplaceId:s.workplaceId,localDate:'2026-02-03'})).employeeIntervals).toEqual([]);
  await expect(pool.query('DELETE FROM schedule_exception_supersessions WHERE prior_exception_id=$1',[first.exceptionId])).rejects.toMatchObject({code:'55000'});
});

test('schedule writes leave raw clock milliseconds and approved snapshot payloads untouched', async () => {
  const s=await scheduleFixture(),clockId=randomUUID(),snapshotId=randomUUID();
  await pool.query("INSERT INTO clock_events(id,organization_id,workplace_id,employee_id,idempotency_key,direction,occurred_at,request_hash) VALUES($1,$2,$3,$4,$5,'IN','2026-01-06T08:00:00.123Z',$6)",[clockId,s.org,s.workplaceId,s.employee.employeeId,clockId,createHash('sha256').update(clockId).digest('hex')]);
  const {archiveSnapshot}=await import('../../../apps/web/src/lib/db/repositories/snapshots');
  const client=await pool.connect();
  try { await archiveSnapshot(client,{id:snapshotId,organizationId:s.org,workplaceId:s.workplaceId,employeeId:s.employee.employeeId,periodStart:new Date('2026-01-01Z'),periodEnd:new Date('2026-02-01Z'),canonicalPayload:'{"synthetic":true,"durationMs":"21600123"}',approvedBy:s.id}); } finally {client.release();}
  const before={clock:(await pool.query('SELECT * FROM clock_events WHERE id=$1',[clockId])).rows,snapshot:(await pool.query('SELECT * FROM attendance_snapshots WHERE id=$1',[snapshotId])).rows};
  await s.repo.saveOpeningHours(s.credentials,{workplaceId:s.workplaceId,expectedVersionId:null,effectiveFrom:'2026-02-01',weekly});
  await s.repo.saveWeeklySchedule(s.credentials,{employeeId:s.employee.employeeId,workplaceId:s.workplaceId,expectedAssignmentId:null,effectiveFrom:'2026-02-01',weekly});
  const after={clock:(await pool.query('SELECT * FROM clock_events WHERE id=$1',[clockId])).rows,snapshot:(await pool.query('SELECT * FROM attendance_snapshots WHERE id=$1',[snapshotId])).rows};
  expect(after).toEqual(before);
  expect(after.clock[0].occurred_at.getUTCMilliseconds()).toBe(123);
  expect((await pool.query('SELECT count(*)::int n FROM pay_runs WHERE organization_id=$1',[s.org])).rows[0].n).toBe(0);
});
