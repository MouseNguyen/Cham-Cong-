# W2-01 disposable PostgreSQL execution preview

Status: approved by Duke via "Ok e" and executed for the synthetic W2-01 scope; see the handoff and runtime receipts. Target: F:\Codex\Projects\Pay Slip only.

## Selected route
No container, no Windows service registration, no machine-wide PATH change. PostgreSQL18.6 Windows x64 archive is listed by the official EDB page:
https://www.enterprisedb.com/download-postgresql-binaries
Download selector: https://sbp.enterprisedb.com/getfile.jsp?fileid=1260488
PostgreSQL's Windows page explicitly links the EDB binary-archive route:
https://www.postgresql.org/download/windows/

Project-local paths:
- .tools/postgresql/18.6/ : pinned extracted binaries retained for later local work.
- .tmp/PAY-W2-01/downloads/ : archive; record SHA-256 and final vendor URL. It is not publisher authenticity proof by itself.
- .tmp/PAY-W2-01/cluster/ : newly initialized synthetic cluster; reject pre-existing data directory unless matching owned receipt proves it belongs to this task.
- .tmp/PAY-W2-01/ : transient logs/runtime metadata (never passwords).
- ops/evidence/PAY-W2-01-runtime.json : redacted final verification/cleanup receipt.

## Dependencies
Direct registry metadata inspected during this turn reported Prisma CLI latest=8.0.0-rc.13, client/adapter latest=7.10.0. Choose the verified non-prerelease common7.10.0; never mix the RC CLI with7.10.0 client.
- prisma7.10.0 (dev)
- @prisma/client7.10.0 and @prisma/adapter-pg7.10.0
- pg8.23.0; @types/pg8.23.1 (dev)
Node24.19.0 and TypeScript6.0.3 already exist. Prisma7 metadata permits Node24.
Official setup: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
URL lives in prisma.config.ts; generated client uses the PostgreSQL driver adapter.

Exact package actions from project root:
```powershell
npm install --save-dev --save-exact prisma@7.10.0 @types/pg@8.23.1
npm install --workspace @pay-slip/web --save-exact @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 pg@8.23.0
```
npm manifest/lockfile/cache and dependency lifecycle effects are part of the install approval. No unrelated upgrade. Preserve prior manifests/lockfile as rollback inputs; never repair by deleting all node_modules or resetting Git.

## Database lifecycle
1. Recheck bind127.0.0.1:55432. Current read-only probe found zero listeners. If occupied, report exact PID/executable/commandline and stop; do not kill it or silently change port.
2. Acquire only official archive and pin downloaded digest; check archive paths stay inside the target extraction directory and executable version18.6 before initialization.
3. Create a fresh cluster using initdb with UTF8, SCRAM host auth, generated temporary bootstrap password sent via stdin (--pwprompt with child-only OSTYPE=msys; repaired after the first observed setup failure); no existing .env/credentials read and no credential logging.
4. Start exact project-owned pg_ctl with cluster data path, listen_addresses127.0.0.1 and port55432. Health must succeed before tests. No trust-auth listener.
5. Create database payslip_w2_01_synthetic, owner and restricted application roles. Credentials live only in process memory/child environment for this run. Never use app role for migrations or migration owner for negative privilege tests.
6. RED integration tests must fail for absent schema/repositories, not merely because pg or PostgreSQL is missing.
7. Generate Prisma client, apply initial reviewed migration to the named fresh database, rerun GREEN plus existing63 domain tests/typecheck.
8. Stop this exact cluster in finally on normal success, failure or cancellation; prove owned PID exited and55432 no longer listens. Preserve synthetic stopped cluster, source and receipts; do not perform broad deletion.

Canonical Prisma actions (using installed local CLI, no implicit package fetch):
```powershell
node node_modules/prisma/build/index.js validate
node node_modules/prisma/build/index.js generate
node node_modules/prisma/build/index.js migrate deploy
npm run test:integration -- --run tests/integration/db
npm run test:unit -- --run packages/attendance-domain/test packages/payroll-domain/test
npm run typecheck
```
The harness supplies generated database URLs only to its owned child processes. Ambient DATABASE_URL never chooses the test target. There is no production schema push or migration.

## Limits and rollback
Ceilings for this approved setup/test wave:1GB downloaded,3GB additional disk,1GB database RAM, CPU only/no GPU;30-minute runtime checkpoint, two attempts per evidence layer. Abort before widening limits. These are ceilings, not measured requirements.
Keep the archive/binaries/stopped synthetic cluster for reproducibility; no background process remains. Failed migrations affect only the fresh synthetic DB; preserve diagnostic evidence, correct the initial migration before acceptance, and replay in a separately named fresh owned test DB within the same cluster. Never touch an existing database, Windows service, production app or real records.
