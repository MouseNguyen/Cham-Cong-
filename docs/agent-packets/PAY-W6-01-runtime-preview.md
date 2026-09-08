# PAY-W6-01 — encrypted payslip wave

Outcome: not run. Preparation: approved design, finalized pay-run data, existing document metadata tables and accepted Windows secret adapter inspected. W5-02a lint closure passed. One consolidated runtime/tool approval remains.

## Deliverable

A Vietnamese A4 payslip generated from a finalized synthetic employee result, encrypted with qpdf AES-256, stored with SHA-256 and metadata, and checked for readable content, one/multiple pages, correct employee binding, password rejection/acceptance and cleanup. Employer contributions are separate from employee deductions. No delivery or real payroll is included.

## Exact bounded scope to approve

Parent only; no new workers. Repository: `F:\Codex\Projects\Pay Slip`. Ninety-minute wave with 15-minute checkpoints and two attempts per evidence layer. Source-backed investigation precedes any retry; no blind retries or scope expansion.

1. Read qpdf official documentation and `qpdf/qpdf` GitHub stable-release metadata. Download one Windows x64 portable release under `.tools/qpdf`, pin the resolved version/asset and SHA-256 before any execution, and inspect the documented stdin/job-JSON password interface. No system installation or PATH edits. Fail closed if provenance/integrity cannot be established.
2. Read/download regular and bold Be Vietnam Pro plus OFL license from `google/fonts`; embed locally. Total external download ceiling: 100 MB. Network restricted to qpdf documentation, GitHub/API and their release/raw asset hosts; no account credentials or paid API.
3. Read only Codex-provided app-bundled dependency directories to locate existing Poppler/Python PDF QA and artifact-marker helpers; execute them only for these synthetic samples. If missing, report the exact dependency rather than silently install more tools. Application generation remains the approved Playwright/Chromium plus qpdf architecture.
4. Implement the packet-owned files using TDD and run:

```powershell
powershell -NoProfile -File scripts/windows/test-documents.ps1 -Mode Red
powershell -NoProfile -File scripts/windows/test-documents.ps1 -Mode Green
npm run typecheck
npm run lint
npm run build
```

The wrapper is to be created and inspected before its first run. It uses the existing PostgreSQL harness, all existing migrations and a fresh `payslip_w6_01_synthetic` database, installed Chromium/Playwright, qpdf encryption/inspection, PDF text/raster QA, and the existing CurrentUser DPAPI helper for generated synthetic passwords. No schema changes are authorized. Additive private document/password files use existing metadata tables and immutable IDs. The expected effect is local sample generation and evidence only.

## Resources, cleanup and rollback

- PostgreSQL `127.0.0.1:55432`; admin only if required `127.0.0.1:46217`. Inspect ownership before use; never stop an unrelated process.
- At most 2 GB new local files, 4 GB RAM, normal CPU, no GPU, no containers or tunnels.
- Keep pinned tool archives/manifests, source font/license, encrypted samples, synthetic redacted receipts and rendered QA images in packet-owned paths. Do not persist raw password values in receipts or prompts.
- Temporary plaintext PDFs stay in an exact project-owned private work directory and are removed on success/failure; passwords pass through memory/stdin and are stored only as CurrentUser DPAPI ciphertext. Verify exact cleanup and process/listener exit.
- Rollback is the reviewable local Git diff. No destructive reset, recursive outside cleanup, production writes or push. Parent commits only verified explicit files.
- No Gmail, Zalo, real employee data, existing credentials, G-drive access, global installations or replacement-profile recovery.

The exact qpdf version is deliberately unresolved until the approved metadata read. Its version/hash/interface must be recorded before execution; missing or incompatible tooling stops this wave rather than authorizing a silent fallback.

## Why approval is needed

Repository `AGENTS.md`, Runtime and tool authority, separately gates “network access or metadata queries” and “builds, tests, browsers, servers, databases … or external binaries.” This wave adds tool acquisition, qpdf/PDF QA execution and generated-password encryption beyond W5 verification. Approval covers the bounded actions above once; routine implementation, checks, integration and cleanup then proceed automatically.
