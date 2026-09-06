import { expect, test } from 'vitest';
import {
  DEFAULT_OPENING_HOURS,
  canonicalizeWeeklySchedule,
  hashWeeklySchedule,
  resolveScheduleContext,
  type ScheduleException,
  type WeeklySchedule,
} from '../src/schedule';

const employeeWeekly: WeeklySchedule = {
  monday: [],
  tuesday: [{ start: '15:00', end: '21:00' }],
  wednesday: [{ start: '15:00', end: '21:00' }],
  thursday: [{ start: '15:00', end: '21:00' }],
  friday: [{ start: '15:00', end: '21:00' }],
  saturday: [{ start: '11:00', end: '21:00' }],
  sunday: [{ start: '11:00', end: '21:00' }],
};

test('approved default opening pattern is explicit and Monday is closed', () => {
  expect(DEFAULT_OPENING_HOURS.monday).toEqual([]);
  expect(DEFAULT_OPENING_HOURS.tuesday).toEqual([{ start: '15:00', end: '21:00' }]);
  expect(DEFAULT_OPENING_HOURS.saturday).toEqual([{ start: '11:00', end: '21:00' }]);
  expect(DEFAULT_OPENING_HOURS.sunday).toEqual([{ start: '11:00', end: '21:00' }]);
});

test('canonical weekly schedules are order-independent and reject invalid or overlapping half-open intervals', () => {
  const reordered: WeeklySchedule = {
    ...employeeWeekly,
    tuesday: [{ start: '18:00', end: '21:00' }, { start: '15:00', end: '18:00' }],
  };
  const contiguous: WeeklySchedule = {
    ...employeeWeekly,
    tuesday: [{ start: '15:00', end: '18:00' }, { start: '18:00', end: '21:00' }],
  };

  expect(canonicalizeWeeklySchedule(reordered)).toBe(canonicalizeWeeklySchedule(contiguous));
  expect(hashWeeklySchedule(reordered)).toBe(hashWeeklySchedule(contiguous));
  expect(() => canonicalizeWeeklySchedule({ ...employeeWeekly, tuesday: [{ start: '21:00', end: '21:00' }] })).toThrow('SCHEDULE_INTERVAL_INVALID');
  expect(() => canonicalizeWeeklySchedule({ ...employeeWeekly, tuesday: [{ start: '15:00', end: '19:00' }, { start: '18:00', end: '21:00' }] })).toThrow('SCHEDULE_INTERVAL_OVERLAP');
});

test('dated exception takes precedence over holiday exception and weekly assignment', () => {
  const exceptions: ScheduleException[] = [
    { id: 'holiday', kind: 'public_holiday', localDate: '2026-09-02', intervals: [] },
    { id: 'date', kind: 'date', localDate: '2026-09-02', intervals: [{ start: '12:00', end: '16:00' }] },
  ];

  const context = resolveScheduleContext({
    localDate: '2026-09-02',
    openingHours: DEFAULT_OPENING_HOURS,
    employeeWeekly,
    exceptions,
    publicHolidayLocalDates: ['2026-09-02'],
  });

  expect(context.employeeIntervals).toEqual([{ start: '12:00', end: '16:00' }]);
  expect(context.employeeSource).toBe('date_exception');
  expect(context.openingIntervals).toEqual([{ start: '15:00', end: '21:00' }]);
  expect(context.isPublicHoliday).toBe(true);
});

test('holiday exception applies only to a declared public holiday and weekly schedule remains context, not work or pay', () => {
  const context = resolveScheduleContext({
    localDate: '2026-09-03',
    openingHours: DEFAULT_OPENING_HOURS,
    employeeWeekly,
    exceptions: [{ id: 'holiday', kind: 'public_holiday', localDate: '2026-09-03', intervals: [] }],
    publicHolidayLocalDates: [],
  });

  expect(context.employeeIntervals).toEqual([{ start: '15:00', end: '21:00' }]);
  expect(context.employeeSource).toBe('weekly_assignment');
  expect(context).not.toHaveProperty('workedDurationMs');
  expect(context).not.toHaveProperty('payableDurationMs');
  expect(context).not.toHaveProperty('approval');
});

test('effective date and exception inputs use unambiguous shop-local calendar dates', () => {
  expect(() => resolveScheduleContext({
    localDate: '2026-02-30',
    openingHours: DEFAULT_OPENING_HOURS,
    employeeWeekly,
    exceptions: [],
    publicHolidayLocalDates: [],
  })).toThrow('SCHEDULE_LOCAL_DATE_INVALID');
  expect(() => resolveScheduleContext({
    localDate: '2026-09-02T00:00:00Z',
    openingHours: DEFAULT_OPENING_HOURS,
    employeeWeekly,
    exceptions: [],
    publicHolidayLocalDates: [],
  })).toThrow('SCHEDULE_LOCAL_DATE_INVALID');
});
