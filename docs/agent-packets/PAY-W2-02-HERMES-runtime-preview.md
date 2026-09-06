# PAY-W2-02 consolidated execution approval preview

Task packet: PAY-W2-02-HERMES
Task owner: hermes-forge-w2-02
Requested outcome: a complete synthetic owner/accountant authentication and authorization vertical slice: password/TOTP login, protected server sessions, backend maker-checker authorization, Vietnamese login/TOTP screens, direct negative integration tests, and one real synthetic browser flow.
Preparation status: static intake artifacts written; runtime not approved or run.
Outcome status: implementation_not_run.

## Approval requested

Duke/Codex approval is requested for one bounded, sequential W2-02 execution wave in `F:\Codex\Projects\Pay Slip` only. Approval must cover every action below as a single feature verification wave; approval of one action does not authorize unrelated W3–W8 work.

1. Official package metadata lookup through the existing permitted Hermes provider transport only, limited to choosing exact non-prerelease compatible versions for an Argon2id implementation, a TOTP implementation, and `@playwright/test`/browser requirements. Record URLs, retrieval date, exact versions, package licenses/engines and selected route in the handoff. No other network access.
2. Exact npm install/write of only approved direct packages and their lockfile changes. Candidate package names are `argon2`, `otplib`, and `@playwright/test`; exact versions are intentionally pending official metadata. No upgrade of existing packages and no global install.
3. Create/modify only the frozen W2-02 ownership paths in `docs/planning/W2-02-auth-contract.md`, including one additive Prisma migration and generated Prisma client output if needed.
4. Start a fresh project-owned synthetic PostgreSQL cluster/database lifecycle using the previously approved local W2-01 tooling pattern. It may bind only `127.0.0.1:55432`, must never inspect/use ambient `DATABASE_URL`, `.env`, an existing database, real records, or non-project data, and must stop its exact owned database process before handoff.
5. Run the existing project-owned Windows CurrentUser DPAPI adapter solely with newly generated synthetic TOTP seed bytes. No existing secret, credential, token, cookie, account, or `.env` value may be read. No user/service account creation, scheduled task, registry/PATH change, or persistent service configuration.
6. Start a project-owned local Next server only for the synthetic Playwright authentication flow, bound only to `127.0.0.1:46217`; use an owned synthetic database URL and no tunnel/network exposure. Install approved Playwright browser binaries only if the selected official package requires it and record the exact command/effect.
7. Run focused RED/GREEN integration, browser, typecheck, lint, and build checks, then approved narrow regressions. Report every command/exit status/test count. Tests are permitted only with synthetic data.
8. Create a redacted runtime receipt and W2-02 handoff, inspect scoped status/diff, and stop/remove owned local server/database/browser processes and transient synthetic database target according to the cleanup plan. Do not commit, stage, push, create a worktree, mutate task-status, or change global configuration.

No Gmail/Zalo, tunnel, public listener, iPOS device, real employee data, real secrets, production database, backup/recovery, or external message is requested.

## Preconditions that must be checked before mutation

- Re-read `AGENTS.md`, the approved design/implementation plans, `docs/planning/task-status.json`, this preview, and `docs/planning/W2-02-auth-contract.md`.
- Confirm `PAY-W2-01` and `PAY-W7-01a` remain accepted at their recorded synthetic layers, and `PAY-W2-02` has no concurrent file writer.
- Confirm Git is clean except the three assigned untracked/intake documents: `PAY-W2-02-HERMES.json`, `PAY-W2-02-HERMES-prompt.md`, and the two Phase-A artifacts. Stop if unrelated changes appear.
- Recheck port 55432 and 46217 ownership before start. On conflict, report PID/executable/command line; never kill or repurpose another process and never silently select another port.
- Confirm all source/test paths to be changed are in the frozen ownership list and that no source needs private data or an unapproved dependency/version.

## Execution sequence and exact commands where known

Commands use the repository root. They are a preview, not commands executed in Phase A.

### A. Dependency selection and installation

Known current package baseline: Node engine `>=24 <25`, npm `11.4.2`, Next `16.3.3`, Prisma `7.10.0`, React `19.2.8`, TypeScript `6.0.3`. No direct Argon2id, TOTP, or Playwright dependency is declared.

Pending official metadata determines the `<argon2-version>`, `<totp-version>`, and `<playwright-version>` placeholders. Do not substitute guessed values.

