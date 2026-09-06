export type ClockAction = 'CLOCK_IN' | 'CLOCK_OUT';
export type ClockRecordedResponse = { readonly recorded: true; readonly eventId: string; readonly recordedAt: string; readonly nextAllowedAction: ClockAction; readonly replayed: boolean; readonly requestId: string };
export type ClockNotRecordedResponse = { readonly recorded: false; readonly code: 'CLOCK_NOT_RECORDED'; readonly message: string; readonly nextAction: 'RETRY' | 'CHECK_WITH_MANAGER'; readonly requestId: string };
export type ClockPendingResponse = { readonly pending_confirmation: true };
export type ClockResponse = ClockRecordedResponse | ClockNotRecordedResponse | ClockPendingResponse;
export interface ClockRequest { readonly employeeCode: string; readonly pin: string; readonly action: ClockAction; readonly idempotencyKey: string; }
export interface ReconcileRequest { readonly employeeCode: string; readonly idempotencyKey: string; }
