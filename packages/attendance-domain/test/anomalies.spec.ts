import { describe, expect, test } from 'vitest';

import { detectAttendanceExceptions } from '../src/anomalies';
import { classifySegment, selectApprovedPayableSegments } from '../src/payable-segments';
import type { ClockEvent, PayableSegment } from '../src/types';

const zone = 'Asia/Ho_Chi_Minh';
const event = (id: string, direction: 'IN' | 'OUT', occurredAtUtcMs: number): ClockEvent => ({ id, employeeId: 'employee-synthetic-1', workplaceId: 'workplace-synthetic-1', idempotencyKey: id, direction, occurredAtUtcMs });
const utc = (value: string) => Date.parse(value);
const context = { shopTimeZone: zone as 'Asia/Ho_Chi_Minh', scheduledIntervals: [{ startUtcMs: utc('2026-09-05T08:00:00.000Z'), endUtcMs: utc('2026-09-05T14:00:00.000Z') }], publicHolidayLocalDates: ['2026-09-06'] };

describe('attendance exceptions and approved payable segments', () => {
  test('flags missing/repeated/impossible pairs without creating intervals', () => {
    const exceptions = detectAttendanceExceptions({ ...context, events: [event('out-first', 'OUT', utc('2026-09-05T08:00:00.000Z')), event('in-1', 'IN', utc('2026-09-05T09:00:00.000Z')), event('in-2', 'IN', utc('2026-09-05T09:01:00.000Z')), event('out-2', 'OUT', utc('2026-09-05T09:00:00.000Z'))] });
    expect(exceptions.map((item) => item.code)).toEqual(['OUT_WITHOUT_IN', 'REPEATED_IN', 'NON_MONOTONIC_EVENT_TIME', 'REVERSED_OR_ZERO_DURATION', 'MISSING_OUT']);
    expect(exceptions.every((item) => item.blocking)).toBe(true);
  });

  test('flags schedule, holiday and local-night work at documented half-open boundaries', () => {
    const exceptions = detectAttendanceExceptions({ ...context, events: [event('in-day', 'IN', utc('2026-09-05T14:30:00.000Z')), event('out-day', 'OUT', utc('2026-09-05T15:00:00.000Z')), event('in-night', 'IN', utc('2026-09-05T15:00:00.000Z')), event('out-night', 'OUT', utc('2026-09-05T15:30:00.000Z')), event('in-holiday', 'IN', utc('2026-09-06T16:59:00.000Z')), event('out-holiday', 'OUT', utc('2026-09-06T17:00:00.000Z'))] });
    expect(exceptions.map((item) => item.code)).toEqual(['OUT_OF_SCHEDULE', 'OUT_OF_SCHEDULE', 'NIGHT_WORK', 'OUT_OF_SCHEDULE', 'PUBLIC_HOLIDAY_WORK', 'NIGHT_WORK']);
  });

  test('treats a shift ending exactly at 22:00 as daytime and one starting at 06:00 as non-night local work', () => {
    const exceptions = detectAttendanceExceptions({ shopTimeZone: zone, scheduledIntervals: [{ startUtcMs: utc('2026-09-05T14:30:00.000Z'), endUtcMs: utc('2026-09-05T15:00:00.000Z') }, { startUtcMs: utc('2026-09-05T23:00:00.000Z'), endUtcMs: utc('2026-09-05T23:01:00.000Z') }], publicHolidayLocalDates: [], events: [event('end-22-in', 'IN', utc('2026-09-05T14:30:00.000Z')), event('end-22-out', 'OUT', utc('2026-09-05T15:00:00.000Z')), event('start-06-in', 'IN', utc('2026-09-05T23:00:00.000Z')), event('start-06-out', 'OUT', utc('2026-09-05T23:01:00.000Z'))] });
    expect(exceptions).toEqual([]);
  });

  test('keeps exact 59/60/61-second approved durations and paid six- and ten-hour shifts', () => {
    const approved = ([59_000, 60_000, 61_000, 6 * 3_600_000, 10 * 3_600_000] as const).map((durationMs, index) => classifySegment({ id: 'segment-' + index, employeeId: 'employee-synthetic-1', workplaceId: 'workplace-synthetic-1', startUtcMs: utc('2026-09-05T08:00:00.000Z') + index * 50_000_000, endUtcMs: utc('2026-09-05T08:00:00.000Z') + index * 50_000_000 + durationMs, status: 'approved', approval: { approvedBy: 'owner-synthetic-1', approvedAtUtcMs: utc('2026-09-07T00:00:00.000Z') }, exceptions: [] }));
    expect(selectApprovedPayableSegments(approved).map((item) => item.durationMs)).toEqual([59_000n, 60_000n, 61_000n, 21_600_000n, 36_000_000n]);
  });

  test('never admits rejected or unresolved intervals to payable output', () => {
    const segment = (status: PayableSegment['status']) => classifySegment({ id: 'segment-' + status, employeeId: 'employee-synthetic-1', workplaceId: 'workplace-synthetic-1', startUtcMs: utc('2026-09-05T08:00:00.000Z'), endUtcMs: utc('2026-09-05T09:00:00.000Z'), status, approval: status === 'approved' ? { approvedBy: 'owner-synthetic-1', approvedAtUtcMs: utc('2026-09-07T00:00:00.000Z') } : null, exceptions: status === 'unresolved' ? ['OUT_OF_SCHEDULE'] : [] });
    expect(selectApprovedPayableSegments([segment('approved'), segment('rejected'), segment('unresolved')]).map((item) => item.id)).toEqual(['segment-approved']);
  });
});

