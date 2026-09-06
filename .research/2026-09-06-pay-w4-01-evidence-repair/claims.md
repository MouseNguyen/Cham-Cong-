# Claims

## Known

1. The packet limits runtime attempts to two per evidence layer. Source: src-001.
2. Red mode skipped every migration. Its failure on missing `legal_rule_packs` proves an empty-schema setup, not missing PAY-W4-01 behavior. Sources: src-002, src-006.
3. Four GREEN runs failed before two later GREEN runs passed 3/3 focused tests. Source: src-003.
4. Every recorded run reports the owned PostgreSQL listener and postmaster PID file absent after cleanup. Source: src-003.
5. The later focused passes are valid synthetic runtime evidence for the tested three cases, but they cannot retroactively satisfy behavior-specific RED or the two-attempt budget. Sources: src-001, src-003.
6. Full historical database regressions were not run, and the root typecheck did not independently include the new pay-run tests. Source: src-002.
7. The present focused fixtures cover one employee and supply a handcrafted calculation object. Source: src-009.
8. Run `red-ba7fc2fb-5d6c-464e-bc70-9ed7e16613d2` applied the seven pre-W4 migrations and failed all three focused tests at `INVALID_STATE_TRANSITION`; cleanup passed. The harness classifier, not the behavioral fingerprint, was wrong.

9. Root npm run typecheck passed after the parent reconciled the historical callers and Prisma schema.
10. Run green-5fa2eb25-9919-4dd1-acee-eed50bd4e451 failed 7/7 before business assertions because FOR UPDATE OF attendance_snapshots required the intentionally revoked table UPDATE privilege; cleanup passed.
11. Run green-78b3127a-d045-4c3b-b210-996fa09c9779 proved the privilege failure removed and passed the draft-pack rejection, then failed the other six tests at raw JSON.stringify(line) on W1 bigint fields; cleanup passed.
12. W1's authoritative canonicalize serializer converts bigint to decimal strings and sorts object keys; W4 now uses it for calculation-line trace persistence.
13. Final run green-c1814385-e0dd-471d-81b0-239e4842a7e0 passed all 7 focused W4 tests with cleanup.
14. Final regressions passed 42 payroll, 16 database, 22 employee, and 27 combined database/delivery tests; after overlap removal the verified total is 98 distinct tests.
15. Root typecheck, zero-warning lint, optimized production build, source-seal rehash, diff check, and independent port-55432 listener absence passed.
16. Final independent static review reports zero remaining P0/P1 blockers and found no product defect masked by the canonical JSON, replay, or removed obsolete helper-only assertion corrections.

## Inferred

1. A valid RED can be produced deterministically by creating a fresh database from all pre-W4 migrations and then running the W4-focused tests before applying the W4 migration. This changes the causal hypothesis from “schema absent” to “baseline lacks the W4 contract.”
2. Independent review confirmed nine P1 product/static blockers across calculation trust, authentication/read authorization, multi-employee operation, outbox uniqueness/finalization invariants, schema synchronization, compatibility regressions, and the weakened W2 guard.
3. The failure family includes both process/evidence integrity and confirmed product/static defects; neither later focused pass removes these blockers.

## Unknown

1. Production behavior with real employees, signed legal rules, provider delivery, and deployment.
2. Part-time payroll and combined holiday-plus-night behavior, which remain outside W4 scope.

## Claim boundary

Outcome status is **accepted_synthetic_only** with zero local W4 blockers. Preparation and approved local runtime verification are complete. Production is **not run** and retains five release-blocker groups.
