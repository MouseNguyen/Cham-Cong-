# Recommended actions

## Terminal outcome

A production-eligible, auditable internal Vietnam payroll/payslip application for one named employer and one explicitly approved 2026 employee population, whose results reproduce signed independent cases and whose finalized records cannot silently change.

## Runnable core outcome

One named internal company, one workplace, and two end-to-end vertical slices using the supplied 12-month contracts: (1) one full-time Vietnamese tax-resident employee paid a configured monthly salary and (2) one part-time Vietnamese tax-resident employee paid a configured hourly rate for approved actual hours. Current business values are approximately VND 7-8 million/month for full-time staff and VND 26,000/hour for part-time staff, entered when the employee is added. Both include the six-day probation inside the labour contract, with the same contractual salary/rate before and after probation. Each slice begins with employee-code-and-PIN clocking on the shared iPOS browser tab, schedule/holiday classification, accountant-drafted exception classifications, and owner approval, then covers one 2026 pay period, ordinary wage, daytime holiday overtime, separate insurance funds, resident PIT, employer cost, payroll approval, and one verified Vietnamese A4 payslip with itemized deduction explanations. Personal-phone rotating-QR clocking remains optional later polish.

## Must-pass gates for the core

1. Product scope and exclusions are accepted, including a hard block for unsupported workers.
2. The accountant validates the payroll cases, and one independent external specialist competent in Vietnamese labour law and payroll tax signs the exact rule matrix, source versions, and golden cases before real payroll use.
3. The pure engine passes signed golden examples and boundary/property tests.
4. Finalization freezes inputs, calculation code version, rule-pack hash, output trace, and payslip hash.
5. Unauthorized users cannot read, approve, finalize, generate, or deliver payroll artifacts.
6. Two synthetic employees cannot receive each other’s payslip in batch generation or delivery tests.
7. Encrypted backup to the separate physical `G:` drive, restore, and historical reproduction are demonstrated before production with real payroll data; offsite/cloud replication is deferred but remains a visible resilience gap.
8. Two parallel payroll cycles have zero unexplained variance before production use.
9. The part-time slice evaluates BHXH, BHYT, and BHTN eligibility for each month from the actual monthly wage and the effective statutory threshold; from 1 July 2026 the relevant minimum BHXH basis/reference amount is VND 2,530,000 per month.
10. Payroll cannot finalize while any employee has missing clock events, unresolved attendance exceptions, overlapping shifts, unapproved edits, or unclassified public-holiday hours.
11. Compensation terms are effective-dated and validated against the workplace's legal minimum for the earning period. At the confirmed Region I site from 1 January 2026, the monthly floor is VND 5,310,000 and the hourly floor is VND 25,500; future rule changes must not require code edits or mutate historical payroll.

## Recommended architecture changes

