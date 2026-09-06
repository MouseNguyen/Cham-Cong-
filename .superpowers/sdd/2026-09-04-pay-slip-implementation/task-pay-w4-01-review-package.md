# PAY-W4-01 independent review package

- reviewer: `pay_w4_01_reviewer`
- mode: read-only
- base commit: `d81bb4528a1a743ad0bc061eab9d8f2ec688cb64`
- working directory: `F:\Codex\Projects\Pay Slip`
- runtime authority: none for this review
- mutation authority: none
- delegation authority: none

## Read first

1. `AGENTS.md`
2. `docs/superpowers/plans/2026-09-04-pay-slip-design.md`
3. `docs/superpowers/plans/2026-09-04-pay-slip-implementation.md`
4. `docs/agent-packets/PAY-W4-01.json`
5. `.research/2026-09-06-pay-w4-01-evidence-repair/agent_handoff.md`
6. `docs/agent-packets/PAY-W4-01-implementer-report.md`
7. `ops/evidence/PAY-W4-01-runtime.json`

## Review scope

- `packages/contracts/src/pay-run.ts`
- `apps/web/src/lib/application/commands/*pay-run.ts`
- `apps/web/src/lib/application/commands/create-adjustment-run.ts`
- `apps/web/src/lib/application/queries/get-pay-run.ts`
- `apps/web/src/lib/application/queries/explain-calculation.ts`
- `apps/web/src/lib/db/repositories/pay-runs.ts`
- `prisma/migrations/202609060006_w4_01_pay_runs/migration.sql`
- `tests/integration/pay-runs/**`
- compatibility impact on `tests/integration/db/transactions.spec.ts`, shared schema/contracts, and prior payroll calculator interfaces

## Required review

1. Check exact W4-01 requirements: five-state lifecycle, expected version, exact source/hash bindings, maker-checker, fresh MFA, frozen canonical inputs/results/traces, atomic audit/approval/outbox, read-without-recalculation, and linked adjustments.
2. Check SQL migration safety: legacy migration, constraint replacement, transition and immutability triggers, role grants, SECURITY DEFINER search path/ownership/privilege, rollback behavior, and one-event idempotency.
3. Check test strength: behavior-specific RED feasibility, multi-employee behavior, stale bindings, unsigned rules, invalid transitions, authorization, MFA timestamp edge cases, double finalize, crash/rollback/retry, post-finalize mutation, historical byte identity, calculator boundary, and adjustment linkage.
4. Check compatibility/type boundaries and identify callers broken by retired helpers.
5. Separate findings as P0/P1/P2/P3 with exact file and line. P0/P1 findings block the next runtime. P2/P3 are backlog unless they make an approved must-pass gate false.
6. Do not accept the invalid RED or attempt-budget breach as repaired by the later 3/3 passes.

## Output contract

Return:

- `agent_id`, `task_id`, `status`
- findings ordered by severity, each with evidence, exact file/line, impact, and smallest repair
- known / inferred / unknown
- files read; files modified (must be none)
- verification performed (static only)
- exact blocker count
- recommendation: `accept_static`, `repair_then_verify`, or `blocked`
- one next action
