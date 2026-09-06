# PAY-W4-01 brief — immutable pay-run orchestration

Read `docs/agent-packets/PAY-W4-01.json` first. It is the exact authority, ownership, runtime, exclusion, and acceptance contract.

Implement Task PAY-W4-01 from `docs/superpowers/plans/2026-09-04-pay-slip-implementation.md`, lines 617–649, against the binding design in `docs/superpowers/plans/2026-09-04-pay-slip-design.md`, especially sections 7, 9, 10, and 17.

Required flow: `draft -> calculated -> review_pending -> approved -> finalized`.

Use strict TDD: write focused lifecycle and reproducibility tests, run them and preserve the expected RED evidence, then implement the smallest code that makes them GREEN. Exercise the real PostgreSQL transaction boundary. Do not write production code first.

The current repository has a three-state W2/W6 scaffold and an initial schema. Replace or extend only what W4 requires. The approved ruling is to migrate existing `reviewed` rows to `review_pending`, then enforce the five-state lifecycle. The implementation plan's abbreviated file list does not override the transaction and database requirements; the packet expressly owns the repository and additive migration.

Subagents may not delegate or commit. Modify only `worker_owned_files`. Stop with `NEEDS_CONTEXT` before touching a parent-owned or shared file. No network, installs, real data, provider calls, public listener, production, push, worktree, or destructive cleanup.

Write the structured handoff to `docs/agent-packets/PAY-W4-01-implementer-report.md` with: `agent_id`, `task_id`, `status`, summary, evidence, files read, files modified, verification, blocker, next action, exact RED/GREEN commands and outputs, and self-review.
