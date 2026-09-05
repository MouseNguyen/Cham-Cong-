# W6-02a fake-outbox contract

Scope: transactional generic notification queue for the already accepted W2-01 foundation. Current-user DPAPI acceptance does not close the two W7 Windows identity gates; this independent fake-queue task does not use secrets.

## Schema decision

Preserve immutable outbox_jobs intent and all original migration bytes. Add an explicit kind (legacy synthetic_payslip_draft or synthetic_email_verification). Legacy rows retain their finalized pay-run requirement. Only synthetic_email_verification can omit pay_run_id; it requires matching organization/employee/destination ID and hash. Composite references and the referenced-destination guard preserve historical replay.

Add outbox_dispatches for mutable claim/state data and outbox_dispatch_attempts for append-only claim/result events. Thus38 models after the forward migration; the old36-model receipt stays historical for its commit. Worker state never mutates canonical intent or finalized payroll.

Verification messages contain one synthetic recipient under example.invalid, a fixed neutral subject/body, no CC/BCC, salary, real code or attachment. The fake-only constructor/API must reject real-domain recipients. W6-02b owns verified-recipient release, attachment/PDF hash binding and actual send approval; do not claim those later gates from this generic verification queue.

## API and invariants

- enqueueSyntheticVerification(tx,{organizationId,employeeId,destinationId,idempotencyKey,now}) returns {jobId}. Resolve the address/hash from the locked destination row; reject cross-identity, non-synthetic recipient or altered replay. Queue state and intent are inserted in the same transaction.
- claimNext(tx,{organizationId,workerId,now,leaseMs}) returns a lease or null. Use FOR UPDATE SKIP LOCKED and persist a fresh unguessable lease token/generation. Scope every read/write by organization. Expired send leases must route to reconcile, not directly to send.
- finishAttempt(tx,lease,outcome,now) rejects stale tokens, even if a newer worker holds the same job. State change and append-only result event commit or roll back together.
- runOne({pool,adapter,organizationId,workerId,clock,leaseMs}) executes at most one claim and one fake send/reconcile action; no forever loop. Adapter identity is fake-only. Provider callbacks occur outside DB transactions.
- createFakeAdapter supplies deterministic accepted/definitely_failed/unknown outcomes and a stable-idempotency-key lookup independent of worker state. Same key with changed envelope conflicts. It never performs I/O or labels acceptance delivered.

Explicit statuses: pending, leased, retry_wait, reconcile, accepted, dead_letter. Three definite failed sends exhaust retries with bounded exponential delays. Unknown send/expired lease always reconciles first; only authoritative not_found permits another bounded send. Repeated unknown reconciliation stops visibly after three checks. Never use elapsed time alone as proof that sending did not happen.

Tests use injected dates and actual independent PostgreSQL clients, with no timing sleeps as concurrency proof. A simulated loss of worker result after fake acceptance must recover from the fake provider's stable receipt without another send. State is durable in PostgreSQL; fake provider state is intentionally in-memory and is not production-provider proof.

## Evidence and limits

Must directly prove atomic enqueue/rollback, replay conflict, different-employee isolation, competing workers, stale lease rejection, backoff/exhaustion, crash-gap reconciliation, unknown fail-closed behavior, immutable attempt history and existing DB/domain regressions.

PDF generation, attachment binding, authenticated release, real recipient verification, provider delivery and production operation remain unrun later scope. Parent PAY-W6-02 stays partial after this slice.
