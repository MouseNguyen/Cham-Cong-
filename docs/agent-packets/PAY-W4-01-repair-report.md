# PAY-W4-01 static repair handoff

- `agent_id`: `/root/pay_w4_01_implementer`
- `task_id`: `PAY-W4-01`
- `status`: `static_repair_complete_runtime_unverified`
- `outcome_status`: no runtime completion claim; the repaired source is ready for parent-owned compile and approved synthetic-runtime adjudication.
- `preparation_status`: static repair written in worker-owned files only.

## Summary

The pay-run boundary now takes authenticated session/CSRF credentials and immutable employee source bindings, rather than caller-provided actors or calculation results. The repository rechecks the live session row under the mutation transaction before authorizing the live role/MFA state. It derives a W1 calculator input from a trusted repository calculator context, the immutable attendance/compensation records, and the released synthetic database rule-pack accessor; it stores W1's canonical input/result and rejects a rule hash mismatch.

Finalization is synthetic-only and returns `productionReady: false`. A finalized replay with the original expected version returns only the already-existing, exact finalization outbox job; it fails if that job is absent. Legacy outbox callers retain their original idempotency key behavior because event kind/version are an optional paired extension.

## Evidence and scope

Known:

- The prior behavioral RED was adjudicated separately at `ops/evidence/PAY-W4-01-red-adjudication.json`; this static pass did not treat it as a new runtime result.
- The old TDD evidence/attempt-budget problem remains recorded in `docs/agent-packets/PAY-W4-01-implementer-report.md`. This report does not cure or relabel that evidence.
- No test, build, database, migration, server, network operation, or compile command was run in this pass, as directed.

Inferred from static source only:

- `w4_released_rule_pack_payload` eliminates application-role direct reads of `legal_rule_packs` in the calculation query and enforces released synthetic evidence in a `SECURITY DEFINER` accessor.
- The deferred finalization trigger requires a final approval event, audit event, and versioned exact outbox payload before transaction commit.

Unknown until parent verification:

- TypeScript compilation, migration application, PostgreSQL trigger semantics, RLS/role grants, and all focused integration behavior.
- Whether parent-owned schema/client files expose the new rule-pack and outbox columns to all callers.

## Files read

- `AGENTS.md`
- `docs/agent-packets/PAY-W4-01.json`
- `docs/agent-packets/PAY-W4-01-review.md`
- `ops/evidence/PAY-W4-01-red-adjudication.json`
- `.superpowers/sdd/2026-09-04-pay-slip-implementation/task-pay-w4-01-repair-brief.md`
- W1 calculator and trace sources, auth/authorization sources, W1 synthetic fixture, and current owned command/query/test/migration sources.

## Files modified

- `packages/contracts/src/pay-run.ts`
- `apps/web/src/lib/db/repositories/pay-runs.ts`
- `apps/web/src/lib/db/repositories/outbox.ts`
- `apps/web/src/lib/application/commands/create-pay-run.ts`
- `apps/web/src/lib/application/commands/calculate-pay-run.ts`
- `apps/web/src/lib/application/commands/submit-pay-run.ts`
- `apps/web/src/lib/application/commands/approve-pay-run.ts`
- `apps/web/src/lib/application/commands/finalize-pay-run.ts`
- `apps/web/src/lib/application/commands/create-adjustment-run.ts`
- `apps/web/src/lib/application/queries/get-pay-run.ts`
- `apps/web/src/lib/application/queries/explain-calculation.ts`
- `prisma/migrations/202609060006_w4_01_pay_runs/migration.sql`
- `tests/integration/pay-runs/support.ts`
- `tests/integration/pay-runs/lifecycle.spec.ts`
- `tests/integration/pay-runs/reproducibility.spec.ts`
- this report.

## Static repair details

- Calculator artifact/version/canonicalization are no longer caller bindings. They are trusted repository context, overwrite the calculator input fields, and are checked against W1 output.
- Calculation requires a nonempty, unique employee source-binding batch; it accepts both W3 `totalPayableDurationMs` and `approvedPayableMilliseconds`, and checks compensation covers the bound run period.
- Approval requires the owner authorization path and a different actor from the recorded calculation maker.
- Read/explain calls require session/CSRF plus tenant-scoped authorization.
- Migration functions use a fixed `pg_catalog` search path with fully qualified application tables; public execute is revoked and `payslip_app` is granted only the required execute privilege.
- Focused tests now express credentials, source batches, actual W1 output, synthetic/non-production finalization, draft rule rejection, maker/checker separation, exact replay, and immutable result retrieval. They are unrun source, not passing evidence.

## Verification

- Commands run: none for test/build/database/migration/server/network/compile.
- Exact RED/GREEN commands: none in this static-only repair pass.
- Relevant output: not applicable; no runtime command was authorized.

## Blockers and next action

1. Parent-owned Prisma schema/client integration must reconcile `legal_rule_packs.release_evidence` and `outbox_jobs.event_kind/event_version` with the migration before compile/runtime is claimed.
2. Parent-owned composition code must provide the trusted calculator context (`id`, `version`, artifact hash, canonicalization version, and W1 input template) when constructing `PayRunRepository`.
3. Parent must run the approved focused static compile then the dedicated synthetic harness only after it decides the prior evidence-budget violation is adjudicated and the new source is accepted for a fresh verification packet.
4. Reconcile any historical callers of the removed actor/result command shape outside this worker's ownership before claiming repository-wide compilation.

## Self-review

I checked the repair against each newly specified concern: legacy outbox compatibility, caller-controlled artifact removal, transaction-live authorization, accessor-only legal-rule lookup, compensation/snapshot binding, replay-without-creation, fixed security-definer search paths/privileges, and static test/API alignment. The main residual risk is integration rather than a claim of correctness: this pass deliberately did not compile or execute the source, and the listed parent-owned schema/composition work is required before runtime evidence can be trusted.
