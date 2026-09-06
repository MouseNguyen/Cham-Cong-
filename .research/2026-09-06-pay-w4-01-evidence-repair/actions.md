# Actions

## Primary repair

1. Obtain a read-only independent review of the unchanged W4 diff and classify every finding by severity and evidence layer.
2. Parent fixes only confirmed core/spec/security blockers, including test gaps necessary to prove the approved gates.
3. Repair Red mode so it creates a fresh pre-W4 database by applying the ordered local migration set except `202609060006_w4_01_pay_runs`; do not skip baseline migrations.
4. Add a dedicated pay-run test TypeScript configuration and integrate the historical database callers with the five-state contract.
5. Before runtime, perform static checks of the exact migration list, changed harness control flow, SQL safety, test discovery, and scoped diff.
6. Execute one fresh parent-controlled RED. Predicted evidence delta: the database is structurally valid at the pre-W4 boundary and the tests fail specifically because the W4 lifecycle/release-evidence contract is absent.
7. If and only if that RED matches the prediction, execute one fresh GREEN plus required regressions/typecheck/lint/build and prove cleanup. Any same-layer failure stops the route.

## Bounded fallback

If the ordered pre-W4 migration application cannot be made deterministic without widening runtime authority, stop and report blocked. The only permitted fallback is a task-local PostgreSQL baseline fixture generated from those same checked-in pre-W4 migrations with a sealed file list and hash; it must not be a mock or empty schema.

## Explicit exclusions

No additional architectural fallback, suffix retry chain, network, install, dependency update, real data, provider, public listener, production action, push, worktree, or destructive cleanup.

## Current approval state

The behavior-specific RED is accepted. Final focused W4, payroll, database, employee, and delivery regressions passed, along with typecheck, lint, build, source seals, diff check, and cleanup. Independent static review reports zero blockers. PAY-W4-01 is accepted at the local synthetic layer; production and later product layers remain separately gated.
