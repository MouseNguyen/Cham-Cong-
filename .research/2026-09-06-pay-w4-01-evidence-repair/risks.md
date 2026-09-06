# Risks

| Risk | Severity | Evidence | Control |
|---|---|---|---|
| False completion from invalid RED and over-budget retries | High | src-001 through src-003 | Keep task partial; require changed-hypothesis RED and fresh verification |
| Payroll run transitions after only one employee calculation | High | src-008, src-009 | Reviewer adjudicates spec; add coverage/repair before runtime |
| SECURITY DEFINER privilege or search-path escalation | High | src-007 | Independent SQL security review; require explicit safe search path and least privilege |
| Fresh-MFA bypass through future/invalid timestamp | High | src-008 | Compare with existing authorization contract and add negative tests |
| Historical regressions broken by retired helpers | High | src-002, src-008 | Migrate parent-owned tests/callers or provide bounded compatibility |
| Outbox/finalization replay or rollback not fully proven | High | src-009 | Add direct rollback, duplicate, and crash/retry tests |
| Handcrafted calculation drifts from W1 canonical calculator | Medium | src-009 | Bind a real W1 synthetic calculator result or prove the boundary intentionally accepts canonical persisted input |
| Stale local build claims | Medium | src-002 | Parent reruns exact verification after final edits |

No risk control in this bundle grants runtime, production, network, install, provider, or real-data authority.
