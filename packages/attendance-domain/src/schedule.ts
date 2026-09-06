import { createHash } from 'node:crypto';

export type ScheduleWeekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type LocalTime = `${number}${number}:${number}${number}`;

export interface LocalInterval {
  readonly start: LocalTime;
  readonly end: LocalTime;
}

export type WeeklySchedule = Readonly<Record<ScheduleWeekday, readonly LocalInterval[]>>;
export type ScheduleExceptionKind = 'date' | 'public_holiday';

export interface ScheduleException {
  readonly id: string;
  readonly kind: ScheduleExceptionKind;
  readonly localDate: string;
  readonly intervals: readonly LocalInterval[];
}

export interface EffectiveScheduleContext {
  readonly localDate: string;
  readonly isPublicHoliday: boolean;
  readonly openingIntervals: readonly LocalInterval[];
  readonly employeeIntervals: readonly LocalInterval[];
  readonly employeeSource: 'date_exception' | 'holiday_exception' | 'weekly_assignment' | 'none';
}

const WEEKDAYS: readonly ScheduleWeekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function freezeIntervals(intervals: readonly LocalInterval[]): readonly LocalInterval[] {
  return Object.freeze(intervals.map(interval => Object.freeze({ ...interval })));
}

function timeMinutes(time: string): number {
  if (!TIME.test(time)) throw new Error('SCHEDULE_TIME_INVALID');
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function assertLocalDate(value: string): void {
  if (!DATE.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new Error('SCHEDULE_LOCAL_DATE_INVALID');
  }
}

function weekdayForLocalDate(value: string): ScheduleWeekday {
  assertLocalDate(value);
  const day = new Date(`${value}T00:00:00Z`).getUTCDay();
  return WEEKDAYS[(day + 6) % 7]!;
}

export function canonicalIntervals(intervals: readonly LocalInterval[]): readonly LocalInterval[] {
  if (!Array.isArray(intervals)) throw new Error('SCHEDULE_INTERVALS_INVALID');
  const sorted = intervals.map(interval => {
    if (!interval || typeof interval.start !== 'string' || typeof interval.end !== 'string') throw new Error('SCHEDULE_INTERVAL_INVALID');
    const start = timeMinutes(interval.start);
    const end = timeMinutes(interval.end);
    if (end <= start) throw new Error('SCHEDULE_INTERVAL_INVALID');
    return { start, end, interval: { start: interval.start as LocalTime, end: interval.end as LocalTime } };
  }).sort((left, right) => left.start - right.start || left.end - right.end);

  const result: LocalInterval[] = [];
  for (const current of sorted) {
    const prior = result.at(-1);
    if (!prior) {
      result.push(current.interval);
      continue;
    }
    const priorEnd = timeMinutes(prior.end);
    if (current.start < priorEnd) throw new Error('SCHEDULE_INTERVAL_OVERLAP');
    if (current.start === priorEnd) {
      result[result.length - 1] = { start: prior.start, end: current.interval.end };
      continue;
    }
    result.push(current.interval);
  }
  return freezeIntervals(result);
}

export function canonicalizeWeeklySchedule(schedule: WeeklySchedule): string {
  if (!schedule || typeof schedule !== 'object') throw new Error('WEEKLY_SCHEDULE_INVALID');
  const canonical = Object.fromEntries(WEEKDAYS.map(day => [day, canonicalIntervals(schedule[day] ?? [])]));
  return JSON.stringify(canonical);
}

export function normalizeWeeklySchedule(schedule: WeeklySchedule): WeeklySchedule {
  const canonical = JSON.parse(canonicalizeWeeklySchedule(schedule)) as Record<ScheduleWeekday, LocalInterval[]>;
  return Object.freeze(Object.fromEntries(WEEKDAYS.map(day => [day, freezeIntervals(canonical[day])])) as Record<ScheduleWeekday, readonly LocalInterval[]>);
}

export function hashWeeklySchedule(schedule: WeeklySchedule): string {
  return createHash('sha256').update(canonicalizeWeeklySchedule(schedule), 'utf8').digest('hex');
}

export const DEFAULT_OPENING_HOURS: WeeklySchedule = normalizeWeeklySchedule({
  monday: [],
  tuesday: [{ start: '15:00', end: '21:00' }],
  wednesday: [{ start: '15:00', end: '21:00' }],
  thursday: [{ start: '15:00', end: '21:00' }],
  friday: [{ start: '15:00', end: '21:00' }],
  saturday: [{ start: '11:00', end: '21:00' }],
  sunday: [{ start: '11:00', end: '21:00' }],
});

function matchingException(exceptions: readonly ScheduleException[], kind: ScheduleExceptionKind, localDate: string): ScheduleException | undefined {
  const matches = exceptions.filter(exception => {
    if (!exception || exception.kind !== kind || exception.localDate !== localDate || typeof exception.id !== 'string' || !exception.id) return false;
    canonicalIntervals(exception.intervals);
    return true;
  });
  if (matches.length > 1) throw new Error('SCHEDULE_EXCEPTION_AMBIGUOUS');
  return matches[0];
}

export function resolveScheduleContext(input: {
  readonly localDate: string;
  readonly openingHours: WeeklySchedule;
  readonly employeeWeekly: WeeklySchedule | null;
  readonly exceptions: readonly ScheduleException[];
  readonly publicHolidayLocalDates: readonly string[];
}): EffectiveScheduleContext {
  assertLocalDate(input.localDate);
  if (!Array.isArray(input.exceptions) || !Array.isArray(input.publicHolidayLocalDates)) throw new Error('SCHEDULE_CONTEXT_INVALID');
  const openingHours = normalizeWeeklySchedule(input.openingHours);
  const weekly = input.employeeWeekly ? normalizeWeeklySchedule(input.employeeWeekly) : null;
  const publicHolidayDates = new Set(input.publicHolidayLocalDates.map(date => {
    assertLocalDate(date);
    return date;
  }));
  const dateException = matchingException(input.exceptions, 'date', input.localDate);
  const holidayException = publicHolidayDates.has(input.localDate) ? matchingException(input.exceptions, 'public_holiday', input.localDate) : undefined;
  const weekday = weekdayForLocalDate(input.localDate);
  const employeeIntervals = dateException
    ? canonicalIntervals(dateException.intervals)
    : holidayException
      ? canonicalIntervals(holidayException.intervals)
      : weekly
        ? weekly[weekday]
        : Object.freeze([]);
  const employeeSource: EffectiveScheduleContext['employeeSource'] = dateException
    ? 'date_exception'
    : holidayException
      ? 'holiday_exception'
      : weekly
        ? 'weekly_assignment'
        : 'none';
  return Object.freeze({
    localDate: input.localDate,
    isPublicHoliday: publicHolidayDates.has(input.localDate),
    openingIntervals: openingHours[weekday],
    employeeIntervals,
    employeeSource,
  });
}