- Keep the modular monolith and PostgreSQL; do not split microservices for MVP.
- Add a dedicated attendance module inside the modular monolith. Preserve raw clock events separately from approved work segments; never overwrite the original event when correcting time.
- Keep the home payroll UI and database private. Do not use router port-forwarding or place a home IP/address in a QR. Because the iPOS device is browser-only and cannot use a private-network client, expose an isolated HTTPS attendance ingress that can accept only attendance events, never general payroll access. The ingress must be separately authenticated, rate-limited, revocable, and auditable.
- Use the installed `cloudflared` executable for the temporary pilot only after the attendance ingress exists and passes local tests. Bind the application to loopback, tunnel only the attendance route, treat the generated URL as temporary, and record explicit start/stop plus listener/tunnel cleanup evidence. Do not confuse the running Cloudflare WARP client with an active Cloudflare Tunnel. Production promotion requires a named tunnel, an owner-controlled domain, stable service supervision, access/error monitoring, and a fresh security review.
- Treat a QR as an opaque employee/challenge identifier only. Bind each event to an approved shop device, event time, action (`clock_in`/`clock_out`), and replay-resistant request identifier; require a second factor or approval control appropriate to the selected capture model.
- Implement the core kiosk interaction first: employee enters an opaque employee code and six-digit PIN on the iPOS browser tab, then explicitly selects `clock_in` or `clock_out` and receives a timestamped success/failure result. Do not display salary, contract, tax, insurance, other employees' status, or payroll data on this surface.
- Treat personal-phone QR clocking as optional polish after the kiosk flow passes. The iPOS page may display a single-use, short-lived rotating challenge; scanning it must never authenticate the employee by itself, and the phone route must call the same attendance service, validation, idempotency, and audit path as the kiosk.
- For an unregistered phone, require employee code + PIN after the QR scan on every attempt. For an owner-approved remembered phone, issue a rotating revocable session token in a `Secure`, `HttpOnly`, `SameSite` cookie, store only its hash server-side, bind it to one employee, and require the live shop QR challenge for every clock event. Provide owner-visible device/session inventory and immediate revoke; never use device fingerprinting as identity.
- Do not collect employee photos, facial recognition data, or GPS for attendance. Compensate with bounded PIN attempts, device/session approval, short-lived single-use challenges, duplicate/replay/impossible-sequence detection, schedule/out-of-hours flags, raw-event immutability, and human approval before payroll consumes time.
- Keep attendance online-only. A client timeout, tunnel failure, home-server outage, or ambiguous response must display `not recorded` and must not create a local success state. Use idempotency so a retry cannot duplicate an event. Manual correction requires claimed event time, reason, creator, creation time, original failure context when available, and owner approval; never rewrite a raw event.
- Add a small scheduling module, not a full HR suite: reusable weekly employee shifts, effective dates, one-day overrides, and explicit public-holiday shifts. Preserve historical schedule versions and compare them with actual attendance to produce review flags; a schedule never proves attendance and never silently authorizes overtime.
- Preserve exact excess time outside a published shift as an attendance exception. The accountant may draft a segment classification, but only the owner can approve it as ordinary payable time, overtime/public-holiday time, or rejected/non-work time. Payroll must remain blocked while any such segment is unresolved.
- Exclude employee self-service leave requests and shift swaps from MVP. The accountant may draft schedule changes and the owner approves/publishes them; published historical schedules are corrected by versioned replacement, not overwritten.
- Model rest windows separately from deductible time. For this employer, every rest break is paid: require no break punches and subtract zero break minutes from payable attendance. A future unpaid-break policy would be a new effective-dated rule requiring separate approval and tests; it must not be enabled by a generic setting change.
- Reuse the existing Android iPOS device as the shop kiosk, with iPOS remaining in its app and attendance kept in a separate browser tab. The release check must cover exact browser version, HTTPS/JavaScript/cookie support, camera or 2D-scanner availability, tab restoration after Android memory pressure/restart, local storage persistence, clock accuracy, and reconnect behavior. No application or VPN installation on the iPOS device belongs in the implementation plan.
- Make payroll consume only an immutable attendance-period approval snapshot. Later attendance corrections create an adjustment/reopened approval path rather than silently changing a finalized pay run.
- Treat opening hours and planned rosters as validation context, never as proof that an employee actually worked. Flag missing clock-out, duplicate/overlapping events, out-of-hours work, public-holiday work, and any 22:00-06:00 time for review.
- Separate a deterministic `payroll-domain` package from Next.js, Prisma, PDF, email, and storage adapters.
- Use typed policy modules plus signed lookup tables instead of a general-purpose expression/rules engine.
- Add a `pay_components` legal-classification table with independent flags/rules for wage, PIT, SI, HI, UI, union funding, overtime base, and accounting.
- For this MVP, make `withholding_method` an explicit decision (`progressive` or `blocked`) independent of insurance participation. Keep the short/no-contract 10% method outside the normal workflow unless scope is later expanded and separately reviewed.
- For this MVP, allow only the supplied 12-month full-time and part-time contract profiles. Any missing, separate-probation, under-three-month, or materially different contract is `blocked`; do not expose the short-contract 10% lane in the normal UI.
- Keep `employment_time_form` (`full_time`/`part_time`) independent from `contract_term` and from each insurance-fund eligibility decision.
- Add effective-dated compensation terms rather than permanent scalar fields on the employee record. A full-time term uses `monthly_salary_vnd`; a part-time term uses `hourly_rate_vnd`. Require exactly one field according to the selected wage basis, preserve the previous term on changes, and bind each pay-run line to the exact term version used.
- Validate each compensation term against the effective regional minimum for the employee's workplace and earning period. Treat VND 7-8 million/month and VND 26,000/hour as current employee inputs, not hard-coded product defaults; warn before saving and block an amount below the effective legal floor.
- Fix `compensation_basis = gross` for MVP. Label every salary/rate input as gross before employee-side insurance and PIT; calculate gross earnings from the effective base/rate plus classified pay components, then list each employee deduction and derive net pay. Do not offer net-salary gross-up or a per-employee gross/net switch.
- Store probation start/end as metadata inside the active labour contract. The payroll engine must not change salary, PIT method, or insurance participation merely because probation ends.
- Re-evaluate part-time insurance eligibility per pay month; never model “part-time = exempt”. Version the minimum reference amount so the 1 July 2026 change to VND 2,530,000 is reproducible.
- Resolve policy with `earning_period`, `payment_date`, `tax_period`, and `adjustment_of_pay_run_id`; persist the resolution trace.
- Use exact decimal arithmetic internally, store VND as integer after a named rounding boundary, and prohibit binary floating point.
- Make finalized snapshots append-only. Corrections are linked adjustment runs, never edits.
- Email delivery is required. Store the employee email with verification status and effective history; changing it invalidates any pending delivery draft.
- Bind every delivery draft to exactly one finalized payslip ID, one employee ID, one recipient address, one pay period, and the PDF hash. The confirmation screen must show those values before sending.
- Enforce one message/one recipient with no CC/BCC, no salary in the subject or body, an idempotency key, bounded retries, and an immutable provider/local send receipt. A failed send must never fall through to another employee.
- Attach the finalized payslip PDF directly to the email. The MVP does not need an employee download portal or externally reachable signed links.
- Record the exact attachment filename, MIME type, byte size, SHA-256 hash, employee binding, recipient address, and provider message ID/local failure receipt for every send attempt.
- Keep outbound email credentials outside source control and payroll records. Store Gmail OAuth client material and refresh tokens using Windows-backed encryption with access limited to the service identity.
- Implement delivery behind one stable outbox contract with separate `gmail` and `zalo_oa` adapters. Calculation and PDF generation must not depend on either channel being available.
- Use the company's current free `@gmail.com` account through Gmail API OAuth 2.0; never save the normal Gmail password in the payroll database. During development use a fake/test outbox. At the real-integration gate, enable 2-Step Verification, configure the OAuth project and consent, authorize only the required Gmail sending scope, verify send and revocation behavior, and store the refresh token with Windows-backed encryption.
- Automated Zalo delivery is permitted only through a verified Zalo Official Account and an officially supported OA/OpenAPI message route. Do not automate a personal Zalo account, browser session, cookie, or desktop client.
- For the current personal-Zalo period, provide a manual handoff mode: generate the employee-bound PDF, show the intended Zalo recipient and pay period, copy a neutral message, and locate the exact file for the authorized operator to attach manually. Store no personal-Zalo password, cookie, or session.
- Label manual delivery as `operator_confirmed_manual`, not `delivered`; record operator, time, employee, destination descriptor, payslip hash, and optional note. Only OA provider receipts may promote an automated attempt to provider-accepted/delivered states.
- Make the Zalo adapter an administrative configuration (`zalo_manual` now, `zalo_oa` later). Switching adapters must not rewrite employee preferences, finalized payslips, or historical delivery receipts.
- Before enabling Zalo for a real employee, prove recipient identity/consent or interaction eligibility, file-message support and size limits for the selected message type, OA package/quota, Vietnamese filename/text handling, idempotency, and delivery/failure receipts.
- Give each employee an effective-dated delivery preference (`email`, `zalo`, or `both`) and channel-specific verified destination. A failure on one channel must not silently trigger the other channel unless the authorized user previews and confirms that exact fallback.
- Add a record-class retention ledger, deletion workflow, legal hold, data export/access correction process, and vendor/subprocessor inventory.
- Write independently encrypted, versioned automated database/document backups only under the dedicated future directory `G:\PaySlip-Backups`; never write into or reorganize existing `G:` folders. Record success/failure and hashes, retain multiple restore points, alert on unavailable/low-space target, and run an independent restore test before real payroll data. Generate the portable recovery secret only at the approved setup gate, show it once for a sealed paper copy stored away from the PC and `G:`, and optionally copy it to a password manager; never persist it in source control, logs, the database, or the backup set. Keep the backup target behind an adapter so cloud storage can be added later without changing payroll records. Record that local external-disk backup does not provide offsite disaster recovery.
- Provide read-only diagnostic actions first (`explainCalculation`, `showRuleSources`, `comparePayRun`, `showDeliveryReceipt`). Consequential actions (`finalizePayRun`, `releasePayslips`) require normal authorization and explicit human confirmation and must use the same service path as the UI.
- Keep statutory tax/insurance submission, accounting export, bank-payment files, and automatic money movement outside MVP; the UI must label this boundary plainly.

