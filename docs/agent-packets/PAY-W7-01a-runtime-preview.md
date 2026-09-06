# PAY-W7-01a: exact synthetic DPAPI canary

Approved by Duke and executed for both the original current-user canary and the bounded Windows identity canary. The selected M0 identity is the current interactive Windows identity. LocalService (`S-1-5-19`) is used only as the negative-canary identity. Parent owns the code; GPT-5.5 xhigh performs one read-only review. No Hermes runtime or model fallback is used.

The deliverable is a small Windows CurrentUser secret-protection adapter for later TOTP/PDF/OAuth callers. This canary uses newly generated random bytes only. It does not read existing secrets, .env, credentials, employee files or any existing ciphertext.

## Executed scope

- Run the focused Vitest specification in this packet to observe RED, implement the two project-owned PowerShell scripts and TypeScript adapter, then run GREEN.
- Each script runs hidden and bounded under the **current interactive Windows account** using installed powershell.exe and .NET ProtectedData with CurrentUser. Requests contain base64-encoded synthetic bytes over stdin; the parent captures stdout. No secret is passed as a command argument, printed in test failures or saved to disk.
- DPAPI may access or initialize normal Windows CurrentUser protection state. No new account/service, manual master-key inspection, registry/PATH change or credential export.
- Up to20 bounded script calls per run; child timeout10 seconds;15-minute checkpoint, two attempts per evidence layer. CPU only, target<=256MiB child memory; no ports, installs or downloads.
- Run focused typecheck and existing63 domain tests, inspect one read-only reviewer response, save redacted receipts and commit explicit files locally. No push.
- If exact API details require verification, read at most three official Microsoft documentation pages. No external data upload.
- Run one UAC-elevated focused identity test. It creates exactly one nonce-named scheduled task as LocalService, exchanges only synthetic DPAPI ciphertext over a named pipe whose actual ACL contains the interactive SID and LocalService SID, and removes the exact task before reporting success.

Full commands, owners and paths are in PAY-W7-01a.json.

## Tests prepared

Same-user binary roundtrip; plaintext differs from protected blob; wrong-purpose and tampered/malformed ciphertext rejection; input size/purpose validation; generic errors that cannot echo child output. Purpose is a public domain separator, never a password or identity-authentication substitute. Max plaintext4KiB; max protected blob16KiB; buffers must be defensively copied and errors stable/redacted.

## Identity evidence limit

The bounded runtime passed both W7-01a identity gates: the current interactive identity passed a fresh CurrentUser roundtrip as the selected M0 identity, and LocalService passed its own roundtrip while rejecting the interactive identity ciphertext. This is synthetic local Windows evidence only. It does not prove a future production service deployment, portable recovery, replacement-profile recovery or real-secret operation. Parent PAY-W7-01 remains partial because W7-01b is not run.

## Cleanup and rollback

Only project-owned short-lived child processes and the exact nonce scheduled task are allowed. The accepted identity receipt records one created task, successful unregister, and zero residue. No plaintext/ciphertext files are retained. Keep source/tests and redacted receipts. No destructive reset or rollback of Windows DPAPI state.

The separate network/test/DPAPI approval comes from AGENTS.md Runtime and tool authority. Generic approval to continue does not identify the new Windows identity/protection effect.
