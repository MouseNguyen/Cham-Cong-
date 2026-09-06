# SDD ledger — plan: docs/superpowers/plans/2026-09-04-pay-slip-implementation.md

Active task: PAY-W4-01 — immutable pay-run orchestration
Base: d81bb4528a1a743ad0bc061eab9d8f2ec688cb64

## Preflight dependency/interface scan

| Producer | Consumer | Shared interface | Finding / ruling |
|---|---|---|---|
| W1-03 full-time calculator | W4-01 calculate/finalize | Canonical input, result, trace, calculator version/hash | Accepted synthetic prerequisite. Preserve exact integer VND and deterministic trace. |
| W2-03 employee compensation | W4-01 create/calculate | Compensation term ID/hash and effective period | Accepted synthetic prerequisite. Reject stale or mismatched bindings. |
| W3-03 attendance review | W4-01 create/calculate | Approved snapshot ID/hash and exact millisecond segments | Accepted synthetic prerequisite. Frozen reads use the sealed snapshot source. |
| W6-02a durable outbox | W4-01 finalize | Transactional enqueue and idempotency key | Accepted synthetic prerequisite. Provider/PDF work stays after commit and outside W4. |
| W4-01 lifecycle tests | W4-01 commands/repository | Five-state transition, maker-checker, expected version | Plan is internally consistent with the design. |
| W4-01 file list | W4-01 transaction requirement | Database repository, migration, schema synchronization | Ruling: include repository/migration/shared schema because the transaction requirement cannot be implemented otherwise; cost if wrong is a slightly wider but still task-local diff. |
| Approved design lifecycle | Existing three-state DB constraint | draft/reviewed/finalized versus five approved states | Ruling: migrate reviewed to review_pending and enforce draft/calculated/review_pending/approved/finalized; cost if wrong is compatibility repair in existing DB tests. |
| SDD worktree default | Project NO WORKTREES rule | Execution workspace | Ruling: use the approved direct main checkout; cost if wrong is loss of isolation, mitigated by one writer, clean base, explicit ownership, and parent-only commit. |
| SDD implementer commit default | Project parent-only commit rule | Git ownership | Ruling: worker leaves changes uncommitted and parent commits after review; cost if wrong is review packaging from the working diff rather than a commit range. |

Task PAY-W4-01: approved — exact design, roster, and synthetic runtime wave confirmed by Duke.

## PAY-W4-01 implementation handoff audit

- Outcome status: partial; not accepted.
- Preparation status: implementation diff exists and two later focused synthetic PostgreSQL runs passed 3/3 with cleanup.
- Invalid evidence: Red mode skipped all migrations, so the RED failure was missing baseline schema rather than missing W4 behavior.
- Attempt breaker: four failed GREEN runs preceded the passes, exceeding the packet limit of two attempts per evidence layer.
- Runtime state: frozen pending research-backed evidence repair and independent review.
- Direct evidence: `ops/evidence/PAY-W4-01-runtime.json` and the superseding correction at the top of `docs/agent-packets/PAY-W4-01-implementer-report.md`.
- Independent review: completed read-only by `pay_w4_01_reviewer`; 9 P1 product/static findings accepted.
- Blockers: 10 total = 1 process/evidence blocker + 9 P1 product/static blockers.
- Next action: behavior-first tests, minimum coupled repair, static validation, then one bounded changed-hypothesis RED.

## Changed-hypothesis runtime approval gate

- Static repair: W4 Red mode now applies exactly the seven checked-in pre-W4 migrations and expects the old `pay_runs_status_check` to reject the new `calculated` transition.
- Attempted runtime: not started; the approval reviewer rejected execution because the changed harness requires fresh trusted user approval after the earlier attempt-family failures.
- Side effects observed: none; no PostgreSQL listener/process started and no runtime receipt was appended.
- Exact requested command: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-pay-runs.ps1 -Mode Red`.
- Runtime boundary: fresh synthetic cluster under `.tmp/PAY-W4-01`, loopback `127.0.0.1:55432`, generated synthetic credentials, seven pre-W4 migrations, focused W4 Vitest only.
- Stop/cleanup: accept only `pre_w4_lifecycle_contract_missing`; otherwise stop. The harness stops its exact owned PostgreSQL cluster and verifies listener/PID absence.
- Next action: await Duke's fresh explicit approval for this exact changed-hypothesis RED.

## Changed-hypothesis RED result

- Run: `red-ba7fc2fb-5d6c-464e-bc70-9ed7e16613d2`.
- Direct result: all 3 focused tests failed at the pre-W4 pay-run lifecycle trigger with `INVALID_STATE_TRANSITION`.
- Adjudication: valid behavior-specific RED. The seven pre-W4 migrations succeeded; this was not an empty-schema/setup failure.
- Harness status: incorrectly recorded `failed` because the classifier accepted only `pay_runs_status_check`; direct output used the trigger error instead. Classifier updated to accept either exact old-lifecycle fingerprint; no rerun.
- Cleanup: passed; listener absent and postmaster PID file absent.
- Blockers: 9 P1 product/static blockers remain. The process/evidence blocker is resolved.
- Next action: write direct P1 regression tests, implement the coupled repair, statically validate, then run one bounded GREEN.

## PAY-W4-01 parent acceptance

- Outcome status: accepted_synthetic_only.
- Core runtime: 7/7 focused W4 tests passed in green-c1814385-e0dd-471d-81b0-239e4842a7e0.
- Regressions: 42/42 payroll, 16/16 database, 22/22 employee, and 27/27 combined database/delivery harness tests passed; 98 distinct tests after overlap removal.
- Static/build gates: root typecheck, zero-warning lint, optimized production build, JSON parsing, and diff check passed.
- Review: independent read-only reviewer reports zero remaining P0/P1 static blockers and no masked product defect in the canonical JSON or replay test corrections.
- Cleanup: every final database receipt passed listener/PID cleanup; independent check found port 55432 listener absent.
- Evidence limit: local synthetic full-time orchestration only. Production, real legal rules/data, part-time payroll, UI, PDF, and providers remain not run.
- Receipt: docs/agent-packets/PAY-W4-01-parent-acceptance.json.
- Next action: start the next separately approved task.
