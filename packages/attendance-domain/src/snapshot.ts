import { createHash } from 'node:crypto';
import { assertSafeUtcMilliseconds } from './state-machine';
import { assertApproval, validatePayableSegment } from './payable-segments';
import type { AttendanceException, AttendanceInterval, AttendanceSnapshot, PayableSegment, SyntheticApprovalMetadata } from './types';

export interface AttendanceSnapshotInput {
  readonly period:AttendanceInterval; readonly employeeId:string; readonly workplaceId:string;
  readonly segments:readonly PayableSegment[]; readonly exceptions:readonly AttendanceException[];
  readonly approval:SyntheticApprovalMetadata;
}
function canonicalJson(value:unknown):string {
  if(typeof value==='bigint') return JSON.stringify(value.toString());
  if(Array.isArray(value)) return '['+value.map(canonicalJson).join(',')+']';
  if(value && typeof value==='object') {
    const row=value as Record<string,unknown>;
    return '{'+Object.keys(row).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(row[k])).join(',')+'}';
  }
  return JSON.stringify(value);
}
export function buildAttendanceSnapshot(input:AttendanceSnapshotInput):AttendanceSnapshot {
  assertSafeUtcMilliseconds(input.period.startUtcMs);assertSafeUtcMilliseconds(input.period.endUtcMs);
  if(input.period.endUtcMs<=input.period.startUtcMs) throw new Error('INVALID_SNAPSHOT_PERIOD');
  assertApproval(input.approval);
  for(const id of [input.employeeId,input.workplaceId]) if(typeof id!=='string'||!id.trim()) throw new Error('SNAPSHOT_IDENTITY_INVALID');
  if(!Array.isArray(input.exceptions)||input.exceptions.length) throw new Error('UNRESOLVED_BLOCKING_EXCEPTION');
  const ids=new Set<string>();
  const segments=input.segments.map(segment=>{
    if(ids.has(segment.id)) throw new Error('DUPLICATE_SEGMENT_ID');ids.add(segment.id);
    if(segment.status!=='approved'||!segment.approval) throw new Error('UNAPPROVED_SEGMENT');
    return validatePayableSegment(segment);
  }).sort((a,b)=>a.startUtcMs-b.startUtcMs || a.endUtcMs-b.endUtcMs || (a.id<b.id?-1:a.id>b.id?1:0));
  let totalPayableDurationMs=0n;let prior:PayableSegment|undefined;
  for(const segment of segments) {
    if(segment.employeeId!==input.employeeId) throw new Error('SEGMENT_EMPLOYEE_MISMATCH');
    if(segment.workplaceId!==input.workplaceId) throw new Error('SEGMENT_WORKPLACE_MISMATCH');
    if(segment.startUtcMs<input.period.startUtcMs||segment.endUtcMs>input.period.endUtcMs) throw new Error('SEGMENT_OUT_OF_PERIOD');
    if(prior&&segment.startUtcMs<prior.endUtcMs) throw new Error('OVERLAPPING_SEGMENTS');
    totalPayableDurationMs+=segment.durationMs;prior=segment;
  }
  return Object.freeze({period:Object.freeze({...input.period}),employeeId:input.employeeId,workplaceId:input.workplaceId,
    segments:Object.freeze(segments),exceptions:Object.freeze([]),approval:Object.freeze({...input.approval}),totalPayableDurationMs});
}
export function hashAttendanceSnapshot(snapshot:AttendanceSnapshot):string {
  const validated=buildAttendanceSnapshot(snapshot);
  if(snapshot.totalPayableDurationMs!==validated.totalPayableDurationMs) throw new Error('SNAPSHOT_TOTAL_MISMATCH');
  return createHash('sha256').update(canonicalJson(validated),'utf8').digest('hex');
}
