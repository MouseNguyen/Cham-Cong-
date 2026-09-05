# Windows secret protection — current-user synthetic canary

## Verified boundary

PAY-W7-01a provides createWindowsDpapi({ projectRoot }) with protect(bytes, purpose) and unprotect(bytes, purpose). projectRoot is trusted server-bootstrap configuration, never a request parameter. The adapter is server-only and explicitly rejects non-Windows execution.

The current-user synthetic canary passed six focused tests, with eight observed real PowerShell helpers. Each result waits for child close; the final receipt records zero remaining helpers. No existing secret, .env, real TOTP seed, OAuth token, PDF password, private key or employee data was opened.

Microsoft documents ProtectedData as a wrapper over Windows DPAPI and notes its dependency on user-profile state. We use System.Security ProtectedData with CurrentUser, not LocalMachine. Documentation describes the intended boundary; the current canary does not experimentally prove a different-user denial or the intended service profile.
Sources: [ProtectedData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata?view=windowsdesktop-9.0), [DataProtectionScope](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.dataprotectionscope?view=windowsdesktop-9.0).

## Interface and data handling

- Plaintext: nonempty Uint8Array, at most4096 bytes. Ciphertext: nonempty Uint8Array, at most16384 bytes.
- Purpose: public stable domain separator, 1–128 ASCII characters from the declared allowlist. Use a versioned class and opaque record ID such as totp/v1/<opaque-id>. Purpose is neither a password nor an authorization check; changing it prevents this adapter from recovering the blob.
- Fixed protect/unprotect script paths and arguments. Payload is JSON with canonical base64 data plus purpose, over stdin only. Output is canonical base64 through a captured pipe.
- Scripts use optional entropy PaySlip/dpapi/v1/ plus purpose. There is no plaintext, secret argument, environment variable, shell interpolation, secret file, temporary payload file or unredacted helper error.
- The TypeScript caller receives a new Buffer and owns its lifecycle. Clear decrypted buffers promptly after use. The adapter copies input before asynchronous work, and scripts/adapter clear their principal mutable byte buffers. Managed strings and OS internals cannot be guaranteed erased; this is not a memory-forensics guarantee.
- Bounds: 32KiB request/output framing,10-second helper timeout; hidden non-detached process, fixed Windows PowerShell executable under SystemRoot. No retries, fallback encryption or server.
- Stable caller errors: INVALID_SECRET_CONFIGURATION, INVALID_SECRET_INPUT, WINDOWS_DPAPI_REQUIRED, SECRET_PROTECT_FAILED, SECRET_UNPROTECT_FAILED. Never log raw stdout, stdin, stderr, error causes or plaintext.

Each invocation starts one PowerShell process. This slice favors the installed Windows capability with no native package installation. It is not a throughput benchmark or a high-volume secret-vault service.

## Local reproduction

From F:\Codex\Projects\Pay Slip, within approved synthetic runtime scope:

```powershell
npm run test:secrets
npm run typecheck
npm run test:unit -- --run packages/attendance-domain/test packages/payroll-domain/test
```

The tests generate random bytes in memory. Test assertions use booleans and stable messages instead of displaying secret buffers. Process observations are independent of Vitest5's default clearMocks:true, and zero observations fail the cleanup gate. ops/evidence/PAY-W7-01a-runtime.json contains only call counts, exit codes, source hashes and cleanup metadata. Expected negative cases account for three exit-code1 helpers.

The focused runtime proved roundtrip, wrong-purpose/tamper/malformed rejection, maximum plaintext size, defensive copying, fixed argv/pipe/no-shell operation and child exits. Timeouts and forced host termination were not fault-injected; the timeout path is static-reviewed only. No DPAPI throughput or peak-memory claim is made.

## Two open identity gates and recovery

1. Prove decrypt rejection under another explicitly authorized Windows identity.
2. Prove operation under the selected intended service identity with its profile loaded.

Neither identity is selected or authorized in this packet. Do not create an account, impersonate an existing account or read its credentials automatically. Wrong-purpose rejection does not replace cross-identity proof. W7-01a remains partial outside the accepted current-user canary, and PAY-W7-01 remains partial.

W7-01b owns portable PDF-password recovery, age-encrypted exports, replacement-profile recovery, TOTP re-enrollment and OAuth reauthorization. This adapter does not make DPAPI ciphertext portable and does not authorize G: writes, service registration, real-secret use or production deployment.

## Cleanup and rollback

All normal and expected-failure helpers in the canary exited. No detached process, listener, secret data file or installed package remains. Retain only source/tests and redacted evidence. Roll back a future accepted code change with a reviewed forward change; do not remove Windows DPAPI profile state or reset the working tree.

A failed initial metadata assertion observed zero calls because Vitest resets mock history between tests. That receipt was rejected. The final test uses an independent non-secret observation list and requires a nonzero denominator before accepting cleanup.