```sh
npm install --workspace @pay-slip/web --save-exact argon2@<argon2-version> otplib@<totp-version>
npm install --save-dev --save-exact @playwright/test@<playwright-version>
```

If the selected Playwright route requires browser installation, the exact vendor-prescribed command will be placed here before execution, for example only after metadata confirmation:

```sh
npx playwright install chromium
```

That download/install is explicitly part of this requested approval, is limited to Chromium needed by `tests/e2e/auth.spec.ts`, and must not open a browser against non-local content.

### B. Database migration and synthetic test lifecycle

The W2-01 database harness was previously accepted only for `payslip_w2_01_synthetic`. W2-02 will use a separately named, fresh owned database (proposed `payslip_w2_02_auth_synthetic`) and a restricted application role. The migration will be additive: it must preserve existing W2-01 tables/constraints/privileges and add only auth state required by the contract. It must be applied by the migration/bootstrap role, never by the application role.

Known Prisma commands after local dependency availability:

```sh
node node_modules/prisma/build/index.js validate
node node_modules/prisma/build/index.js generate
node node_modules/prisma/build/index.js migrate deploy
npm run test:integration -- --run tests/integration/auth
```

The exact synthetic cluster init/start/role/database commands will reuse the accepted `scripts/windows/test-database.ps1` safety model or a narrowly modified project-owned version. It must pass only a newly generated temporary URL to owned child processes; it must not read an ambient database URL. RED runs must demonstrate missing behavior/schema, not a missing database/tool dependency.

### C. DPAPI, integration, server, and browser verification

The implementation uses `createWindowsDpapi({ projectRoot })` with a fixed public purpose for a newly generated synthetic seed. The application does not pass secret bytes via command arguments, URLs, logs, fixtures, test titles, browser pages, or saved receipts.

Known focused commands after implementation/configuration:

```sh
npm run test:integration -- --run tests/integration/auth/password-totp.spec.ts tests/integration/auth/session-csrf.spec.ts tests/integration/auth/authorization.spec.ts
npm run test:unit -- --run packages/payroll-domain/test packages/attendance-domain/test
npm run test:secrets
npm run test:secrets:identity
npm run typecheck
npm run lint
npm run build
npx playwright test tests/e2e/auth.spec.ts
```

The E2E command will run after a project-owned local server starts on `127.0.0.1:46217`, with an explicit Playwright `webServer` ownership/teardown configuration or documented equivalent. A successful run requires a nonzero discovered test count. Neither the existing `test:e2e` nor `test:integration` `--passWithNoTests` script can be cited as W2-02 evidence; required auth commands/configuration will remove that false-pass condition for this task.

The implementation must execute tests in this order:

1. focused auth RED tests;
2. migration/client generation against fresh synthetic target;
3. focused auth GREEN integration tests;
4. direct backend/authorization negative tests;
5. one real local Playwright owner/accountant password-to-TOTP flow plus protected route/session failure cases;
6. approved existing domain/secret regressions;
7. typecheck, lint, and build.

## Required direct test cases

- Valid synthetic owner and accountant must both complete password then TOTP; password-only state cannot use protected routes.
- Wrong/unknown password, expired/used MFA challenge, wrong/replayed TOTP, lockout/rate-limit, and malformed requests return generic safe failures and create no authenticated session.
- Concurrent replay of a valid TOTP time-step permits exactly one session, records exactly one consumption, and denies the other request.
- TOTP seed is stored only DPAPI-protected; tampered/wrong-purpose protection data fails closed. Test output proves no seed/code/plaintext is emitted.
- Token database storage is hashed; cookie is opaque and has explicit `HttpOnly`, `Secure`, `SameSite`, path, expiry/max-age attributes. Rotation invalidates the old session/token; expiry/revocation deny direct protected requests.
- Missing/invalid/cross-site CSRF requests fail closed before the protected command.
- Direct service/API authorization matrix tests prove accountant cannot approve attendance, approve/finalize payroll, or release payslips; stale owner MFA gets `FRESH_TOTP_REQUIRED`; fresh owner can pass authorization only when resource/state checks permit; kiosk principal gets no admin authority.
- Audit/error assertions prove passwords, TOTP values/seeds, raw session/cookie tokens, and CSRF tokens are absent.
- Playwright uses synthetic accounts only, submits Vietnamese login and TOTP screens, reaches a protected synthetic page/session endpoint, demonstrates invalid credentials/TOTP, logout or revoked-session failure, and proves no login/TOTP secret is retained in browser-visible storage.

