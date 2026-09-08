# ADR 0002 — Synthetic payslip PDF encryption

Status: accepted synthetic-only in PAY-W6-01; see the parent acceptance receipt.

The document worker renders immutable finalized synthetic payroll results. It checks canonical input/result hashes and attendance, compensation, rule and calculator bindings; it never calls the payroll calculator. Only explicit presentation fields are copied. Employer contributions are separate from employee deductions. Full national ID, bank account and social-insurance identifiers are not queried.

Playwright uses the existing project Chromium and embedded Be Vietnam Pro fonts. All page requests are blocked, service workers disabled and the context offline. A4 content is escaped HTML with repeating table headings and unsplit monetary rows.

qpdf 12.4.1 portable Windows mingw64 is pinned to the official GitHub release. Its `@-` argument-file interface receives independent random 32-byte user and owner passwords through stdin, not argv. qpdf verifies the output with the user password and AESv3 encryption before promotion. Captured diagnostics are discarded because qpdf encryption inspection can contain passwords. Employee passwords are protected with Windows CurrentUser DPAPI and a purpose bound to the artifact UUID. Owner passwords are discarded. JavaScript strings cannot be reliably wiped; mutable buffers are cleared on completion.

Each generated work directory inherits the private storage ACL (current user and SYSTEM). Plaintext is removed in finally paths. Encrypted PDF and DPAPI sidecar are renamed from the same filesystem into UUID paths before metadata commits. A transaction advisory lock prevents cooperating workers from issuing duplicates. Replays verify artifact hash, size and DPAPI binding. Failed pre-commit metadata writes roll back and remove promoted files. A lost COMMIT response is ambiguous: encrypted files remain for reconciliation and the caller gets DOCUMENT_COMMIT_OUTCOME_UNKNOWN. This is not a distributed atomic filesystem/database transaction or crash-recovery guarantee. Full replacement-profile recovery belongs to W7-01b.

The entrypoint is an internal worker, not a public HTTP route. The caller supplies trusted organization scope and absolute private storage configuration; delivery UI/authentication integration is W5-02b. Runtime paths are explicit bootstrap inputs; binaries are not automatically downloaded or installed by the application. Keep the fonts/styles deployed with the worker.

## Pins and provenance

- qpdf source: https://github.com/qpdf/qpdf/releases/tag/v12.4.1
- Archive: qpdf-12.4.1-mingw64.zip; 24,057,199 bytes.
- Archive SHA-256, matched official GitHub asset digest: `6a47eeddc8ff712a6e003314daae25569402c6e904ba82b7b9181d7b0301b689`.
- qpdf.exe SHA-256: `b07385b17f2edb0ec432f54fb734a3494917dfc7283528ae17f555dcbe69ed7f`.
- Password interface: https://qpdf.readthedocs.io/en/stable/cli.html (read 2026-09-08).
- Fonts: https://github.com/google/fonts/tree/main/ofl/bevietnampro ; SIL OFL 1.1 kept alongside fonts.
- Regular SHA-256: `cd1ef6e9d7db28ad5cdb88a65ccbe693870e60d340b791f349d248342b4fe4c3`.
- Bold SHA-256: `7f738fe5c43c8872807b20e2d30d42163618de8a4daf7f48a939adac32c16847`.
- OFL SHA-256: `6b7f8f73609a25ea78c891e34cf37b06f8a676b7ea986e941e43b009110f2a85`.
- QA uses Codex-bundled pypdf 6.10.0 and Poppler pdftoppm; no extra installation. Text and font extraction consumes decrypted bytes through stdin, raster QA uses a private temporary file removed afterward.

Production remains not run; this scope is synthetic full-time only. No legal production readiness or live delivery claim follows from these PDF checks.
