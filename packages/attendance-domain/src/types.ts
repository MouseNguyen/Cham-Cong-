export type ClockDirection = 'IN' | 'OUT';
export type SegmentStatus = 'approved' | 'rejected' | 'unresolved';
export type SegmentClassification = 'ordinary' | 'holiday_daytime' | 'out_of_schedule' | 'night_work';

export interface ClockEvent {
  readonly id: string;
  readonly employeeId: string;
  readonly workplaceId: string;
  readonly idempotencyKey: string;
  readonly direction: ClockDirection;
  readonly occurredAtUtcMs: number;
}

export interface AttendanceState {
  readonly revision: number;
  readonly events: readonly ClockEvent[];
}

export interface ClockCommand {
  readonly expectedRevision: number;
  readonly event: ClockEvent;
}

export type ClockCommandResult =
  | { readonly kind: 'accepted'; readonly event: ClockEvent; readonly state: AttendanceState }
  | { readonly kind: 'replayed'; readonly event: ClockEvent; readonly state: AttendanceState }
  | { readonly kind: 'conflict'; readonly code: 'STALE_REVISION' | 'IDEMPOTENCY_CONFLICT'; readonly state: AttendanceState };

export interface AttendanceInterval {
  readonly startUtcMs: number;
  readonly endUtcMs: number;
}

export type AttendanceExceptionCode =
  | 'NON_MONOTONIC_EVENT_TIME'
  | 'OUT_WITHOUT_IN'
  | 'REPEATED_IN'
  | 'MISSING_OUT'
  | 'REVERSED_OR_ZERO_DURATION'
  | 'OUT_OF_SCHEDULE'
  | 'PUBLIC_HOLIDAY_WORK'
  | 'NIGHT_WORK'
  | 'OVERLAPPING_INTERVALS';

export interface AttendanceException {
  readonly code: AttendanceExceptionCode;
  readonly blocking: true;
  readonly eventId?: string;
  readonly startUtcMs?: number;
  readonly endUtcMs?: number;
}

export interface SyntheticApprovalMetadata {
  readonly approvedBy: string;
  readonly approvedAtUtcMs: number;
}

export interface PayableSegment {
  readonly id: string;
  readonly employeeId: string;
  readonly workplaceId: string;
  readonly startUtcMs: number;
  readonly endUtcMs: number;
  readonly durationMs: bigint;
  readonly status: SegmentStatus;
  readonly approval: SyntheticApprovalMetadata | null;
  readonly exceptions: readonly AttendanceExceptionCode[];
  readonly classification: SegmentClassification;
}

export interface AttendanceSnapshot {
  readonly period: AttendanceInterval;
  readonly employeeId: string;
  readonly workplaceId: string;
  readonly segments: readonly PayableSegment[];
  readonly exceptions: readonly AttendanceException[];
  readonly approval: SyntheticApprovalMetadata;
  readonly totalPayableDurationMs: bigint;
}
