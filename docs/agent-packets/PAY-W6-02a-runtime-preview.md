# PAY-W6-02a exact execution preview

Duke approved continuing to the fake queue. This preview isolates the new migration/test/reviewer wave required by AGENTS.md Runtime and tool authority.

- **Target:** F:\Codex\Projects\Pay Slip only; new unique synthetic PostgreSQL cluster under .tmp/PAY-W6-02a, loopback127.0.0.1:55432. Reuse the existing18.6 binaries, installed Prisma7.10.0 and test tools.
- **Change:** one new forward migration, two queue execution/history tables and a strictly scoped verification-kind extension to immutable outbox intent. Keep the old migration unchanged. No existing database migration.
- **Execution:** parent writes/tests/implements; GPT-5.5 xhigh performs one read-only review. Run the owned database harness with TaskId PAY-W6-02a, focused RED/GREEN plus existing16 DB and63 domain tests, typecheck, cleanup and local commit.
- **Effects:** temporary local database writes with fresh memory-only synthetic credentials; in-memory fake provider only. No real message, Gmail/Zalo/network, secret read, install, Windows account/service or public port.
- **Budget:**15-minute core checkpoint,30-minute runtime checkpoint, two attempts per evidence layer; CPU only, added disk<=1GiB and database memory target<=1GiB.
- **Cleanup:** stop only the exact owned cluster in finally; prove port/PID absence. Retain stopped synthetic files/logs and evidence. Never stop unrelated processes, push or perform destructive resets.
- **Rollback:** reviewed forward change/replay into a fresh synthetic cluster; original migration remains unchanged. No production rollback action.

The exact file roster and commands are in PAY-W6-02a.json; behavior and acceptance are in docs/planning/W6-02a-outbox-contract.md. Once approved, ordinary fixes and verification inside this wave proceed automatically.

## Confirmed reviewer replacement

Duke confirmed PAY-NATIVE-W6-02a-R2 after the R1 GPT-5.5 reviewer hit a usage limit. One GPT-5.6-terra high worker completed the same read-only review, with no core findings. Parent/runtime scope and exclusions stayed unchanged.