## Runtime decision

Runtime choice approved by the owner: `no container` for the Windows-native MVP, including the application, pure payroll engine, PostgreSQL-backed outbox, and local protected document storage. Docker remains only a possible later packaging option after a demonstrated operational need; it is not an MVP dependency.

Reason: the product needs PostgreSQL, server PDF generation, queues, and object storage, so Docker may help integrated environments, but it should not delay the first deterministic core or become an unexamined production substrate.

Safety: any future container work needs localhost-bound development ports, narrow mounts, no secrets in images, pinned critical versions, backup/restore ownership, and a cleanup ledger.

## Proposed delivery waves after questions are answered

1. Scope, attendance-capture decision, and legal decision record.
2. Signed rule/component matrices and golden cases.
3. Attendance capture, exception handling, and immutable period approval for one employee.
4. Deterministic payroll core vertical slice consuming the approved attendance snapshot, with CLI/test harness.
5. Persistent pay-run model and immutable finalization.
6. Minimal maker-checker web workflow and calculation explanation.
7. Payslip render/download with visual and content verification.
8. Add the part-time hourly slice, including months below, exactly at, and above the applicable insurance threshold; then expand time/component cases within the approved scope.
9. Privacy, authorization, audit, retention, backup/restore, and delivery hardening.
10. Staging pilot with synthetic data, then two real parallel cycles under approval.

All U01-U05 product-design questions are resolved. Architecture option A and detailed-design sections 1-6 are owner-approved, including system/data boundaries, attendance, deterministic payroll, delivery/security, Windows operations, backup/restore, tests, and release GO/NO-GO. The consolidated design specification and task-by-task TDD plan now live under `docs/superpowers/plans/`; simple-premium UX and Codex/Hermes evidence contracts are release requirements. The next action is owner selection of the first execution route and explicit approval of W0 package metadata queries, exact installs, tests, and one local build. Do not start implementation, install packages, run builds/tests, start services, configure credentials, or create tunnels before that gate.
