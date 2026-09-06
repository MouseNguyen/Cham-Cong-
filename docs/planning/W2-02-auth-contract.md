# W2-02 authentication — accepted synthetic implementation

Outcome: owner and accountant password/TOTP login, server sessions and backend permissions passed the approved synthetic database and Chromium checks. Parent acceptance: `docs/agent-packets/PAY-W2-02-parent-acceptance.json`. Production remains not run.

Hermes Forge received the entire W2-02 job in session `20260906_113852_022cf9`. Its historical handoff records its partial work and terminal-policy stop. Codex parent completed integration and verification directly under Duke's explicit consolidated approval; Hermes is stopped.

## Implemented boundary

- The server resolves active users and enabled factors within its configured organization. A password creates only a five-minute pending MFA challenge.
- Argon2id: 19,456 KiB, two passes, one lane; encoded algorithm/work-factor and target-host timings are in `ops/evidence/PAY-W2-02-argon2.json`.
- Each factor is CurrentUser DPAPI ciphertext under purpose `pay-slip/totp/v1`. TOTP uses six digits, 30-second periods and zero adjacent-step tolerance. The authenticator and host clocks must agree. Successful steps are atomically consumed, including concurrent requests.
- Five failed attempts lock the account for 15 minutes across pending challenges. The loopback administration surface also shares an organization-level request budget that blocks at 40 authentication requests per 15-minute window. No untrusted forwarded IP becomes a bypass.
- Sessions last eight hours. Login and step-up rotate tokens and revoke previous sessions. Logout, disabled users/factors and expiry invalidate access. Only token/CSRF hashes are stored; cookies are HttpOnly, Secure, SameSite=Strict and Path=/.
- Unsafe requests require the exact configured Origin and actual Host. Next 16.3.3 normalizes a loopback NextRequest URL to localhost; the internal URL is therefore not the authoritative incoming Host. Authenticated mutations additionally require the session-bound CSRF token.
- Owner privileged commands require MFA age at most ten minutes. Accountant can draft payroll/attendance; approval, finalization and release are denied. Kiosk has only the future clock-event permission and cannot use admin commands. Cross-organization and unknown commands fail closed.
- `authorizeCommand` loads the trusted Actor and audits permission decisions before returning it. Audit rows contain an event/correlation ID, organization, trusted actor, allowlisted action, outcome, time and hashed account/resource reference. They are append-only and omit authentication payloads.
- `/api/auth/authorize` proves the common permission boundary; it does not implement or execute future payroll/attendance business commands. Future commands must call the trusted boundary and enforce their resource/state invariants as part of their transaction.
- Vietnamese login and TOTP screens use semantic labels, keyboard submission, loading states and generic errors. Auth cookies are never JavaScript-readable or stored in browser storage.

## Operator configuration and verification

Trusted startup supplies `PAYSLIP_AUTH_DATABASE_URL`, `PAYSLIP_ORGANIZATION_ID`, absolute `PAYSLIP_PROJECT_ROOT` and exact `PAYSLIP_ADMIN_ORIGIN`. Runtime initialization is lazy and fails closed with a generic 503 if configuration is absent. The auth module does not discover ambient DATABASE_URL or read .env files.

The approved harness generates disposable database credentials, synthetic owner/accountant identities and fresh DPAPI-protected factors in memory. It creates no enduring usable account. Use the existing installed dependencies and project-local PostgreSQL/Chromium:

- `npm run test:auth`: fresh PostgreSQL 18.6 on 127.0.0.1:55432, migration and nonempty auth tests.
- `npm run test:auth:browser` or `npm run test:e2e`: the same tests plus actual Next/Chromium on 127.0.0.1:46217. The runner owns and stops its process tree and verifies port release.
- `npm run build`, `npm run lint`, `npm run typecheck`: approved local compilation/static checks.

These are reproducibility instructions, not continuing authorization for future runtime waves. Real enrollment, production credentials/data, public/LAN serving, TLS deployment, recovery, delivery providers and iPOS remain outside this task. Secure-cookie evidence here uses Chromium's loopback behavior; remote delivery requires separately verified HTTPS. Production server execution was not tested.

## Evidence and remaining product work

Final evidence: 47 auth tests, three actual Chromium flows, 27 database/delivery tests, and 70 domain/architecture/CurrentUser DPAPI regressions passed. Build, lint and typecheck passed. Database comparison covers all 42 declared models and every column/type/nullability, including the four new auth tables. Cleanup is recorded separately.

The dependency install reported four high-severity findings. This wave did not investigate or remediate the broader dependency audit; no production security clearance is claimed. No independent additional reviewer agent was spawned; Codex parent inspected the worker output, completed code, reviewed source and ran direct verification.

W2-03 employee contracts/destinations is the next dependent product task. Broader admin UI, actual payroll commands, real onboarding/recovery and the five release blocker groups in task-status.json remain outside W2-02 acceptance. Visual refinements beyond the verified login flow stay in the UI backlog.
