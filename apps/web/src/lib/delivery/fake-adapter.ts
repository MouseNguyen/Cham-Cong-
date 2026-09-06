import { conflict } from "../db/transaction";
import { BODY, SUBJECT, isVerificationBody, type FakeMessage, type SendOutcome, type ReconcileOutcome } from "./types";

export function assertSyntheticMessage(message: FakeMessage): void {
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
    const payload = JSON.stringify([message.jobId, message.to, message.subject, message.body]);
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
