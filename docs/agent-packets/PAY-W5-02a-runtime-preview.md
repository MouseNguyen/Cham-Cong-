# PAY-W5-02a revision 1 — bounded execution approval

## Final execution receipt

Duke approved the bounded final wave. Its first run, `green-3b946fe1-fa1d-4d89-b519-fd06f429786c`, passed 4 browser tests and 2 live HTTP tests; no retry was needed. Typecheck and build passed. Root lint retained the same two baseline errors outside edit ownership. Browser/database cleanup passed and parent checked both ports absent. Local synthetic core is verified; full packet acceptance remains blocked only by those two lint annotations. See `PAY-W5-02a-parent-acceptance.json` for the claim ledger and evidence limits. All approval proposals and failed-run checkpoints below are historical; none authorize additional runtime.

## Latest checkpoint — three browser tests passed

The second approved extension was consumed by run `green-7c26469d-8412-4aef-afe2-ee873ad24be5`: accessibility, dashboard and dropped-response/reload duplicate reconciliation passed. Full payroll stopped at one exact badge text assertion; Status renders a decorative bullet inside the text, so the test now uses the same status-scoped hasText selector as the remaining payroll-state assertions. The remaining selectors and Dialog/Status source were read before this correction. No product code changed in this extension. Typecheck passed; root lint still has exactly two baseline errors. Cleanup passed and parent found both ports absent. No build or HTTP suite ran.

Proposed final verification scope: parent only, 30 minutes, same commands and resources below, at most two GREEN runs. One source-backed test-only correction/retry may proceed automatically after a demonstrated harness failure; stop for any product/runtime failure, missing authority, unchanged evidence, or second failure. No new workers, installs, schema edits, baseline W4 edits, real data or external network. This proposal replaces the single-attempt stop condition only after Duke explicitly approves it. The current approval has been consumed.

## Latest result — extension attempt consumed

Duke approved the parent-only extension. Run `green-f00959a3-b822-42ec-bfeb-018c6e6a1f63` passed accessibility and dashboard, but failed two newly added harness checks. Typecheck passed; root lint retained exactly two baseline errors. The harness cleaned up its database and browser server; parent independently found both ports absent. Build and HTTP suite were not run after the declared stop.

