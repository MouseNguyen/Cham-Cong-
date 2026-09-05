export type SendOutcome = { kind: "accepted"; reference: string } | { kind: "definitely_failed" } | { kind: "unknown" };
export type ReconcileOutcome = { kind: "accepted"; reference: string } | { kind: "not_found" } | { kind: "unknown" };
export type Outcome = SendOutcome | ReconcileOutcome;
export const SUBJECT = "Synthetic email verification";
export const BODY = "Synthetic verification test only. No payroll or verification secret is included.";
export interface FakeMessage { jobId: string; idempotencyKey: string; to: string; subject: string; body: string }
export interface Lease { jobId: string; organizationId: string; token: string; generation: number; phase: "send" | "reconcile"; message: FakeMessage }
export interface FakeAdapter { send(message: FakeMessage): Promise<SendOutcome>; reconcile(message: FakeMessage): Promise<ReconcileOutcome> }
