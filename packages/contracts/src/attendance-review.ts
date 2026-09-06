export type AttendanceReviewRole = 'owner' | 'accountant';
export type AttendanceReviewClassification = 'ordinary' | 'holiday_daytime' | 'out_of_schedule' | 'night_work';
export type AttendanceReviewDirection = 'IN' | 'OUT';
export type AttendanceReviewBlockerCode =
  | 'MISSING_SCHEDULE' | 'MISSING_OUT' | 'OUT_WITHOUT_IN' | 'REPEATED_IN'
  | 'NON_MONOTONIC_EVENT_TIME' | 'REVERSED_OR_ZERO_DURATION' | 'OVERLAPPING_INTERVALS' | 'OUT_OF_SCHEDULE'
  | 'PUBLIC_HOLIDAY_WORK' | 'NIGHT_WORK' | 'RAW_EVENT_UNDISPOSED'
  | 'SOURCE_HASH_STALE' | 'CANDIDATE_HASH_STALE' | 'APPROVAL_REQUIRED'
  | 'APPROVAL_STALE' | 'CORRECTION_REQUIRES_REASON' | 'UNSUPPORTED_SCOPE';

export interface AttendanceReviewCredentials { readonly sessionToken: string; readonly csrfToken: string; }
export interface AttendanceReviewRawEvent {
  readonly id: string; readonly direction: AttendanceReviewDirection; readonly occurredAtUtcMs: number;
  readonly insidePeriod: boolean;
}
export interface AttendanceReviewInterval { readonly startUtcMs: number; readonly endUtcMs: number; readonly scheduleRef: string; }
export interface AttendanceReviewSegment {
  readonly id: string; readonly startUtcMs: number; readonly endUtcMs: number;
  readonly classification: AttendanceReviewClassification; readonly sourceEventIds: readonly string[];
  readonly correction?: { readonly reason: string; readonly source: 'maker_proposal' };
  readonly scheduleRefs: readonly string[];
}
export interface AttendanceReviewExclusion {
  readonly eventId: string; readonly reason: string; readonly classification: AttendanceReviewClassification | 'unresolved';
}
export interface AttendanceReviewBlocker { readonly code: AttendanceReviewBlockerCode; readonly eventIds: readonly string[]; readonly message: string; readonly nextAction: string; }
export interface AttendanceReviewProposalState { readonly id: string; readonly version: number; readonly candidateHash: string; readonly sourceHash: string; readonly madeBy: string; readonly madeAtUtcMs: number; readonly reason: string; }
export interface AttendanceReviewDecisionState { readonly id: string; readonly proposalId: string; readonly approvedBy: string; readonly approvedAtUtcMs: number; readonly reason: string; readonly sourceHash: string; readonly candidateHash: string; }
export interface AttendanceReviewSnapshot { readonly id: string; readonly contentHash: string; readonly approvedBy: string; readonly approvedAtUtcMs: number; readonly canonicalPayload: string; }
export interface AttendanceReviewListResult {
  readonly role: AttendanceReviewRole; readonly canDraft: boolean; readonly canApprove: boolean; readonly canFinalize: boolean;
  readonly version: number; readonly sourceHash: string; readonly candidateHash: string | null;
  readonly rawEvents: readonly AttendanceReviewRawEvent[]; readonly scheduledIntervals: readonly AttendanceReviewInterval[];
  readonly suggestedSegments: readonly AttendanceReviewSegment[]; readonly blockers: readonly AttendanceReviewBlocker[];
  readonly proposal: AttendanceReviewProposalState | null; readonly decision: AttendanceReviewDecisionState | null;
  readonly frozenSnapshot: AttendanceReviewSnapshot | null;
  readonly candidate: {readonly segments:readonly AttendanceReviewSegment[];readonly exclusions:readonly AttendanceReviewExclusion[];readonly reason:string}|null;
}
export interface AttendanceReviewDraftInput {
  readonly employeeId: string; readonly workplaceId: string; readonly month: `${number}${number}${number}${number}-${number}${number}`;
  readonly expectedVersion: number; readonly sourceHash: string; readonly segments: readonly AttendanceReviewSegment[];
  readonly exclusions: readonly AttendanceReviewExclusion[]; readonly reason: string;
}
export interface AttendanceReviewApprovalInput { readonly employeeId: string; readonly workplaceId: string; readonly month: `${number}${number}${number}${number}-${number}${number}`; readonly expectedVersion: number; readonly candidateHash: string; readonly reason: string; }
export interface AttendanceReviewDraftResult { readonly proposal: AttendanceReviewProposalState; readonly version: number; readonly candidateHash: string; }
export interface AttendanceReviewApprovalResult { readonly decision: AttendanceReviewDecisionState; readonly version: number; }
export interface AttendanceReviewFinalizeResult { readonly snapshot: AttendanceReviewSnapshot; readonly replayed: boolean; }
