# PAY-W5-02a independent review and parent disposition

Lint closure: Duke requested the next step; parent replaced the two baseline any annotations with explicit/inferred types. Root lint and typecheck now pass. TypeScript emitted JavaScript is identical to commit b4891e2 for both edited files, directly proving no emitted behavior change. Receipt: `ops/evidence/PAY-W5-02a-lint-closure.json`. W5-02a now has zero blockers at the accepted synthetic core scope. Five production release groups and W5-02b/c remain separate. Historical blocker counts below are superseded.

Final parent disposition: run `green-3b946fe1-fa1d-4d89-b519-fd06f429786c` passed all four browser tests and both live HTTP tests. The full synthetic employee → attendance → calculated/approved/finalized payroll → stored reload path passed, as did duplicate reconciliation, owner-maker rejection and stored hash visibility. All three review findings are closed at the tested layer by parent evidence; no second independent review is claimed. Typecheck and production build passed. Screenshots were directly inspected. Cleanup passed and ports were absent. Two unchanged baseline lint errors remain; full packet status is partial/core verified, not unconditional acceptance. Authoritative final claim ledger: `PAY-W5-02a-parent-acceptance.json`. Earlier checkpoints below are historical.

Current checkpoint supersedes counts below: run `green-7c26469d-8412-4aef-afe2-ee873ad24be5` passed 3/4 browser tests including duplicate-draft recovery/reload reconciliation. That review finding now has direct sequential UI runtime evidence (not concurrent stress evidence). Full payroll stopped at an exact badge text assertion; test-only correction drafted after reading Status and all remaining selectors. Owner-maker rejection and stored trace still await runtime evidence. Current open count: 1 harness check + 2 unverified review findings + 2 baseline lint errors + 1 fresh approval gate = 6. Typecheck passed, cleanup passed, build/HTTP suite not run.

Latest parent update: approved extension run `green-f00959a3-b822-42ec-bfeb-018c6e6a1f63` passed accessibility and dashboard; two new harness failures prevented downstream verification. Product typecheck passed, root lint retained its two existing errors. Source-backed test-only fixes are drafted (main-scoped alert and browser-native authenticated fetch). Full payroll, duplicate reconciliation, owner-maker rejection and stored evidence visibility remain unverified. Cleanup passed; build/HTTP suite not run. The original review below remains historical evidence. Current open count: 2 harness checks + 3 review findings awaiting verification + 2 baseline lint errors + 1 fresh runtime approval gate = 8, excluding the separately tracked five production groups.

2026-09-08. Outcome: partial. Preparation: source repairs drafted, current revision runtime-unverified.

Reviewer: `/root/pay_w5_02a_reviewer`, requested GPT-5.5 xhigh. Read-only source, diff and receipt inspection; no writes, runtime, tests, browser, network, credentials or delegation. Verdict at reviewed revision: reject core acceptance.

## Findings

1. Duplicate ordinary pay runs could be created for the same workplace/month after reload. The in-memory unknown-response latch alone did not reconcile an existing run. Evidence: admin panel create path, existing PayRunRepository.create random UUID insertion, schema lacks base-run uniqueness.
2. Owner maker actions could produce a run that the same owner cannot approve. Evidence: panel exposed calculate/submit to both roles; base authorization allows owner payroll draft; repository approval enforces a different maker.
3. Trace showed formula lines but omitted required stored source hashes, calculator versions and input/result bindings. Evidence: design-system trace contract, reduced repository get response and panel lines-only disclosure.

Formal evidence gaps: two failed GREEN receipts; no successful current-revision rerun; HTTP façade coverage lacked several source/state/MFA paths. Label and contrast repairs were source-only at review time.

## Parent disposition

All three findings affect core behavior or audit visibility and were accepted for repair, without editing the baseline W4 repository or schema.

- The admin create path now takes a nonblocking PostgreSQL advisory lock bound to organization/workplace/period. It reconciles one existing ordinary run, rejects multiple existing base runs, excludes adjustment runs, and otherwise delegates creation to the existing service. Its dedicated connection is destroyed in finally so a session lock cannot return to the pool. This guards this admin façade; it does not claim database-wide uniqueness for every other repository consumer.
- The admin maker route and UI now require accountant role; owner remains checker. Existing repository authorization is unchanged. An HTTP owner-maker rejection test was drafted.
- The authenticated detail read includes stored calculation evidence from pay_run_employees and scoped employee display names. The trace discloses source IDs/hashes, calculator/artifact/canonicalization versions, input/result hashes and stored canonical input. Browser assertions compare displayed hashes with the stored row.
- A dropped-response browser case executes the real create request, discards the response, checks the disabled retry, reloads and checks reconciliation preserves one draft.

These post-review changes have not been rerun or independently accepted. Do not convert this disposition into a passing review claim.

## Current claim ledger

| Layer | Status | Evidence limit |
| --- | --- | --- |
| Behavior-specific RED | passed | Baseline authenticated dashboard heading missing |
| Existing regressions | passed | Payroll domain 42, employee 22, attendance 8, pay-run 7 before latest admin repairs |
| Browser core | blocked | Dashboard passed; employee and attendance sequence reached; payroll finalization not reached |
| Accessibility | blocked | Muted contrast failed; repair not rerun |
| Current-revision typecheck/scoped lint | not_run | Earlier revision passed; current repairs unverified |
| Root lint | blocked | Two unchanged baseline any annotations outside packet edit ownership |
| Live admin HTTP suite | not_run | Browser failure prevented execution |
| Production build/screenshots | not_run | No claim |
| Independent review | blocked | Three findings repaired in source only, verification pending |
| Owned runtime cleanup | passed | Both GREEN receipts; ports 55432/46217 absent on parent check |
| Production | not_run | Five release blocker groups retained |

Blocker accounting: two failed browser/accessibility checks plus three review findings remain open until verification (5), two separate baseline lint errors (2), and one fresh-runtime-approval gate (1). Unrun verification layers are listed above and are not counted as discovered defects. No local commit or push was made.

Next action: approve the parent-only repair verification extension in PAY-W5-02a-runtime-preview.md, then run it once. Stop on a new failed layer; retain exact failure evidence. No worker respawn or broader audit is proposed.
