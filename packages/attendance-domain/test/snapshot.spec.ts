import { describe, expect, test } from 'vitest';

import { classifySegment } from '../src/payable-segments';
import { buildAttendanceSnapshot, hashAttendanceSnapshot } from '../src/snapshot';

const utc = (value: string) => Date.parse(value);
const approval = { approvedBy: 'owner-synthetic-1', approvedAtUtcMs: utc('2026-09-07T00:00:00.000Z') };
const segment = (id: string, startUtcMs: number, endUtcMs: number, overrides = {}) => classifySegment({
  id, employeeId: 'employee-synthetic-1', workplaceId: 'workplace-synthetic-1', startUtcMs, endUtcMs,
  status: 'approved', approval, exceptions: [], ...overrides,
});
const input = (segments: readonly ReturnType<typeof segment>[]) => ({
  period: { startUtcMs: utc('2026-09-01T00:00:00.000Z'), endUtcMs: utc('2026-10-01T00:00:00.000Z') },
  employeeId: 'employee-synthetic-1', workplaceId: 'workplace-synthetic-1', segments,
  exceptions: [], approval,
});

describe('attendance snapshots', () => {
  test('is immutable and hashes semantic unordered input in a canonical order', () => {
    const first = buildAttendanceSnapshot(input([
      segment('later', utc('2026-09-05T10:00:00.000Z'), utc('2026-09-05T11:00:00.061Z')),
      segment('earlier', utc('2026-09-05T08:00:00.000Z'), utc('2026-09-05T09:00:00.059Z')),
    ]));
    const second = buildAttendanceSnapshot(input([...first.segments].reverse()));
    expect(first.totalPayableDurationMs).toBe(7_200_120n);
    expect(hashAttendanceSnapshot(first)).toBe(hashAttendanceSnapshot(second));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.segments)).toBe(true);
    expect(() => { (first as { employeeId: string }).employeeId = 'mutated'; }).toThrow();
  });

  test('rejects unresolved exceptions and invalid approved intervals before snapshotting', () => {
    expect(() => buildAttendanceSnapshot({ ...input([segment('ok', utc('2026-09-05T08:00:00.000Z'), utc('2026-09-05T09:00:00.000Z'))]), exceptions: [{ code: 'MISSING_OUT', blocking: true }] })).toThrow('UNRESOLVED_BLOCKING_EXCEPTION');
    expect(() => buildAttendanceSnapshot(input([segment('wrong-employee', utc('2026-09-05T08:00:00.000Z'), utc('2026-09-05T09:00:00.000Z'), { employeeId: 'employee-synthetic-2' })]))).toThrow('SEGMENT_EMPLOYEE_MISMATCH');
    expect(() => buildAttendanceSnapshot(input([
      segment('one', utc('2026-09-05T08:00:00.000Z'), utc('2026-09-05T09:00:00.000Z')),
      segment('overlap', utc('2026-09-05T08:30:00.000Z'), utc('2026-09-05T09:30:00.000Z')),
    ]))).toThrow('OVERLAPPING_SEGMENTS');
  });

  test('changes hash for an approved millisecond, classification, or approver', () => {
    const base = buildAttendanceSnapshot(input([segment('base', utc('2026-09-05T08:00:00.000Z'), utc('2026-09-05T09:00:00.000Z'))]));
    const changedMillisecond = buildAttendanceSnapshot(input([segment('base', utc('2026-09-05T08:00:00.000Z'), utc('2026-09-05T09:00:00.001Z'))]));
    const changedClassification = buildAttendanceSnapshot(input([segment('base', utc('2026-09-05T08:00:00.000Z'), utc('2026-09-05T09:00:00.000Z'), { classification: 'holiday_daytime' })]));
    const changedApprover = buildAttendanceSnapshot({ ...input([segment('base', utc('2026-09-05T08:00:00.000Z'), utc('2026-09-05T09:00:00.000Z'))]), approval: { ...approval, approvedBy: 'owner-synthetic-2' } });
    expect(new Set([hashAttendanceSnapshot(base), hashAttendanceSnapshot(changedMillisecond), hashAttendanceSnapshot(changedClassification), hashAttendanceSnapshot(changedApprover)]).size).toBe(4);
  });
});

test('snapshot rejects forged duration, zero interval, duplicate IDs and segment exceptions', () => {
 const valid=segment('s',utc('2026-09-05T08:00:00Z'),utc('2026-09-05T09:00:00Z'));
 expect(()=>buildAttendanceSnapshot(input([{...valid,durationMs:1n}]))).toThrow('SEGMENT_DURATION_MISMATCH');
 expect(()=>buildAttendanceSnapshot(input([{...valid,endUtcMs:valid.startUtcMs,durationMs:0n}]))).toThrow('SEGMENT_DURATION_NON_POSITIVE');
 expect(()=>buildAttendanceSnapshot(input([{...valid,exceptions:['MISSING_OUT']}]))).toThrow('UNRESOLVED_SEGMENT_EXCEPTION');
 expect(()=>buildAttendanceSnapshot(input([valid,{...valid,startUtcMs:valid.endUtcMs,endUtcMs:valid.endUtcMs+3600000}]))).toThrow('DUPLICATE_SEGMENT_ID');
});
test('snapshot rejects missing approval identity, unapproved, outside-period and wrong-workplace segments', () => {
 const valid=segment('s',utc('2026-09-05T08:00:00Z'),utc('2026-09-05T09:00:00Z'));
 expect(()=>buildAttendanceSnapshot({...input([valid]),approval:{...approval,approvedBy:''}})).toThrow('APPROVAL_INVALID');
 expect(()=>buildAttendanceSnapshot(input([{...valid,status:'unresolved'}]))).toThrow('UNAPPROVED_SEGMENT');
 expect(()=>buildAttendanceSnapshot(input([{...valid,workplaceId:'other'}]))).toThrow('SEGMENT_WORKPLACE_MISMATCH');
 expect(()=>buildAttendanceSnapshot({...input([valid]),period:{startUtcMs:valid.endUtcMs,endUtcMs:valid.endUtcMs+1000}})).toThrow('SEGMENT_OUT_OF_PERIOD');
});
test('snapshot detaches mutable caller segments and approval metadata', () => {
 const mutable={...segment('s',utc('2026-09-05T08:00:00Z'),utc('2026-09-05T09:00:00Z')),approval:{...approval},exceptions:[]};
 const result=buildAttendanceSnapshot(input([mutable]));
 expect(Object.isFrozen(mutable)).toBe(false);
 mutable.approval.approvedBy='changed';
 expect(result.segments[0]?.approval?.approvedBy).toBe('owner-synthetic-1');
});
