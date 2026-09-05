# W2-01 data contract — verified synthetic database scope

Owner: Codex parent. Scope: PostgreSQL schema and repositories for the already approved Pay Slip design. This contract is implemented and verified on a fresh synthetic PostgreSQL 18.6 database. See PAY-W2-01-handoff.json for the bounded claim ledger; production is not run.

## Core outcome and evidence
On a fresh synthetic local database, a valid employee/compensation/clock/snapshot/pay-run transaction succeeds; overlapping terms, repeated conflicting clock requests, changed finalized records and mismatched immutable bindings fail. Application writes and audit records commit or roll back together. Run real PostgreSQL integration tests using a restricted application role, not an in-memory substitute or migration-owner connection.

## Model inventory (36 required tables)
| Domain | Tables |
|---|---|
| Organization | organizations, workplaces, opening_hour_versions, public_holidays |
| People | employees, employment_contracts, compensation_terms, delivery_destinations |
| Attendance | schedule_templates, schedule_assignments, clock_events, attendance_exceptions, attendance_adjustments, attendance_snapshots |
| Rules | legal_rule_packs, rule_sources, minimum_wages, insurance_policies, pit_policies, earning_component_policies |
| Payroll | pay_runs, pay_run_employees, calculation_lines, approval_events, adjustment_links |
| Documents/delivery | payslips, document_artifacts, delivery_drafts, outbox_jobs, delivery_attempts |
| Operations | users, mfa_factors, sessions, audit_events, retention_actions, backup_runs |

Later feature workflows remain in their own tasks; this wave creates their schema foundations without implementing UI, authentication, PDF or sending.

## Representation and ownership
- IDs: explicit UUIDs for stored entities. Domain fixture IDs are mapped at application boundaries; never silently pass synthetic labels into UUID columns.
- Money: PostgreSQL BIGINT with non-negative checks where applicable; TypeScript bigint internally and decimal strings at API boundaries.
- UTC time: timestamptz(3), constrained to millisecond precision by repository input validation and migration checks; exact durations BIGINT. Business calendar remains Asia/Ho_Chi_Minh.
- Effective ranges: half-open [from,to), null upper endpoint means unbounded. Exclude overlap per organization/employee/policy-kind or other relevant key with btree_gist exclusions. Adjacent ranges are legal.
- Each mutable aggregate has an expected revision. Successful update increments once and appends its audit event in the same database transaction.
- Tenant/workplace/employee identity is enforced with scoped composite references where cross-binding could mix payroll or attendance.
- SQL parameters only. Repository interfaces accept a transaction capability, not arbitrary caller-supplied raw SQL.

## Required invariants and tests
| ID | Contract | Required direct test |
|---|---|---|
| DB01 | Effective compensation/contract/opening/schedule/policy/destination versions cannot overlap within their owning key. | Insert conflict fails; adjacent interval succeeds; two separate connections cannot both commit conflicting ranges. |
| DB02 | Raw clock events are append-only and scoped idempotent. | Same key/payload replays original event; changed payload conflicts; UPDATE/DELETE/TRUNCATE unavailable to app role. |
| DB03 | Approved attendance snapshots are immutable detached canonical payloads. | Update/delete denied; stored hash matches exact archived canonical bytes and identity bindings. |
| DB04 | Released rules require the prior signed/source-verified release contract. | Draft remains draft; test-only synthetic rule cannot be promoted or used as production authority. |
| DB05 | Finalized pay-run header, employee inputs and lines cannot be changed or extended. | UPDATE/DELETE and late child INSERT fail, including movement from one parent run to another. Lock parent during child mutation/finalization races. |
| DB06 | Snapshot/compensation/rule IDs must match their hashes and employee/workplace. | Mismatched hash, employee or workplace rejects; no caller-provided matching flag bypass. Preserve calculator artifact/version, canonicalization and schema versions. |
| DB07 | Pay-run revision and audit update are atomic. | Stale revision fails; injected error rolls back data and audit; successful transaction writes exactly one audit record. |
| DB08 | Finalization and outbox draft insertion share one transaction. | Rollback leaves neither a finalized run nor an orphan job; repeated idempotency key cannot enqueue duplicate jobs. No provider calls. |
| DB09 | Released documents/attempts/approval/audit records have appropriate append-only constraints. | Direct app-role update/delete denied; attempt history retained. Protected parent state prevents child addition or reassignment. |
| DB10 | Compensation and destination versions referenced by historical runs remain replayable. | Cannot mutate/delete an already referenced version; replace by a new version. |
| DB11 | App role cannot bypass triggers or schema protections. | No superuser, BYPASSRLS, schema ownership, CREATE, trigger disabling or TRUNCATE privilege. Migrations use separate bootstrap role only. |
| DB12 | Parent immutability cannot race with child modification. | Two independent PostgreSQL sessions test locking/serialization for finalize-vs-write. Static SQL inspection is insufficient. |

Hash design: do not recompute TypeScript canonical payloads using PostgreSQL jsonb textual output. Persist canonical UTF-8 text and an independently checked SHA-256; retain typed bindings as columns. Do not hash mutable database serialization and label it a domain hash.

## Evidence limits
Synthetic finalization is explicitly synthetic and cannot release production payroll. W4 owns full payroll orchestration; W3-03 owns authenticated approval. W2 proves schema/repository behavior only. None of these tests prove legal values, real-user authorization, kiosk, PDF, delivery, recovery or production readiness.

## Accepted storage boundary
The current migration also archives canonical_input/input_hash and canonical_result/result_hash with each pay_run_employee. All four are required and checked against exact UTF-8 bytes. Canonical artifacts are supplied by the trusted domain/application boundary; W4 owns complete calculator-to-storage reconciliation. Schema column agreement and a generated Prisma adapter read were tested directly. See ops/runbooks/database-migration.md for SQL-only constraint ownership, finite append-only versions and future production/forced-termination limitations.
