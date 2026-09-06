# PAY-W4-01 static repair brief

- owner: `pay_w4_01_implementer`
- mode: static edits only
- runtime/tests/build/database/network: forbidden
- delegation/commit: forbidden
- source review: `docs/agent-packets/PAY-W4-01-review.md`
- valid RED: `ops/evidence/PAY-W4-01-red-adjudication.json`

## Terminal outcome

Return a review-ready static diff that closes the nine accepted P1 findings without changing W1 calculator rules, W2 auth semantics, W2 delivery verification behavior, W3 snapshot semantics, or production readiness.

## Required design

1. Replace caller-authored `PayRunActor` with session/CSRF credentials. Reuse `AuthRepository.checkCsrf`, revalidate the active user/session/current role inside each mutation transaction, and call existing `authorize` for `PAYROLL_DRAFT`, `PAY_RUN_APPROVE`, or `PAY_RUN_FINALIZE`. Reject revoked/expired/inactive sessions and non-finite/future/stale MFA. Reads require the same authenticated credentials.
2. `calculatePayRun` accepts a non-empty array of employee source bindings, not caller-authored results. For each row, load and lock the exact approved attendance snapshot, compensation term, and released synthetic rule pack by ID/hash/organization/workplace/employee. Validate snapshot period, compensation applicability, and trusted calculator binding.
3. Invoke the accepted W1 `inputFromFixture` and `calculatePayroll` boundary. Persist only its derived canonical input/result, hashes, calculator/canonicalization/schema versions, lines, and traces. Validate the W1 rule-pack hash equals the exact released database rule-pack hash and salary/attendance fields match their frozen database sources. Do not change W1's `finalizable:false` production boundary; W4 remains synthetic and returns `productionReady:false`.
4. Insert all employee calculations in one transaction, reject an empty/duplicate batch, and transition the whole pay run to `calculated` only after every row/line succeeds.
5. Reads and explain queries must be organization-scoped through `pay_runs` and require authenticated owner/accountant credentials. Historical reads return stored bytes only and never invoke W1.
6. Adjustment creation requires a finalized source and fresh owner authorization; derive organization, workplace, period, and evidence mode from the original. Accept only `originalRunId` and a non-empty reason.
7. Finalize must be replay-idempotent for the same original expected version, return the existing event only after verifying exact payload/bindings, reject changed retry identity/version, and remain atomic with final audit/approval/outbox.
8. Extend the existing outbox helper and W4 migration with explicit nullable `event_kind` and `event_version`, a paired-nullability check, and a partial unique constraint/index over `(organization_id,pay_run_id,event_kind,event_version)`. W4 finalization uses `pay_run_finalized` and the final version.
9. Add a deferred database invariant that rejects a committed transition to `finalized` unless its final approval event, audit event, and exact finalization outbox intent exist. Preserve application repository transitions; do not add a parallel public bypass API.
10. Remove the W4 `CREATE OR REPLACE require_finalized_parent` regression. The accepted W2 function must remain unchanged so effective-date, closure, and exact verification-payload checks survive.
11. Add/strengthen focused tests for: real W1-derived evidence, two employees, tampered source/hash/payroll input, unsigned rule pack, stale version, accountant approve/finalize, revoked/expired/inactive session, invalid/future/stale MFA, cross-tenant reads, valid transition chain, replay/double finalize, injected rollback, direct-finalize deferred rejection, duplicate event key, post-finalize mutation, adjustment linkage, and byte-identical historical read after active source changes.
12. Keep tests synthetic. Use actual W1 calculator code, not a handcrafted canonical result.

## Worker-owned files

Use only the worker-owned paths in `docs/agent-packets/PAY-W4-01.json`, including the newly added outbox helper and repair report. Do not edit parent-owned Prisma schema, package exports/scripts, historical integration suites, status/evidence ledgers, or harness.

## Handoff

Report exact files, static checks only, remaining uncertainties, and any parent-owned integration required. Do not claim GREEN, runtime, broad regression, or completion.
