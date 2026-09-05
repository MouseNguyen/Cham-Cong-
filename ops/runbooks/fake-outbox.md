# Synthetic outbox canary

PAY-W6-02a is a fake-only queue capability. It does not verify an email address,
send a real message, generate a PDF, authorize release, or prove delivery.

## Run
From this checkout, with the exact synthetic database runtime authorization:
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-database.ps1 -Mode Green -TaskId PAY-W6-02a`

The harness uses the already installed PostgreSQL 18.6 binaries. It creates a
new cluster under `.tmp/PAY-W6-02a/cluster`, binds only 127.0.0.1:55432, creates
fresh random in-memory credentials, applies both forward migrations, generates
the local Prisma client, and runs the database and delivery integration tests.
An occupied port stops startup; no existing database is reused or stopped.
The historical synthetic database name is retained only for the existing fixture
guard. W2 receipts remain unchanged.

The harness grants the non-owner app role ordinary DML, then revokes UPDATE and
DELETE on append-only history, including outbox_dispatch_attempts. The migration
also installs the immutable-history trigger. Production role provisioning and
tenant authorization remain downstream work; this fake-only module is not an
authenticated public endpoint.

## Calls and outcomes
Use `withTransaction` for enqueue, claim and finish; bare clients fail with
25P01. Caller resolves the authorized organization before invoking future routes.
Enqueue constructs one fixed neutral message from an effective destination under
a row lock. Only an exact example.invalid address is accepted. Same organization
and idempotency key replay the same employee/destination binding; changed identity
fails. The immutable job UUID is also the provider idempotency key.

`runOne` commits one lease, calls one fake method outside the transaction, then
records the result in a fresh transaction. There is no polling loop or daemon.
Clock and lease duration are injected; the trusted caller must use one coherent
clock. Lease durations are 1..300000 ms.

Definite failures permit at most three sends with 1s/2s delays. Unknown or expired
sends go to reconciliation. Only authoritative not_found permits a further
bounded send. Unknown reconciliation and abandoned reconciliation claims are
bounded to three. A stale or expired lease cannot finish. Accepted is fake provider
acceptance only; no delivered status exists. Dead letters require later deliberate
review; there is no automatic reset/resend API.

The fake provider keeps its acceptance ledger in memory. Losing that ledger
returns unknown, never not_found. Crash-gap tests discard a worker result after
fake acceptance; they do not kill an OS process. Queue/attempt durability is in
PostgreSQL; production provider reconciliation and restart recovery are not proven.

## Cleanup and evidence
The harness stops only its owned cluster in finally. The receipt records listener
absence and postmaster PID-file absence in
`ops/evidence/PAY-W6-02a-runtime.json`. Stopped synthetic clusters and redacted logs
are retained under ignored .tmp; no destructive cleanup occurs. No server remains
running between tests. Do not treat a test failure as a cleanup pass without
inspecting both fields.

Initial RED: 8 missing-module failures with 16 prior database tests passing.
Later receipts document the additive migration and final focused verification.
Original migration bytes and historical acceptance receipts are preserved.
