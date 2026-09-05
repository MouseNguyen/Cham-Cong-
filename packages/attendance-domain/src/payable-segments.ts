import { assertSafeUtcMilliseconds } from './state-machine';
import type { AttendanceExceptionCode, PayableSegment, SegmentClassification, SegmentStatus, SyntheticApprovalMetadata } from './types';

export interface ClassifySegmentInput {
  readonly id:string; readonly employeeId:string; readonly workplaceId:string;
  readonly startUtcMs:number; readonly endUtcMs:number; readonly status:SegmentStatus;
  readonly approval:SyntheticApprovalMetadata|null; readonly exceptions:readonly AttendanceExceptionCode[];
  readonly classification?:SegmentClassification;
}
export function assertApproval(approval:SyntheticApprovalMetadata|null): asserts approval is SyntheticApprovalMetadata {
  if(!approval || typeof approval.approvedBy!=='string' || !approval.approvedBy.trim()) throw new Error('APPROVAL_INVALID');
  assertSafeUtcMilliseconds(approval.approvedAtUtcMs);
}
export function classifySegment(input:ClassifySegmentInput):PayableSegment {
  assertSafeUtcMilliseconds(input.startUtcMs);assertSafeUtcMilliseconds(input.endUtcMs);
  if(input.endUtcMs<=input.startUtcMs) throw new Error('SEGMENT_DURATION_NON_POSITIVE');
  for(const id of [input.id,input.employeeId,input.workplaceId]) if(typeof id!=='string'||!id.trim()) throw new Error('SEGMENT_IDENTITY_INVALID');
  if(!['approved','rejected','unresolved'].includes(input.status)) throw new Error('SEGMENT_STATUS_INVALID');
  const classification=input.classification??'ordinary';
  if(!['ordinary','holiday_daytime','out_of_schedule','night_work'].includes(classification)) throw new Error('SEGMENT_CLASSIFICATION_INVALID');
  if(!Array.isArray(input.exceptions)) throw new Error('SEGMENT_EXCEPTIONS_REQUIRED');
  if(input.status==='approved') {
    if(!input.approval) throw new Error('APPROVED_SEGMENT_REQUIRES_APPROVAL');
    assertApproval(input.approval);
    if(input.exceptions.length) throw new Error('UNRESOLVED_SEGMENT_EXCEPTION');
  }
  return Object.freeze({id:input.id,employeeId:input.employeeId,workplaceId:input.workplaceId,
    startUtcMs:input.startUtcMs,endUtcMs:input.endUtcMs,durationMs:BigInt(input.endUtcMs)-BigInt(input.startUtcMs),
    status:input.status,approval:input.approval?Object.freeze({...input.approval}):null,
    exceptions:Object.freeze([...input.exceptions]),classification});
}
export function validatePayableSegment(segment:PayableSegment):PayableSegment {
  const validated=classifySegment(segment);
  if(segment.durationMs!==validated.durationMs) throw new Error('SEGMENT_DURATION_MISMATCH');
  return validated;
}
export function selectApprovedPayableSegments(segments:readonly PayableSegment[]):readonly PayableSegment[] {
  return Object.freeze(segments.filter(s=>s.status==='approved').map(validatePayableSegment));
}
