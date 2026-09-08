import { conflict } from "../db/transaction";
import { BODY, SUBJECT, PAYSLIP_SUBJECT, PAYSLIP_BODY, isVerificationBody, type FakeMessage, type SendOutcome, type ReconcileOutcome } from "./types";

export function assertSyntheticMessage(message: FakeMessage): void {
  if(message.attachment){
    const a=message.attachment;
    if(Object.keys(message).sort().join(',')!=='attachment,body,idempotencyKey,jobId,subject,to'||message.subject!==PAYSLIP_SUBJECT||message.body!==PAYSLIP_BODY||!/^[A-Za-z0-9._+-]+@example\.invalid$/.test(message.to)||message.to!==a.to||!/^[a-f0-9]{64}$/.test(a.sha256)||!Number.isSafeInteger(a.bytes)||a.bytes<1||a.bytes>20*1024*1024||!/^[a-f0-9-]{36}$/.test(a.artifactId)||a.relativePath!==a.artifactId+'.pdf')throw conflict('SYNTHETIC_ONLY');
    return;
  }
  if (!/^[A-Za-z0-9._+-]+@example\.invalid$/.test(message.to) ||
      message.subject !== SUBJECT || (message.body !== BODY && !isVerificationBody(message.body)) ||
      Object.keys(message).sort().join(",") !== "body,idempotencyKey,jobId,subject,to") throw conflict("SYNTHETIC_ONLY");
}
/** In-memory fake provider ledger. Never makes an external call or claims delivery.
 * Lost ledger state is UNKNOWN, never authoritative absence. */
export function createFakeAdapter(options: {
  sendOutcomes?: Array<SendOutcome["kind"]>;
  reconcileOutcomes?: Array<ReconcileOutcome["kind"]>;
} = {}) {
  const ledger = new Map<string, { payload: string; result: SendOutcome }>();
  let sends = 0, reconciles = 0;
  function inspect(message: FakeMessage) {
    assertSyntheticMessage(message);
    const payload = JSON.stringify([message.jobId, message.to, message.subject, message.body, message.attachment ?? null]);
    const prior = ledger.get(message.idempotencyKey);
    if (prior && prior.payload !== payload) throw conflict("IDEMPOTENCY_CONFLICT");
    return { payload, prior };
  }
  return {
    get sendCount() { return sends; },
    get reconcileCount() { return reconciles; },
    async send(message: FakeMessage): Promise<SendOutcome> {
      const { payload, prior } = inspect(message);
      const index = sends++;
      if (prior?.result.kind === "accepted") return prior.result;
      const kind = options.sendOutcomes?.[index] ?? "accepted";
      const result: SendOutcome = kind === "accepted" ? { kind, reference: "fake-" + message.jobId } : { kind };
      ledger.set(message.idempotencyKey, { payload, result });
      return result;
    },
    async reconcile(message: FakeMessage): Promise<ReconcileOutcome> {
      const { payload, prior } = inspect(message);
      const index = reconciles++;
      if (prior?.result.kind === "accepted") return prior.result;
      const configured = options.reconcileOutcomes?.[index];
      if (configured === "accepted") {
        const result = { kind: "accepted" as const, reference: "fake-" + message.jobId };
        ledger.set(message.idempotencyKey, { payload, result });
        return result;
      }
      if (configured) return { kind: configured };
      return { kind: prior?.result.kind === "definitely_failed" ? "not_found" : "unknown" };
    }
  };
}
