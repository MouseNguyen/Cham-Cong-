# Native Codex delegation — approved route, 2026-09-05

Duke approved replacing Hermes orchestration with native Codex subagents. Codex parent manages; one bounded implementation owner writes code; an independent reviewer checks the resulting behavior and evidence. No Hermes installation, gateway or repair is required.

## First bounded wave

PAY-W1-03: a deterministic full-time synthetic payroll calculator, including explicit holiday components, separate employee/employer funds, progressive PIT and a reproducible calculation trace. This is domain code and tests, not a complete payroll app or production-law approval.

| Role | Model / effort | Scope |
|---|---|---|
| Parent | Current Codex session | Integration, approvals, independent arithmetic checks, tests and commit |
| pay_w1_03_implementer | gpt-5.6-terra / high | Only the named calculator modules, fixtures and tests in PAY-W1-03.json |
| pay_w1_03_reviewer | gpt-5.5 / xhigh | Read-only review after implementation; no product writes |

Run sequentially, at most one active child plus parent; no full sidebar/background task. No silent model fallback or child delegation. Parent performs useful independent arithmetic/acceptance review while the worker implements. Parent accepts the result before reviewer dispatch. One material review pass; optional polish never causes recursive review loops.

## Authority and verification

Route approval is recorded. Exact first-wave model/job/test approval is pending; all actions are previewed in the packet. Once Duke confirms that roster, execute its ordinary steps without separate reapproval. Reconfirm only a material scope/model/tool-effect change; the existing 30-minute roster-start TTL applies.

Worker uses this checkout, fixed input hashes and owned files. Parent checks current source/hash freshness before edits and owns all shared files. No worktrees, installs, manifest/lockfile changes, servers, browsers, database, network research, real employee data or provider integrations. Use the already installed unit/typecheck tooling only after wave approval.

Each child returns agent_id, task_id, status, summary, file/line evidence, files_read, files_modified, verification, blocker and next_action. The implementation child writes its owned handoff; reviewer returns a structured response and parent persists it. Store canonical native agent ID/transcript pointer in the receipt. Parent verifies the real diff and test output, not a worker's claimed status.

At 15 minutes take a core checkpoint. Two same-layer failures or one zero-progress attempt freezes that family. No unlisted architecture/model fallback. Parent cancels only its own running child if scope or time is exceeded. Child completion releases its active slot; keep no unreported processes. Runtime claims remain separate from static/typecheck and production evidence.

## Remaining tasks

All 20 task IDs and existing dependency nodes are preserved in task-status.json. Accepted work remains accepted at its recorded layer. Future implementation roles get concrete worker IDs in their own packets; do not spawn the entire task inventory. Legal draft blockers still require source verification and real specialist approval before payroll production use.
