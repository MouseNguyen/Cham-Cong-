# PAY-W4-01 independent static review

- agent_id: `pay_w4_01_reviewer`
- task_id: `PAY-W4-01`
- status: `blocked_static_review`
- recommendation: `repair_then_verify`
- files modified by reviewer: none
- verification: static source/diff inspection only
- exact blocker count: 10 = 1 process/evidence blocker + 9 P1 product/static blockers

## P1 findings

1. The W4 migration replaces the accepted W2 `require_finalized_parent` verification branch with a weaker guard, dropping effective-date/closure and exact payload checks.
2. `calculatePayRun` accepts caller-supplied canonical payroll results/lines instead of invoking or cryptographically validating output from the accepted W1 calculator boundary.
3. Pay-run mutations bypass the accepted session/CSRF/current-user boundary and accept non-finite or future MFA timestamps.
4. Pay-run reads require no credentials, and `explain` is not tenant-scoped through `pay_runs.organization_id`.
5. One calculation inserts one employee and immediately moves the entire run to `calculated`, preventing normal multi-employee runs.
6. The finalization event uniqueness invariant is stored only as an arbitrary idempotency key, not enforced for pay-run/event-kind/version.
7. Direct app-role status updates can finalize without proving finalization audit and outbox rows exist.
8. `legal_rule_packs.release_evidence` is absent from `prisma/schema.prisma`.
9. Retired legacy helpers break accepted integration callers and make broad regressions fail.

## Evidence pointers

- W4 implementation: `apps/web/src/lib/db/repositories/pay-runs.ts`, `packages/contracts/src/pay-run.ts`
- W4 SQL: `prisma/migrations/202609060006_w4_01_pay_runs/migration.sql`
- Weakened accepted W2 guard: `prisma/migrations/202609060002_w2_03_employees/migration.sql`
- Existing auth boundary: `apps/web/src/lib/db/repositories/auth.ts`, `apps/web/src/lib/application/commands/authorization.ts`, `apps/web/src/lib/auth/authorization.ts`
- Existing callers: `tests/integration/db/transactions.spec.ts`, `tests/integration/db/immutability.spec.ts`, employee compensation/email verification integration tests
- Process evidence: `ops/evidence/PAY-W4-01-runtime.json`

## Known / inferred / unknown

Known: the review was read-only; the original RED is invalid; four failed GREEN attempts exceeded the budget; current tests cover only one happy path, one draft-rule rejection, and one stored-read check.

Inferred: later 3/3 passes support only those three focused synthetic cases and cannot support W4 acceptance while the nine findings remain.

Unknown: broad regression outcome and final typecheck/lint/build status after repairs.

## Smallest repair boundary

Preserve the full W2 verification guard; route mutations and reads through trusted session/CSRF authorization; compute or validate W1 canonical evidence instead of trusting arbitrary bytes; calculate all employees atomically; enforce one finalization intent per event/version and prevent direct app-role finalization; synchronize Prisma; migrate historical callers; and add direct negative/rollback/replay/reproducibility tests.

## Final static re-review after repair

- status: static_review_clear_runtime_unverified
- recommendation: proceed_to_parent_runtime_verification
- remaining static blocker count: 0
- verification: read-only source/diff inspection; no tests, build, database, network, commit, or production action

All nine original P1 findings are statically resolved. The re-review found one additional analogous privilege issue: the maker-checker lookup used a row lock on append-only approval_events even though the application role intentionally lacks UPDATE privilege. The parent removed that unnecessary lock, and the reviewer verified the current query is a non-locking, tenant/run/action-scoped read. The immutable snapshot lookup likewise no longer row-locks attendance_snapshots, while the mutable compensation row remains locked. W1 canonicalize now provides deterministic bigint-safe calculation-line trace serialization.

Runtime, migration, focused tests, broad regressions, final typecheck, lint, and build remain unknown after the final repairs.

## Reproducibility assertion adjudication

- status: static_review_clear_for_this_adjudication
- remaining static blocker count: 0

The first freshly approved verification run passed all six lifecycle tests and failed only because the reproducibility test compared the parsed canonical JSON trace, whose currency values are decimal strings, with the in-memory W1 trace, whose values are bigint. The test now derives its expected explanation from the already-verified W1 canonicalResult. This preserves the contract that historical explanation comes from archived canonical JSON and does not mask a product defect. Runtime verification after this assertion repair has not run.