test('never pairs events belonging to different employees or workplaces', () => {
 const result=detectAttendanceExceptions({...context,events:[event('a','IN',utc('2026-09-05T08:00:00Z')),{...event('b','OUT',utc('2026-09-05T09:00:00Z')),employeeId:'another'}]});
 expect(result.map(x=>x.code)).toContain('OUT_WITHOUT_IN');expect(result.map(x=>x.code)).toContain('MISSING_OUT');
});
test('rejects duplicate raw event IDs, invalid times and unsupported context', () => {
 const x=event('a','IN',utc('2026-09-05T08:00:00Z'));
 expect(()=>detectAttendanceExceptions({...context,events:[x,x]})).toThrow('DUPLICATE_EVENT_ID');
 expect(()=>detectAttendanceExceptions({...context,events:[{...x,occurredAtUtcMs:NaN}]})).toThrow('UTC_MILLISECONDS_UNSAFE');
 expect(()=>detectAttendanceExceptions({...context,shopTimeZone:'UTC' as never,events:[]})).toThrow('SHOP_TIMEZONE_UNSUPPORTED');
});
test('flags overlapping completed intervals and holiday midnight crossing', () => {
 const start=utc('2026-09-05T16:59:59.999Z'),end=start+2;
 const result=detectAttendanceExceptions({...context,scheduledIntervals:[{startUtcMs:start,endUtcMs:end}],events:[event('a','IN',start),event('b','OUT',end)]});
 expect(result.map(x=>x.code)).toEqual(['PUBLIC_HOLIDAY_WORK','NIGHT_WORK']);
 const boundary=detectAttendanceExceptions({...context,scheduledIntervals:[{startUtcMs:start,endUtcMs:end}],events:[event('a','IN',start),event('b','OUT',end-1)]});
 expect(boundary.map(x=>x.code)).toEqual(['NIGHT_WORK']);
 const overlap=detectAttendanceExceptions({...context,events:[event('a','IN',1000),event('b','OUT',4000),event('c','IN',2000),event('d','OUT',5000)]});
 expect(overlap.some(x=>x.code==='OVERLAPPING_INTERVALS')).toBe(true);
});
test('approved flags do not bypass unresolved segment exceptions', () => {
 const input={id:'s',employeeId:'e',workplaceId:'w',startUtcMs:1000,endUtcMs:2000,status:'approved' as const,approval:{approvedBy:'owner',approvedAtUtcMs:3000},exceptions:['MISSING_OUT' as const]};
 expect(()=>selectApprovedPayableSegments([classifySegment(input)])).toThrow('UNRESOLVED_SEGMENT_EXCEPTION');
});

test('flags backwards raw event order even when completed intervals do not overlap', () => {
 const events=[event('later-in','IN',utc('2026-09-05T09:00:00Z')),event('later-out','OUT',utc('2026-09-05T10:00:00Z')),event('earlier-in','IN',utc('2026-09-05T08:00:00Z')),event('earlier-out','OUT',utc('2026-09-05T09:00:00Z'))];
 const result=detectAttendanceExceptions({...context,events});
 expect(result.some(x=>x.code==='NON_MONOTONIC_EVENT_TIME')).toBe(true);
});
