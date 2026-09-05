import type { AttendanceState, ClockCommand, ClockCommandResult, ClockEvent } from './types';

export function assertSafeUtcMilliseconds(value: number): void {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 8_640_000_000_000_000) throw new Error('UTC_MILLISECONDS_UNSAFE');
}
export function assertClockEvent(event: ClockEvent): void {
  assertSafeUtcMilliseconds(event.occurredAtUtcMs);
  if (event.direction !== 'IN' && event.direction !== 'OUT') throw new Error('CLOCK_DIRECTION_INVALID');
  for (const value of [event.id,event.employeeId,event.workplaceId,event.idempotencyKey]) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('CLOCK_IDENTITY_INVALID');
  }
}
function sameReplayPayload(a: ClockEvent, b: ClockEvent): boolean {
  return a.employeeId===b.employeeId && a.workplaceId===b.workplaceId && a.idempotencyKey===b.idempotencyKey && a.direction===b.direction && a.occurredAtUtcMs===b.occurredAtUtcMs;
}
export function acceptClockCommand(state: AttendanceState, command: ClockCommand): ClockCommandResult {
  for (const revision of [state.revision,command.expectedRevision]) {
    if (!Number.isSafeInteger(revision) || revision<0 || revision===Number.MAX_SAFE_INTEGER) throw new Error('REVISION_INVALID');
  }
  assertClockEvent(command.event);
  const ids=new Set<string>();
  for (const existing of state.events) {
    assertClockEvent(existing);
    if(ids.has(existing.id)) throw new Error('DUPLICATE_EVENT_ID');
    ids.add(existing.id);
  }
  const matchingKey=state.events.find(e=>e.employeeId===command.event.employeeId && e.workplaceId===command.event.workplaceId && e.idempotencyKey===command.event.idempotencyKey);
  if(matchingKey) {
    if(sameReplayPayload(matchingKey,command.event)) return Object.freeze({kind:'replayed',event:matchingKey,state});
    return Object.freeze({kind:'conflict',code:'IDEMPOTENCY_CONFLICT',state});
  }
  if(command.expectedRevision!==state.revision) return Object.freeze({kind:'conflict',code:'STALE_REVISION',state});
  if(ids.has(command.event.id)) throw new Error('DUPLICATE_EVENT_ID');
  const event=Object.freeze({...command.event});
  const nextState=Object.freeze({revision:state.revision+1,events:Object.freeze([...state.events.map(e=>Object.freeze({...e})),event])});
  return Object.freeze({kind:'accepted',event,state:nextState});
}
