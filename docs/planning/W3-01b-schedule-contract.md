# W3-01b Schedule Backend Contract

## Evidence status

Accepted at the synthetic backend layer after parent integration. Eight schedule database tests and 185 regression tests passed (193 total); lint, typecheck, build, five migrations and the 50-model schema comparison passed. Production, new schedule UI, public ingress, worked/payable time and payroll approval are not claimed.

## Schedule data

- Shop timezone/calendar: `Asia/Ho_Chi_Minh`; commands accept only `YYYY-MM-DD` shop-local calendar dates. The stored effective instant is the start of that local date.
- Default opening hours are explicit: Monday closed; Tuesday through Friday 15:00–21:00; Saturday and Sunday 11:00–21:00.
- Local intervals are half-open `[start, end)`, must be positive, cannot overlap, and contiguous intervals normalize into one interval.
- A later Tuesday through Friday 11:00–21:00 opening change is a new opening-hours version. The earlier immutable source row is closed through an append-only closure row.
- An employee weekly assignment creates an immutable schedule template and immutable assignment. A future replacement uses an append-only assignment closure plus new template/assignment.
- A date exception wins over a public-holiday exception; a public-holiday exception wins over the weekly assignment; otherwise the weekly assignment applies. Holiday overrides require an existing `public_holidays` record for the exact local date.
- Exception correction creates an immutable replacement and append-only supersession link. It cannot overwrite the prior exception.

## Trusted commands and query

`SchedulesRepository` uses the accepted session, CSRF, active-user/session, organization, and role path before its transaction. `SCHEDULE_MANAGE` and `SCHEDULE_READ` are explicit authorization commands available to owner/accountant after current session, role and CSRF checks, with the same MFA policy as existing draft-maintenance commands. Kiosk actors are denied.

All writes require an explicit expected current version/assignment/exception identifier. Mismatches fail closed with `STALE_SCHEDULE_VERSION` or `STALE_SCHEDULE_EXCEPTION`. Cross-workplace, cross-organization, missing, and inactive employee accesses fail closed. Each successful write inserts its audit event within the transaction.

The effective query returns only opening context, employee schedule context, holiday status, and source precedence. It deliberately has no worked-duration, payable-duration, attendance approval, break deduction, rounding, raw clock-event, snapshot, or pay fields.

## History and scope boundaries

The additive migration preserves source rows and prior snapshots. It creates no attendance, adjustment, payable segment, approval, deduction, or payroll record. It does not modify old migrations. Past calendar dates are rejected for new schedule changes and exceptions so a command cannot rewrite prior schedule context by retroactive replacement.

## Verification contract

Pure focused coverage verifies the default pattern, canonical hash/order behavior, invalid/overlap rejection, local-date validation, exception precedence, and the absence of work/pay fields.

The synthetic PostgreSQL integration suite is written to verify opening/assignment effective history, immutable closure records, exception precedence, stale-version denial, cross-workplace denial, holiday existence gating, audit inserts, and no implied payable duration. It passed parent execution with `powershell -NoProfile -File scripts/windows/test-schedules.ps1`.

Parent integration retained immutable-history UPDATE denial. Commands and closure validators serialize through mutable workplace/employee aggregate locks; logical range guards replace the two physical exclusions that cannot see closure rows. PostgreSQL date columns are read as ISO text so host-local date parsing cannot shift holidays/exceptions. Concurrent saves, failed-write rollback, stale exception revisions, CSRF/tenant/inactive/revoked access, unchanged raw milliseconds and unchanged approved snapshot payloads were directly tested.

Hermes Forge session `20260906_134406_7083de` exited successfully. Parent acceptance and source hashes are in `docs/agent-packets/PAY-W3-01b-parent-acceptance.json`; runtime and regression receipts are in `ops/evidence/PAY-W3-01b-*.json`. Historical harness receipts retain current regression runs with explicit provenance. All owned test/worker processes stopped and checked listeners are absent. Synthetic temporary clusters remain under `.tmp`; no deletion, installation, real record/message or production write was performed.
