# Unknowns and falsifiers

| ID | Unknown | Evidence that resolves it | Falsifier / stop condition |
|---|---|---|---|
| U1 | Does the current diff satisfy the approved W4 lifecycle and security boundary? | Independent line-level review against design, plan, packet, migration, repository, and focused tests | Any P1 correctness/security/spec finding blocks runtime until repaired |
| U2 | Can Red mode create a pre-W4 baseline deterministically? | Static harness proof followed by one approved fresh RED showing a W4-specific missing column/constraint/behavior | Empty-schema failure, migration-order ambiguity, or unrelated setup error freezes the route |
| U3 | Do historical DB and payroll regressions remain compatible? | Parent-controlled focused DB/payroll regression run after static repairs | Any failure at the same layer stops; no cosmetic retry |
| U4 | Are new tests independently typechecked? | Dedicated `tests/integration/pay-runs/tsconfig.json` included in an explicit typecheck command | Tests excluded from compiler inputs or compiler error |
| U5 | Is finalization replay/crash behavior adequately covered? | Direct rollback/idempotency tests and database/outbox assertions | Duplicate intent, finalized-without-intent, or non-deterministic replay |
| U6 | Is the final working tree the one that passed typecheck/lint/build? | Fresh parent verification after review repairs | Any source change after verification invalidates that receipt |
