import { randomBytes } from "node:crypto";
import { afterAll, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

// Vitest5 defaults clearMocks:true. Keep non-secret observations outside mock history.
const observed = vi.hoisted(() => ({ calls: [] as { args:readonly string[]; options:import("node:child_process").SpawnOptions; child:import("node:child_process").ChildProcess }[] }));
// Observe real child metadata only; neither stdin nor stdout payloads are saved.
vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return { ...original, spawn: vi.fn((command:string,args:readonly string[],options:import("node:child_process").SpawnOptions) => {
    const child=original.spawn(command,args,options);
    observed.calls.push({args,options,child});
    return child;
  }) };
});

const options = { projectRoot: process.cwd() };
// Missing module is the intended RED; no secret helper starts during collection.
async function adapter() {
  const { createWindowsDpapi } = await import("../../../apps/web/src/lib/secrets/windows-dpapi");
  return createWindowsDpapi(options);
}
it("roundtrips fresh synthetic binary bytes under the current Windows identity", async () => {
  const dpapi=await adapter(),plain=randomBytes(48);
  const protectedBytes=await dpapi.protect(plain,"test/totp-v1");
  // Boolean assertions avoid printing secret values on a failed assertion.
  expect(Buffer.isBuffer(protectedBytes)).toBe(true);
  expect(protectedBytes.equals(plain)).toBe(false);
  const restored=await dpapi.unprotect(protectedBytes,"test/totp-v1");
  expect(restored.equals(plain)).toBe(true);
  plain.fill(0);restored.fill(0);protectedBytes.fill(0);
});
it("rejects wrong purpose and tampered ciphertext without echoing payloads",async()=>{
  const dpapi=await adapter(),plain=randomBytes(32);
  const encrypted=await dpapi.protect(plain,"test/source");
  let failure:unknown;
  try {await dpapi.unprotect(encrypted,"test/other");} catch(error) {failure=error;}
  expect(failure instanceof Error).toBe(true);
  expect((failure as Error).message).toBe("SECRET_UNPROTECT_FAILED");
  const changed=Buffer.from(encrypted);changed[changed.length-1]=changed[changed.length-1]! ^ 1;
  await expect(dpapi.unprotect(changed,"test/source")).rejects.toMatchObject({message:"SECRET_UNPROTECT_FAILED"});
  plain.fill(0);encrypted.fill(0);changed.fill(0);
});
it("rejects malformed encrypted bytes with only a stable generic error",async()=>{
  const dpapi=await adapter();
  await expect(dpapi.unprotect(Buffer.from("synthetic-invalid-blob"),"test/source")).rejects.toMatchObject({message:"SECRET_UNPROTECT_FAILED"});
});
it("rejects invalid purpose and oversized inputs before spawning a helper",async()=>{
  const dpapi=await adapter();
  const before=vi.mocked(spawn).mock.calls.length;
  await expect(dpapi.protect(Buffer.alloc(4097),"test/source")).rejects.toMatchObject({message:"INVALID_SECRET_INPUT"});
  await expect(dpapi.protect(Buffer.from("synthetic"),"")).rejects.toMatchObject({message:"INVALID_SECRET_INPUT"});
  await expect(dpapi.unprotect(Buffer.alloc(16385),"test/source")).rejects.toMatchObject({message:"INVALID_SECRET_INPUT"});
  expect(vi.mocked(spawn).mock.calls.length).toBe(before);
});
// Cross-identity rejection is an explicit blocked claim in the packet. No skipped
// test or same-user negative test counts as evidence for that separate gate.

it("preserves the4KiB boundary and snapshots caller bytes before asynchronous work",async()=>{
  const dpapi=await adapter(),plain=randomBytes(4096),expected=Buffer.from(plain);
  const pending=dpapi.protect(plain,"test/boundary");
  plain.fill(0);
  const encrypted=await pending;
  const restored=await dpapi.unprotect(encrypted,"test/boundary");
  expect(restored.equals(expected)).toBe(true);
  expected.fill(0);encrypted.fill(0);restored.fill(0);
});

it("passes only fixed non-secret argv and captures both output streams without a shell",async()=>{
 const calls=observed.calls;
 expect(calls.length>0 && calls.length<=20).toBe(true);
 for(const call of calls){
  const args=call.args;
  const settings=call.options;
  expect(args.length===7 && args[0]==="-NoLogo" && args[1]==="-NoProfile" && args[2]==="-NonInteractive" && args[3]==="-ExecutionPolicy" && args[4]==="Bypass" && args[5]==="-File").toBe(true);
  expect(/(protect|unprotect)-secret\.ps1$/.test(args[6]!)).toBe(true);
  expect(settings?.shell===false && settings?.windowsHide===true).toBe(true);
  expect(JSON.stringify(settings?.stdio)==="[\"pipe\",\"pipe\",\"pipe\"]").toBe(true);
 }
});

afterAll(()=>{
 const children=observed.calls.map(call=>call.child);
 const exited=children.length>0 && children.every(child=>child.exitCode!==null || child.signalCode!==null);
 const sources=["apps/web/src/lib/secrets/windows-dpapi.ts","scripts/windows/protect-secret.ps1","scripts/windows/unprotect-secret.ps1","tests/integration/operations/secrets.windows.spec.ts"];
 const receipt={task_id:"PAY-W7-01a",recorded_at:new Date().toISOString(),layer:"current_user_synthetic_child_cleanup",helper_calls:children.length,helper_exit_codes:children.map(child=>child.exitCode),cleanup_status:exited?"passed":"failed",remaining_owned_children:children.filter(child=>child.exitCode===null && child.signalCode===null).length,secret_payloads_persisted:false,source_sha256:Object.fromEntries(sources.map(path=>[path,createHash("sha256").update(readFileSync(path)).digest("hex")]))};
 mkdirSync("ops/evidence",{recursive:true});
 writeFileSync("ops/evidence/PAY-W7-01a-runtime.json",JSON.stringify(receipt,null,2)+"\n");
 expect(exited).toBe(true);
});