The two test-only corrections are now reviewable: scope the application alert to main (excluding Next's route announcer), and use browser fetch for the authenticated API boundary instead of APIRequestContext. Installed Playwright source at coreBundle.js:13398/13405 excludes Secure cookies on HTTP 127.0.0.1; current product session cookies intentionally retain Secure. No product authentication change or unapproved retry occurred.

Next proposed authorization: the same parent-only 30-minute command/resource scope below, one GREEN invocation, no automatic retry or new workers. The previous approval is consumed. These test-only edits must be checked before runtime. Stop at a new failed layer, retain receipts and cleanup, and do not commit unverified work.

## Current checkpoint — 2026-09-08 repair verification proposed

Outcome: partial. The original wave was approved and executed. Both GREEN attempts failed; the runtime family is frozen. The original proposal below is historical, not a current grant for another retry.

Direct evidence: dashboard passed; the second core test created a synthetic employee and completed attendance proposal, separate-owner approval and immutable snapshot finalization. It stopped at the payroll workplace selector. Accessibility reported muted badge contrast 4.38 against a 4.5 requirement. Both runs cleaned up owned PostgreSQL and Next processes/listeners. Payroll finalization through the new UI, live HTTP negative tests, screenshots and production build remain unverified.

Source-backed repair: installed Playwright `coreBundle.js` resolves labels through recursive label text, including nested select options. `Field.tsx` now associates a separate label and control through `htmlFor`/`id`. The muted badge now uses the existing darker ink token. The test asserts the calculator API boundary before entering the payroll UI and avoids reusing an already consumed TOTP time step. A payroll unknown-response latch prevents duplicate submissions; a test drops the response only after the real create request completes and checks one stored draft.

Proposed parent-only verification extension: one GREEN invocation, plus typecheck, lint, build and final scoped diff/cleanup inspection, within 30 minutes. Stop on the first new failing runtime layer; no automatic retry and no new workers.

Post-review repairs are included in this exact extension: admin-only accountant maker gating, same-period base-run reconciliation guarded by a nonblocking database advisory lock, stored source/hash/version trace disclosure, and tests for dropped-response/reload reconciliation, owner-maker rejection and displayed stored hashes. Existing W4 repository and schema sources remain outside the edit scope. Review and parent disposition: `PAY-W5-02a-review.md`.

```powershell
npm run typecheck
npm run lint
powershell -NoProfile -File scripts/windows/test-admin.ps1 -Mode Green -Browser
npm run build
git diff --check
```

Same repository, existing dependencies, synthetic data, in-memory generated auth and DPAPI only. Same loopback ports 55432 and 46217; no external network, real credentials, installs, production writes or pushes. Ceiling: 2 GB new outputs, 4 GB RAM, ordinary CPU, no GPU. Keep task-owned evidence and generated build outputs. The harness stops exact owned processes and verifies listener absence; rollback remains a reviewable Git diff, with no destructive reset.

Two pre-existing root lint errors remain in unchanged `apps/web/src/lib/db/repositories/pay-runs.ts:130` and `tests/integration/pay-runs/support.ts:32`. They are outside this packet's product edit ownership and are reported separately; a scoped lint pass does not count as a root lint pass.

Fresh approval is required by this packet's two-attempt stop condition and repository AGENTS.md's separately gated tests/builds/servers/databases. The source fixes above are already reviewable; only the proposed verification effects await approval.

Outcome status: not run. Preparation status: packet drafted from accepted W4/W5 receipts and inspected local service/harness sources. One consolidated approval blocker remains: exact roster plus local synthetic runtime.

## Result

Build the approved Vietnamese employee, attendance and five-state pay-run screens against real existing application services. Prove an authenticated synthetic full-time workflow through finalization and stored calculation explanation. This is the next core slice, not PDF/delivery completion or production release.

## Roster

Parent owns integration, runtime verification and commit. One Terra (`gpt-5.6-terra`, high) implementation child, then one GPT-5.5 (`gpt-5.5`, xhigh) read-only reviewer. At most one child at a time; no child delegation. Exact ownership is in `PAY-W5-02a.json`. Roster start approval expires after 30 minutes under the existing agreement.

## Local actions and commands after confirmation

Workspace for every command: `F:\Codex\Projects\Pay Slip`.

1. Add the scoped tests and W5-only branch to the existing harness. RED must apply all existing migrations; never use the generic unmigrated RED path. No schema or migration-source edits are included.
2. Execute the new wrapper twice, before and after product implementation:

```powershell
powershell -NoProfile -File scripts/windows/test-admin.ps1 -Mode Red -Browser
powershell -NoProfile -File scripts/windows/test-admin.ps1 -Mode Green -Browser
```

The wrapper will run the reviewed W5 branch of `test-database.ps1`: installed PostgreSQL 18.6 `initdb`/`pg_ctl`, installed Prisma validate/generate/migrate-deploy into a fresh task-owned synthetic cluster, installed Vitest on `tests/integration/admin`, installed Next.js on loopback, and installed Playwright/Chrome on the two W5 E2E files. It generates ephemeral test accounts, TOTP/CSRF/session material in memory and uses existing DPAPI for synthetic auth. No ambient `.env`, credentials or real employee data may be opened. Parent inspects the final wrapper diff before execution.

3. Run focused regressions and quality checks:

```powershell
npm run test:unit -- --run packages/payroll-domain
powershell -NoProfile -File scripts/windows/test-pay-runs.ps1 -Mode Green
npm run test:employees
npm run test:attendance-review
npm run typecheck
npm run lint
npm run build
```

Inspect the installed runner and its declared parameters before invoking each wrapper. Use existing dependencies only. If axe or a browser/font dependency is missing, report the exact missing coverage; do not install or claim that gate passed. A full WCAG claim is outside this bounded screen check.

4. Check owned process/listener cleanup, `git diff --check`, scoped diffs and `git status --short`; record receipts and synthetic screenshots. Stage only verified packet-owned paths and create one local commit. Do not push.

## Resources and boundaries

- Budget: 90 minutes, 15-minute core checkpoint, two attempts at one evidence layer; source-backed escalation after two failures or any zero-progress attempt.
- Estimated ceiling: 2 GB new local outputs, 4 GB RAM, ordinary CPU for local build/tests; no GPU work.
- Ports: PostgreSQL `127.0.0.1:55432`, admin `127.0.0.1:46217`. No public/LAN bind or tunnel. Inspect PID/path/command line for occupied ports and fail closed on unrelated ownership.
- Network: loopback app/database/browser traffic only. No package installs, downloads, metadata calls, provider APIs or paid generation. Child model usage is limited to the named roster under the current Codex plan.
- Keep synthetic database/evidence outputs under `.tmp/PAY-W5-02a` and `ops/evidence/PAY-W5-02a-*`; generated application/compiler outputs remain in their configured repository paths.
- Cleanup: stop only exact harness-owned child processes and cluster, then independently prove listeners absent. No recursive deletion, unrelated process kills or outside-repository writes.
- Rollback: reviewable Git diff in this checkout; no destructive reset or automatic revert. Synthetic clusters are isolated from real data and retained for inspection.

## Remaining roadmap and release limits

After W5-02a: encrypted PDF → fake release services → delivery UI/tool evals → M0 synthetic full-time cycle → part-time/boundary expansion → recovery/operations/retention → release verification. Later packets require their own exact effect previews where new authority is necessary.

Five production blocker groups remain: signed numeric/source matrix; real iPOS/tunnel/security evidence; real Gmail authorization/send/revoke; replacement-profile recovery and Windows operations proof; two signed parallel payroll cycles. This approval does not authorize any of those effects.

## Why confirmation is required

Repository `AGENTS.md`, Runtime and tool authority: “The following remain separately approval-gated and must not be inferred from a general implementation request” includes builds, tests, browsers, servers and databases. Agent and file ownership additionally says: “Confirm the exact model/job/action roster before execution.” Confirming this revision authorizes the listed bounded wave once; ordinary listed steps then proceed without repeated approvals.
