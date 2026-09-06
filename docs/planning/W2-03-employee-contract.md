# W2-03 employee backend acceptance

Accepted scope: synthetic authenticated employee commands and queries. This is a backend increment; employee screens and public onboarding remain downstream work.

Owner and accountant can create Vietnamese-resident synthetic employees, add full-time or part-time twelve-month contracts with six-day probation metadata, change effective compensation, and manage synthetic email verification. Deactivation requires an owner with fresh MFA. Every command checks the current database session, organization, role and CSRF before transactional changes and audit insertion.

Money uses integer VND strings and database bigint. Contract basis must match compensation basis. Minimum amounts are versioned synthetic 2026 Region I fixtures (monthly 5,310,000; hourly 25,500); unsupported populations, templates and future minimum-policy years fail closed. These fixtures do not constitute signed legal or production approval.

Compensation and email destination changes append closure rows and new versions. Existing physical source payloads, hashes and finalized payroll references remain unchanged. Database guards reject logical overlap and edits to closed history. Compensation consumers must use the closure-aware repository: valid_to is the effective end and source_valid_to preserves the original stored end. Boundaries use half-open intervals and Vietnamese calendar dates.

Email destinations are restricted to example.invalid. A six-digit verification challenge expires after ten minutes and permits five failed attempts. Verification rows store a salted code hash; the outbox stores CurrentUser DPAPI ciphertext with a fixed purpose. The fake dispatcher decrypts only in memory, sends a neutral Vietnamese verification body to the in-memory fake adapter, and clears plaintext buffers. Concurrent verification permits one success; retries reconcile through the existing bounded outbox state machine. Fake acceptance is not real email delivery.

Changing a destination invalidates pending delivery drafts, verification challenges and dispatches. Deactivation additionally revokes employee access grants and linked user sessions, disables those users, and denies subsequent clock-event insertion. Historical contracts and payroll remain. Public kiosk enrollment and enforcement are separate W3 work.

Verification: 22 employee integration tests, 27 database/delivery regressions, 59 authentication tests, and 64 domain/architecture tests passed (172 distinct tests). Build, lint and typecheck passed. The new migration and Prisma schema were checked against all 46 models and their columns, types and nullability. Focused RED tests exposed mutable closed history and unsupported legacy profiles before both repairs passed.

Reproduction uses existing installed dependencies and an approved synthetic runtime:

- powershell -NoProfile -File scripts/windows/test-employees.ps1
- powershell -NoProfile -File scripts/windows/test-database.ps1 -Mode Green -TaskId PAY-W6-02a
- powershell -NoProfile -File scripts/windows/test-auth.ps1
- node node_modules/vitest/vitest.mjs run packages tests/architecture --maxWorkers=1 --no-file-parallelism
- npm run build
- npm run lint
- npm run typecheck

Receipts are in ops/evidence/PAY-W2-03-*.json and the parent acceptance packet. Original harness receipt files retain the newly appended regression runs; the W2-03 regression report identifies their provenance. PostgreSQL processes and checked listeners were absent after execution. Temporary synthetic cluster files remain in .tmp after automatic approval review rejected recursive deletion and historical receipt restoration. No restoration, deletion, install, network call, real message, real employee ingestion, production migration or push was performed.

Next implementation dependency: W3-01b effective-dated schedule commands. Employee UI belongs to W5. Production remains not run with the five existing release blocker groups in task-status.json.
