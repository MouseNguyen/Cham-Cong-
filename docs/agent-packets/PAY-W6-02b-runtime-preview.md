# PAY-W6-02b — bounded synthetic delivery wave

Owner: Codex parent, no subagents. Workspace: F:\Codex\Projects\Pay Slip.

Outcome: owner previews the exact employee/verified recipient/period/encrypted file/hash, reauthenticates and releases through the fake queue. Separate manual delivery/password-handoff receipts never claim provider delivery or include a password.

Execute within 60 minutes, with 15-minute checkpoints and two attempts per evidence layer:

1. Implement focused RED tests and the minimal owned harness. Run `powershell -NoProfile -File scripts/windows/test-delivery-release.ps1 -Mode Red` on a fresh `payslip_w6_02b_synthetic` database at `127.0.0.1:55432`, using the existing eight migrations.
2. Implement the packet-owned services and one additive migration `202609080001_w6_02b_delivery_release`. Run the same command with `-Mode Green`; existing Prisma validate/generate/migrate deploy applies only to the fresh synthetic cluster. Run the existing delivery regression suite through the harness.
3. Generate synthetic encrypted PDFs using the already-installed Chromium/qpdf and DPAPI helper. Fresh test credentials/passwords stay in memory/stdin; no existing secrets or real employee data. Use private `.tmp/PAY-W6-02b` paths and remove temporary plaintext on success/failure.
4. Run `npm run lint`, `npm run typecheck`, and `npm run build`. Inspect scoped diff and locally commit explicit files after passing verification.

No downloads, installs, network, real Gmail/OAuth/Zalo calls, containers, outside-project writes, production database, public ports or push. Gmail remains disabled; tests use fake transport. No admin server or browser UI session is needed. PDF rendering is headless/offline.

Budget: CPU only, no GPU; up to 4 GiB RAM and 2 GiB new disk. Stop after the bounded failure condition, unowned listener, or need for additional effects. A failed same-layer attempt requires exact-source diagnosis before retry.

Cleanup: close owned PDF processes, stop only the fresh harness cluster, verify port/PID and plaintext absence. Retain stopped synthetic cluster, encrypted synthetic documents and redacted evidence. Database transactions roll back failures; no down migration, existing database operation or destructive Git reset.

Authority: the previous approval authorized advancing to this task. The exact new migration/database/PDF/test/build wave requires confirmation under repository AGENTS.md, Runtime and tool authority. This preview does not authorize real message delivery.
