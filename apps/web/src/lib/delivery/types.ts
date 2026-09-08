import type {ReleaseBinding} from '../application/commands/preview-payslip-release';
export type SendOutcome = { kind: "accepted"; reference: string } | { kind: "definitely_failed" } | { kind: "unknown" };
export type ReconcileOutcome = { kind: "accepted"; reference: string } | { kind: "not_found" } | { kind: "unknown" };
export type Outcome = SendOutcome | ReconcileOutcome;
export const SUBJECT = "Synthetic email verification";
export const BODY = "Synthetic verification test only. No payroll or verification secret is included.";
export interface FakeMessage { jobId: string; idempotencyKey: string; to: string; subject: string; body: string; attachment?:ReleaseBinding }
export interface Lease { jobId: string; organizationId: string; token: string; generation: number; phase: "send" | "reconcile"; message: FakeMessage }
export interface FakeAdapter { send(message: FakeMessage): Promise<SendOutcome>; reconcile(message: FakeMessage): Promise<ReconcileOutcome> }

export function isVerificationBody(body:string):boolean{return /^Mã xác minh email: [0-9]{6}\. Hết hạn sau 10 phút\.$/.test(body);}
export function verificationBody(code:string):string{if(!/^[0-9]{6}$/.test(code))throw Error("INVALID_VERIFICATION_CODE");return "Mã xác minh email: "+code+". Hết hạn sau 10 phút.";}

export const PAYSLIP_SUBJECT='Synthetic payslip';
export const PAYSLIP_BODY='Your synthetic document is attached. Its password is provided separately.';
