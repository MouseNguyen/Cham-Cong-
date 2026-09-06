> Resolution: Duke explicitly approved this exact consolidated wave on2026-09-06. Executed synthetic results are in PAY-W2-02-parent-acceptance.json. The proposal and initial automatic-review rejection below are preserved as history, not current approval state.

# W2-02 full Hermes implementation — exact approval request

Status: PROPOSED, NOT AUTHORIZED, NOT EXECUTED. Automatic approval review rejected interpreting the previous general continuation as authorization for the gated runtime wave. This document grants no authority. Explicit Duke approval is required before runtime or product mutation.

Outcome: Complete the existing PAY-W2-02 Authentication work package in one cohesive Hermes Forge job: password/Argon2id and TOTP login, rotating/revocable database sessions, backend owner/accountant/kiosk authorization boundary, Vietnamese login/TOTP screens, direct negative tests, real synthetic browser flow and independent Codex verification. Existing source contract: docs/planning/W2-02-auth-contract.md. Codex owns final acceptance/commit; no push.

Worker: existing Forge profile, gpt-5.6-terra-900k / medium / openai-codex. Continue task session 20260906_113852_022cf9 in F:\Codex\Projects\Pay Slip. One writer, no children, no fleet dispatcher, no model fallback. Up to 120 tool turns / 90 minutes, a 15-minute checkpoint; stop after bounded evidence-based recovery fails.

Requested effects, approved together only if Duke confirms:

1. Official npm metadata/maintainer documentation lookup for argon2, otplib and @playwright/test. Resolve compatible stable exact versions, record them locally BEFORE installing, then npm install with --save-exact for only those direct dependencies and required transitives. Preserve current direct dependency versions. Registry/official prebuilt assets/Playwright Chromium CDN only; no unrelated networking. No global install.
2. Implement only the complete auth ownership set in W2-02-auth-contract.md. Additional task-support paths: scripts/windows/test-auth.ps1, ops/evidence/PAY-W2-02-dependencies.json, docs/agent-packets/PAY-W2-02-HERMES-progress.json. One additive auth migration: prisma/migrations/202609060001_w2_02_auth/migration.sql. Generated Prisma files only through generation. No unrelated app features.
3. Use project-owned PostgreSQL18.6 binaries to initialize a fresh disposable W2-02 synthetic cluster/database, bind only 127.0.0.1:55432, generate credentials in memory, complete Prisma validate/generate/migrate deploy against that target. Never use ambient DATABASE_URL, .env, an existing database or real records.
4. Use the existing CurrentUser DPAPI adapter with newly generated synthetic TOTP seeds; bounded Argon2id benchmark on this host. No existing secrets/credentials, new account, scheduled task, registry or service changes. Do not rerun test:secrets:identity.
5. Run genuine auth RED/GREEN integration through the owned synthetic harness using installed Vitest, with nonzero discovery and no passWithNoTests. Run domain/database/delivery/current-user-secret regressions relevant to changed shared contracts, npm run typecheck, npm run lint and npm run build. No unrelated broad tests.
6. Install only Chromium needed for the installed Playwright version, in .tools/playwright under this project. Start owned Next on 127.0.0.1:46217 and run the installed Playwright CLI against tests/e2e/auth.spec.ts. Browser targets remain local. Exercise actual login/TOTP routes, secure cookies, denial paths and revocation. No fake-only replacement for browser evidence; disable secret-bearing trace/video/screenshots.
7. Write redacted evidence/handoff, then Codex independently reviews the real diff and reruns focused high-risk checks under this same approved scope. Hermes never stages/commits/pushes. Codex may commit explicit verified paths under the standing project commit rule; never push.

Resources: 90 minutes maximum worker wave, up to 30 minutes active DB/server/browser verification, at most 1GB downloads and 3GB additional project disk, DB RAM budget1GB, no GPU. Model uses existing configured account quota within the 120-turn limit; no other paid API. Package/native-install scripts may execute only as needed for the named dependencies. Stop for a material scope/resource/provider change.

Cleanup: verify target paths before deleting only task-owned transient data under .tmp/PAY-W2-02. Stop exact owned Next/PostgreSQL/browser process trees in finally and verify no owned listeners on 46217/55432; never kill an unrelated listener. Keep source, pinned lockfile, migration, tests, browser cache and redacted receipts. No persistent server/service/tunnel; no plaintext password, TOTP seed, cookie or database credential on disk/logs. Synthetic password/code input in the intended browser forms is allowed, without recording those values.

Corrections to the prior runtime preview: dependency networking is actual npm/official vendor access, separate from model transport; required test commands must fail for empty suites; Windows scheduled identity tests are excluded; initial untracked documents numbered four, not three. This approval draft does not change historical receipts or global policy.

Not included: real employee/payroll records, existing secrets or cookies, Gmail/Zalo, iPOS, public/LAN exposure, Cloudflare, production migration, backup/recovery, global configuration, fleet repair, extra workers, unrelated features or push.

Until explicit approval: Hermes remains stopped after intake. Do not represent this draft as an executed or approved packet.
