import { describe, expect, test } from 'vitest';

import { acceptClockCommand } from '../src/state-machine';
import type { AttendanceState, ClockCommand } from '../src/types';

const baseState: AttendanceState = { revision: 0, events: [] };
const command = (overrides: Partial<ClockCommand> = {}): ClockCommand => ({
  expectedRevision: 0,
  event: {
    id: 'candidate-event-1',
    employeeId: 'employee-synthetic-1',
    workplaceId: 'workplace-synthetic-1',
    idempotencyKey: 'key-1',
    direction: 'IN',
    occurredAtUtcMs: 1_788_307_200_123,
  },
  ...overrides,
});

describe('acceptClockCommand', () => {
  test('retains a raw UTC millisecond IN and subsequent OUT without mutating history', () => {
    const inResult = acceptClockCommand(baseState, command());
    expect(inResult.kind).toBe('accepted');
    if (inResult.kind !== 'accepted') throw new Error('expected acceptance');
    expect(inResult.state.events[0]?.occurredAtUtcMs).toBe(1_788_307_200_123);
    expect(baseState.events).toEqual([]);

    const outResult = acceptClockCommand(inResult.state, command({
      expectedRevision: 1,
      event: { ...command().event, id: 'candidate-event-2', idempotencyKey: 'key-2', direction: 'OUT', occurredAtUtcMs: 1_788_328_800_456 },
    }));
    expect(outResult.kind).toBe('accepted');
    if (outResult.kind !== 'accepted') throw new Error('expected acceptance');
    expect(outResult.state.events.map((event) => event.occurredAtUtcMs)).toEqual([1_788_307_200_123, 1_788_328_800_456]);
  });

  test('replays an identical idempotency payload before revision checks and preserves the original accepted identity', () => {
    const accepted = acceptClockCommand(baseState, command());
    if (accepted.kind !== 'accepted') throw new Error('expected acceptance');

    const replay = acceptClockCommand(accepted.state, command({
      expectedRevision: 0,
      event: { ...command().event, id: 'new-request-metadata-id' },
    }));
    expect(replay).toMatchObject({ kind: 'replayed', event: { id: 'candidate-event-1' } });
    expect(replay.state).toBe(accepted.state);
  });

  test('rejects conflicting reuse of an idempotency key and stale competing revisions', () => {
    const accepted = acceptClockCommand(baseState, command());
    if (accepted.kind !== 'accepted') throw new Error('expected acceptance');

    expect(acceptClockCommand(accepted.state, command({
      expectedRevision: 1,
      event: { ...command().event, occurredAtUtcMs: command().event.occurredAtUtcMs + 1 },
    }))).toMatchObject({ kind: 'conflict', code: 'IDEMPOTENCY_CONFLICT' });
    expect(acceptClockCommand(accepted.state, command({
      expectedRevision: 0,
      event: { ...command().event, id: 'candidate-event-3', idempotencyKey: 'key-3' },
    }))).toMatchObject({ kind: 'conflict', code: 'STALE_REVISION' });
  });

  test('rejects unsafe timestamps and duplicate event IDs without fabricating a work interval', () => {
    expect(() => acceptClockCommand(baseState, command({ event: { ...command().event, occurredAtUtcMs: Number.MAX_SAFE_INTEGER + 1 } }))).toThrow('UTC_MILLISECONDS_UNSAFE');
    const accepted = acceptClockCommand(baseState, command());
    if (accepted.kind !== 'accepted') throw new Error('expected acceptance');
    expect(() => acceptClockCommand(accepted.state, command({
      expectedRevision: 1,
      event: { ...command().event, idempotencyKey: 'key-unique' },
    }))).toThrow('DUPLICATE_EVENT_ID');
  });
});

test('rejects invalid revisions, directions, empty identity and dates outside Date range', () => {
 expect(()=>acceptClockCommand({revision:NaN,events:[]},command({expectedRevision:NaN}))).toThrow('REVISION_INVALID');
 expect(()=>acceptClockCommand(baseState,command({event:{...command().event,direction:'BAD' as never}}))).toThrow('CLOCK_DIRECTION_INVALID');
 expect(()=>acceptClockCommand(baseState,command({event:{...command().event,employeeId:''}}))).toThrow('CLOCK_IDENTITY_INVALID');
 expect(()=>acceptClockCommand(baseState,command({event:{...command().event,occurredAtUtcMs:8640000000000001}}))).toThrow('UTC_MILLISECONDS_UNSAFE');
});
