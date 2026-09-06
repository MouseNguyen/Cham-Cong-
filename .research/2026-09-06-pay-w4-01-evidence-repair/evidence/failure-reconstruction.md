# Failure reconstruction

| Sequence | Run | Direct result | Evidence delta | Classification |
|---:|---|---|---|---|
| 1 | red-c395078b-45d8-45a1-91e4-2112329ef164 | Missing `legal_rule_packs` relation; 0 tests passed | Proved Red mode had no migrated baseline | Invalid behavior-specific RED |
| 2 | green-f044bf97-e0eb-4128-8079-1a88d43ef5e1 | PostgreSQL rejected subquery in CHECK | Identified invalid migration SQL | GREEN failure 1 |
| 3 | green-f1dbaa66-e928-42f9-bcef-2108bb3fcc30 | App role denied `legal_rule_packs` read | Identified privilege mismatch | GREEN failure 2; attempt ceiling reached |
| 4 | green-ac0aaf53-9e87-4cda-b959-e6f51139c663 | Legacy status CHECK rejected `calculated` | Identified incomplete constraint replacement | Over-budget GREEN failure 3 |
| 5 | green-7099d02d-aadf-496e-9c6e-3e4dbfabf3a8 | Test expected stale version; implementation returned invalid transition | Identified assertion/contract mismatch | Over-budget GREEN failure 4 |
| 6 | green-f90274d3-2862-463d-9ab3-c2fd435e6017 | 3/3 passed | Focused synthetic behavior passed | Retained, not acceptance |
| 7 | green-5a24e415-08ed-4b50-b71b-8916b5b02334 | 3/3 passed | Repeat focused synthetic pass | Retained, not acceptance |
| 8 | red-ba7fc2fb-5d6c-464e-bc70-9ed7e16613d2 | 3/3 failed at old INVALID_STATE_TRANSITION after all seven pre-W4 migrations | Valid behavior-specific RED; classifier mismatch only | Accepted RED by adjudication |
| 9 | green-5fa2eb25-9919-4dd1-acee-eed50bd4e451 | 7/7 failed at permission denied for table attendance_snapshots | Proved FOR UPDATE OF s conflicts with the deliberate immutable-table UPDATE revoke | New GREEN attempt 1 |
| 10 | green-78b3127a-d045-4c3b-b210-996fa09c9779 | Draft-pack test passed; 6/7 failed at bigint serialization | Proved privilege repair and exposed raw JSON.stringify(line) divergence from W1 canonical serialization | New GREEN attempt 2; ceiling reached |
| 11 | green-80f7b51f-43f2-4328-bbfc-7d1b5db01e20 | 6 lifecycle tests passed; reproducibility failed only on decimal-string versus in-memory bigint equality | Proved lifecycle repair; identified an assertion that ignored the canonical JSON representation | Freshly approved wave stopped at first failure |
| 12 | green-4c5955e3-2bd9-4280-a3f9-0f0a1330d4b7 | 7/7 focused W4 passed | Proved the corrected canonical storage assertion and W4 lifecycle | Passed |
| 13 | green-a2b8f18d-96d7-4c83-8d68-146f2b87fe7a | W2 database suite exposed two obsolete fixture/helper assertions and one finalized immutability error semantic gap | Added regression evidence beyond focused W4 | Stopped wave |
| 14 | green-7fcfa402-db05-407b-aeda-d9613b5a53a7 | 15/16 W2 database tests passed; obsolete helper-only outside-transaction assertion remained | Proved the three scoped repairs and isolated the removed API contract | Stopped wave |
| 15 | green-3c0b80fd-fd8e-49d9-87bf-c3849f27fdc8 | 16/16 W2 database tests passed | Proved finalized immutability and compatibility fixtures | Passed |
| 16 | green-c1814385-e0dd-471d-81b0-239e4842a7e0 | 7/7 focused W4 passed after final regression repairs | Final focused evidence | Passed |

All listed database receipts report listener and PID cleanup passed. Exact error stacks were observed directly in parent-controlled harness output; compact run ledgers retain run IDs and cleanup receipts.

## Latest changed causal hypothesis

The privilege failure was caused by row-lock syntax, not missing SELECT authority: PostgreSQL requires UPDATE privilege for a table named in FOR UPDATE, while W2 intentionally revokes UPDATE on immutable snapshots. The snapshot needs no lock; the mutable compensation row retains its lock. After that repair, W4 reached W1 results and failed because raw JSON.stringify cannot encode bigint. W1 already defines canonicalize as its deterministic bigint-safe serialization boundary, so W4 now reuses that exact mechanism for line traces.

## Deterministic stop

The repaired focused and regression waves passed. No further retry is required. Production remains not run and separately gated.
