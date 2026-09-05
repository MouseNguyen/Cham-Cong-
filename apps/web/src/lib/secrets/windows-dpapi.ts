import { spawn } from "node:child_process";
import { isAbsolute, join } from "node:path";

export interface WindowsSecretProtector {
  protect(plaintext: Uint8Array, purpose: string): Promise<Buffer>;
  unprotect(ciphertext: Uint8Array, purpose: string): Promise<Buffer>;
}

const PURPOSE = /^[A-Za-z0-9][A-Za-z0-9/_:.-]{0,127}$/;
const OUTPUT_LIMIT = 32768;
const TIMEOUT_MS = 10000;

/** Trusted server bootstrap supplies projectRoot; never derive it from a request.
 * No connection, child process or credential read occurs during construction.
 * Returned buffers belong to the caller, which must clear them when finished.
 */
export function createWindowsDpapi(options: { projectRoot: string }): WindowsSecretProtector {
  if (!isAbsolute(options.projectRoot)) throw new Error("INVALID_SECRET_CONFIGURATION");
  const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

  async function transform(mode: "protect" | "unprotect", input: Uint8Array, purpose: string): Promise<Buffer> {
    if (!(input instanceof Uint8Array) || input.length === 0 ||
        input.length > (mode === "protect" ? 4096 : 16384) ||
        typeof purpose !== "string" || !PURPOSE.test(purpose)) {
      throw new Error("INVALID_SECRET_INPUT");
    }
    if (process.platform !== "win32") throw new Error("WINDOWS_DPAPI_REQUIRED");
    const failure = "SECRET_" + mode.toUpperCase() + "_FAILED";
    // Serialize synchronously before the first await: caller mutation cannot
    // change the captured input. Payload never enters argv, env, shell or logs.
    const copy = Buffer.from(input);
    const request = Buffer.from(JSON.stringify({ data: copy.toString("base64"), purpose }), "utf8");
    copy.fill(0);
    return new Promise<Buffer>((resolve, reject) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(powershell, [
          "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
          "-File", join(options.projectRoot, "scripts", "windows", mode + "-secret.ps1"),
        ], { cwd: options.projectRoot, windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] });
      } catch {
        request.fill(0);
        reject(new Error(failure));
        return;
      }
      let failed = false;
      let size = 0;
      const chunks: Buffer[] = [];
      const stop = () => { failed = true; child.kill(); };
      const timer = setTimeout(stop, TIMEOUT_MS);
      child.on("error", () => { failed = true; });
      child.stdin!.on("error", () => { failed = true; });
      child.stderr!.on("data", () => { failed = true; }); // Discard diagnostics.
      child.stdout!.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > OUTPUT_LIMIT) { chunk.fill(0); stop(); return; }
        chunks.push(chunk);
      });
      // close occurs after process exit AND captured streams close, including
      // start errors. Never return a plaintext result before the helper exits.
      child.once("close", (code) => {
        clearTimeout(timer);
        request.fill(0);
        const output = Buffer.concat(chunks);
        for (const chunk of chunks) chunk.fill(0);
        if (failed || code !== 0) {
          output.fill(0);
          reject(new Error(failure));
          return;
        }
        const encoded = output.toString("ascii");
        const decoded = Buffer.from(encoded, "base64");
        output.fill(0);
        if (decoded.length === 0 || decoded.length > (mode === "protect" ? 16384 : 4096) ||
            decoded.toString("base64") !== encoded) {
          decoded.fill(0);
          reject(new Error(failure));
          return;
        }
        resolve(decoded);
      });
      child.stdin!.end(request, () => request.fill(0));
    });
  }
  return {
    protect: (plaintext, purpose) => transform("protect", plaintext, purpose),
    unprotect: (ciphertext, purpose) => transform("unprotect", ciphertext, purpose),
  };
}