## Security and implementation constraints

- Use Argon2id only after benchmark on this Windows host; record selected parameters, measured bounded synthetic result, and rationale. Do not call a static or unbenchmarked setting production-grade.
- Use server-side random opaque session/pending-MFA/CSRF values and store hashes where lookup is needed. Compare secret-derived values constant-time where appropriate.
- TOTP replay consumption, successful session creation/rotation, revocation of superseded session, and corresponding audit entries must be one transaction or fail together.
- Backend commands call a common authorization gate. Client-side hiding, route naming, user-supplied roles, or manually constructed actors cannot authorize state changes.
- Cookies are never emitted over a public endpoint in this wave. `Secure` is still explicitly set because the feature contract requires it; local browser test accommodation, if needed, must be a test-only trusted adapter with no production default weakening and must be documented/tested.
- Use Vietnamese-first generic safe copy. The UI must not disclose whether an email/account/TOTP factor exists. It must use labels, associated field errors, focusable controls, keyboard submission, loading and recovery states.
- No sensitive value can enter an audit event, log, exception message, test snapshot, browser screenshot, fixture, command argument, or handoff receipt.

## Limits

- One execution owner; no child agents, no delegation, no Atlas/fleet messaging, no fallback model route. Model route remains `gpt-5.6-terra-900k` / Forge / medium / openai-codex.
- Maximum 120 tool-calling turns and 90 minutes for the full approved wave; report at the 15-minute core checkpoint.
- Two attempts maximum at the same evidence layer. Freeze after two same-layer failures or one zero-evidence-delta attempt, research the root cause, and permit at most one architectural fallback that removes that failure class.
- Proposed resource ceilings: 30-minute database/server/browser active-runtime window; 1 GB downloaded artifacts total including browser; 3 GB additional project-local disk; 1 GB database RAM; no GPU; no port other than loopback 55432/46217; no external host except approved official metadata/browser package retrieval through the permitted provider route.
- Browser data profile, synthetic database, temporary DB logs, and child process environment remain project-owned/transient. Do not retain plaintext secrets, browser cookies, session tokens, TOTP seed/code, or temporary database credentials.

## Cleanup and rollback

- Preserve source, package-lock, reviewed migration, synthetic test code, and redacted runtime receipts only.
- On any exit path, stop exactly the project-owned Next server, Prisma/database helper, PostgreSQL cluster, Playwright/browser children, and DB pool. Verify 46217 and 55432 have no listener owned by this task; do not kill non-owned processes.
- Revoke/delete only W2-02 synthetic sessions, pending challenges, and temporary test database/role if their owning script has exact names and validates target ownership. No broad database drop, filesystem cleanup, reset, checkout, or node_modules deletion.
- Keep no TOTP seed/plaintext password/raw token/cookie/CSRF value in disk files, command history, logs, failure output, screenshots, or receipts.
- If install, migration, test, server, browser, or DPAPI behavior fails before product behavior evidence, preserve redacted diagnostics and stop according to the two-attempt rule; do not fabricate a pass or substitute static inspection.

## Completion handoff required for Codex

```json
{
  "agent_id": "hermes-forge-w2-02",
  "task_id": "PAY-W2-02",
  "status": "done|blocked|failed",
  "outcome_status": "implemented_and_syntheticly_verified|implementation_not_run|blocked",
  "preparation_status": "intake_complete|implemented_reviewed_verified|partial",
  "summary": "bounded result without production claim",
  "known": [],
  "inferred": [],
  "unknown": [],
  "evidence": {
    "red": "exact observed result",
    "green": "exact commands, test counts, exit codes",
    "database": "synthetic target/migration/client evidence",
    "dpapi": "synthetic-only evidence",
    "browser": "local synthetic Playwright evidence",
    "cleanup": "owned PID/listener evidence"
  },
  "files_read": [],
  "files_modified": [],
  "verification": [],
  "blocker": {"count": 0, "items": []},
  "next_action": "Codex independent scoped diff/evidence review and acceptance decision"
}
```

Codex must independently inspect the scoped diff, confirm every changed path is owned, rerun the focused security-critical checks allowed by the approved wave, verify process/listener cleanup, and reject any completion claim that substitutes static, empty-suite, synthetic, or UI-only evidence for a claimed layer.
