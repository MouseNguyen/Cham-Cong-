# PAY-W5-02b — delivery UI execution preview

Owner: Codex parent, no subagents. Workspace: F:\Codex\Projects\Pay Slip.

Build the delivery panel inside the existing finalized pay-run screen, using the accepted UI design and W6 services. It shows exact employee, verified recipient, period, encrypted file and hash, then requires owner confirmation and fresh MFA for fake release. Manual delivery and password handoff remain separate and clearly labeled. Typed page tools use the same handlers, register by current state and never return passwords or bypass confirmation.

Exact scope approved by Duke on 2026-09-08:

- `powershell -NoProfile -File scripts/windows/test-delivery-ui.ps1 -Mode Red`, then `-Mode Green` after implementation.
- Existing PostgreSQL18.6: fresh `payslip_w5_02b_synthetic` on `127.0.0.1:55432`, all nine accepted migrations via installed Prisma validate/generate/migrate deploy. No schema changes or existing DB access.
- Existing Next.js app server on `127.0.0.1:46217`, with exact listener ownership preflight and health check. Existing Chromium/Playwright visits only this local app, tests desktop/tablet/keyboard flow, authenticated downloads, explicit release and negative HTTP/tool cases.
- Existing qpdf, fonts and DPAPI generate new synthetic encrypted PDFs; test passwords use memory/stdin/private DPAPI sidecars. No password in screenshots, tool results, URL or logs.
- `npm run lint`, `npm run typecheck`, `npm run build`; scoped diff review, explicit-path staging and local commit after verification.

Bounds: 60 minutes, 15-minute checkpoints, two attempts per evidence layer; CPU only, up to 4 GiB RAM and 2 GiB added disk. No downloads, installs, remote network, real data/messages/OAuth, schema changes, subagents, tunnels or push.

Cleanup: stop only the exact owned server, cluster and PDF browser processes; verify ports46217/55432 and temporary plaintext absence. Retain stopped synthetic cluster, encrypted samples and redacted evidence under this packet's project-local paths. Failed transactions roll back. No destructive reset, down migration or outside-project cleanup.

The exact wave was approved by Duke and executed by the parent. Results are recorded in PAY-W5-02b-parent-acceptance.json.
