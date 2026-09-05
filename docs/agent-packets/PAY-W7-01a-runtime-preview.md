# PAY-W7-01a: exact synthetic DPAPI canary

Approved by Duke via Ok e and executed for the current-user synthetic canary. See the handoff for evidence and the two remaining identity gates. Parent owns the code; GPT-5.5 xhigh performs one read-only review. No other worker, model fallback or Hermes runtime.

The deliverable is a small Windows CurrentUser secret-protection adapter for later TOTP/PDF/OAuth callers. This canary uses newly generated random bytes only. It does not read existing secrets, .env, credentials, employee files or any existing ciphertext.

## Execution to approve

- Run the focused Vitest specification in this packet to observe RED, implement the two project-owned PowerShell scripts and TypeScript adapter, then run GREEN.
- Each script runs hidden and bounded under the **current interactive Windows account** using installed powershell.exe and .NET ProtectedData with CurrentUser. Requests contain base64-encoded synthetic bytes over stdin; the parent captures stdout. No secret is passed as a command argument, printed in test failures or saved to disk.
- DPAPI may access or initialize normal Windows CurrentUser protection state. No new account/service, manual master-key inspection, registry/PATH change or credential export.
- Up to20 bounded script calls per run; child timeout10 seconds;15-minute checkpoint, two attempts per evidence layer. CPU only, target<=256MiB child memory; no ports, installs or downloads.
- Run focused typecheck and existing63 domain tests, inspect one read-only reviewer response, save redacted receipts and commit explicit files locally. No push.
- If exact API details require verification, read at most three official Microsoft documentation pages. No external data upload.

Full commands, owners and paths are in PAY-W7-01a.json.

## Tests prepared

Same-user binary roundtrip; plaintext differs from protected blob; wrong-purpose and tampered/malformed ciphertext rejection; input size/purpose validation; generic errors that cannot echo child output. Purpose is a public domain separator, never a password or identity-authentication substitute. Max plaintext4KiB; max protected blob16KiB; buffers must be defensively copied and errors stable/redacted.

## Identity evidence limit

The implementation plan additionally requires that another Windows identity cannot decrypt, and a canary under the intended service identity. Neither identity is specified or authorized. This packet does not create an account, borrow another account or relabel a wrong-purpose test as cross-identity proof. The current-user canary can be verified independently; **W7-01a identity acceptance and parent W7-01 remain partial** until the exact identity test is authorized and passes.

## Cleanup and rollback

Only project-owned short-lived child processes; wait for exit and kill only the exact timed-out child if necessary. No plaintext/ciphertext files. Keep source/tests and redacted receipt. If a canary fails, stop after the bounded attempt policy and retain only non-secret diagnostics. No destructive reset or rollback of Windows DPAPI state.

The separate network/test/DPAPI approval comes from AGENTS.md Runtime and tool authority. Generic approval to continue does not identify the new Windows identity/protection effect.
