import type { ClockAction } from '../../contracts/src/attendance.ts';

export type ClockFailureMode = 'none' | 'before_commit' | 'after_commit';
export interface EnrolledDevice { readonly deviceId: string; readonly organizationId: string; readonly workplaceId: string; readonly sessionId: string; }
export interface AuthenticatedEmployee { readonly employeeId: string; readonly organizationId: string; readonly workplaceId: string; }
export type StoredClockDirection = 'IN' | 'OUT';
export interface RecordedIngressEvent { readonly id: string; readonly direction: StoredClockDirection; readonly occurredAtUtcMs: number; }
export type RecordClockResult =
  | { readonly kind: 'recorded'; readonly event: RecordedIngressEvent; readonly replayed: boolean }
  | { readonly kind: 'conflict' | 'invalid_state' | 'not_recorded' | 'pending_confirmation' };
export type ReconcileClockResult = { readonly kind: 'recorded'; readonly event: RecordedIngressEvent } | { readonly kind: 'pending_confirmation' };
export interface AttendanceIngressRepository {
  readiness(): Promise<boolean>;
  authenticateDevice(token: string): Promise<EnrolledDevice | null>;
  authenticateEmployee(input: { readonly deviceId: string; readonly employeeCode: string; readonly pin: string }): Promise<AuthenticatedEmployee | null>;
  recordClock(input: { readonly idempotencyKey: string; readonly action: ClockAction; readonly occurredAtUtcMs: number; readonly requestId?: string; readonly employeeId: string; readonly deviceId: string; readonly sessionId: string }): Promise<RecordClockResult>;
  reconcile(input: { readonly idempotencyKey: string; readonly deviceId: string; readonly sessionId: string; readonly employeeCode: string }): Promise<ReconcileClockResult>;
}
