# Pay Slip — Agent Working Agreement

## Scope

These instructions apply to the entire repository rooted at
`F:\Codex\Projects\Pay Slip`.

Agents must work only inside this repository and only on files explicitly owned
by the active task packet. Do not read, create, edit, move, or delete files in
`F:\Codex`, `G:\Becky\Employment Contract`, the Hermes installation, or any
other project unless Duke gives separate explicit approval.

## Sources of truth

Read these in order before implementation:

1. `AGENTS.md`
2. `docs/superpowers/plans/2026-09-04-pay-slip-design.md`
3. `docs/superpowers/plans/2026-09-04-pay-slip-implementation.md`
4. The active task packet under `docs/agent-packets/`

Current task state and prerequisites live in `docs/planning/task-status.json`;
numeric decisions live in `docs/planning/payroll-decision-matrix.md`. Historical
receipts remain evidence for their original commit and scope.

If they conflict, stop and report the conflict to the Codex parent. Do not guess.

## Product boundaries

- The product is a Vietnamese-first payroll, payslip, and attendance application
  for The Kay's Gelato.
- Keep the interface simple, premium, accessible, and usable on desktop and the
  Android iPOS tablet.
- Full-time and part-time employment rules must remain explicit and testable.
- Payroll, PIT, insurance, overtime, public-holiday work, deductions, approvals,
  finalized pay runs, and payslip delivery are high-risk business rules.
- Money and time calculations must be deterministic and must not use floating
  point for stored currency amounts.
- Legal assumptions are versioned inputs. Code and tests must not silently turn
  an unverified legal interpretation into a production fact.

## Privacy and security

- Use synthetic employees, synthetic email addresses, and synthetic attendance
  records until Duke separately approves a real-data pilot.
- Never open or ingest real employment contracts, employee records, payroll
  exports, credentials, tokens, cookies, `.env` values, or private keys without
  exact approval for that source and action.
- Never place secrets or real personal data in Git, logs, screenshots, fixtures,
  prompts, handoff artifacts, or test output.
- The public attendance surface must never expose the admin UI, database, payroll
  details, or reusable employee secrets.

## Runtime and tool authority

Static reading and edits within owned files are allowed by the active packet.
The following remain separately approval-gated and must not be inferred from a
general implementation request:

- network access or metadata queries;
- package installation or dependency upgrades;
- builds, tests, browsers, servers, databases, migrations, containers, tunnels,
  scheduled tasks, or external binaries;
- Gmail, Zalo, Cloudflare, iPOS, credentials, production data, or real messages;
- destructive cleanup or changes outside the repository.

When an approval is missing, stop with the exact command/action, purpose,
expected effect, rollback, and evidence that would be produced.

## Agent and file ownership

- The Codex parent owns architecture, approval interpretation, integration,
  verification, commits, cleanup, and completion claims.
- Hermes workers must use the model, reasoning effort, cwd, owned files, limits,
  and stop conditions declared in the active packet.
- No worker may delegate, auto-decompose, start a background child, or widen its
  file scope unless the active packet explicitly allows it.
- Atlas is the existing Hermes Manager. After Duke confirms an exact roster,
  Atlas may route only its listed packets through `fleet_message` to the named
  existing specialists. Specialists may not redelegate. This exception does not
  authorize generic child spawning, new jobs, models, file scopes or tool effects.
  See `docs/planning/hermes-delegation.md`.
- Shared files and dependency-coupled changes are serialized by the Codex parent.
- A worker handoff is evidence to inspect, not proof that the task is complete.

## Engineering workflow

- Follow test-driven development for product behavior: failing focused test,
  smallest implementation, passing focused test, then permitted broader checks.
- Preserve immutable finalized payroll inputs and auditable rule versions.
- Keep modules small with explicit interfaces. Avoid unrelated refactors.
- Report known, inferred, and unknown facts separately.
- Do not claim runtime behavior from static inspection, or production readiness
  from a local build or synthetic test.

## Git

- Work directly in this checkout. Do not create worktrees.
- Never push, force-push, rewrite history, or run destructive reset/checkout.
- Stage explicit paths only; never use `git add -A`.
- Hermes workers do not commit unless their task packet explicitly grants it.
- Before handoff, report `git status --short`, the scoped diff, verification
  results, blockers, and every modified file.
