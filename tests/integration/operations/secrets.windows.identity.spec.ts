import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const MAX_CAPTURE_BYTES = 64 * 1024;

const expectedReport = {
  schemaVersion: 1,
  currentInteractiveIdentity: {
    selected: true,
    tested: true,
  },
  worker: {
    account: "NT AUTHORITY\\LOCAL SERVICE",
    sid: "S-1-5-19",
  },
  localService: {
    selfRoundtrip: true,
    rejectedInteractiveCiphertext: true,
  },
  namedPipe: {
    aclRestrictedToCurrentUserAndLocalService: true,
  },
  scheduledTask: {
    createdCount: 1,
    cleanup: "passed",
    residueCount: 0,
  },
  redaction: {
    plaintextPersisted: false,
    ciphertextPersisted: false,
    secretInArguments: false,
  },
} as const;

function runIdentityCanary(): Promise<unknown> {
  return new Promise((resolvePromise, rejectPromise) => {
    const scriptPath = resolve(
      "scripts/windows/test-dpapi-identity.ps1",
    );

    const child = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
      ],
      {
        cwd: process.cwd(),
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const rejectSafely = (): void => {
      if (settled) return;
      settled = true;
      rejectPromise(new Error("IDENTITY_CANARY_FAILED"));
    };

    const timer = setTimeout(() => {
      child.kill();
      rejectSafely();
    }, 60_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout, "utf8") > MAX_CAPTURE_BYTES) {
        child.kill();
        rejectSafely();
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stderr, "utf8") > MAX_CAPTURE_BYTES) {
        child.kill();
        rejectSafely();
      }
    });

    child.once("error", () => {
      clearTimeout(timer);
      rejectSafely();
    });

    child.once("close", (exitCode) => {
      clearTimeout(timer);

      if (settled) return;

      if (exitCode !== 0) {
        rejectSafely();
        return;
      }

      try {
        const parsed: unknown = JSON.parse(stdout);
        settled = true;
        resolvePromise(parsed);
      } catch {
        rejectSafely();
      }
    });
  });
}

it(
  "proves CurrentUser DPAPI isolation using LocalService",
  async () => {
    const report = await runIdentityCanary();

    // Exact equality prevents incomplete or loosely matching evidence.
    expect(report).toEqual(expectedReport);

    // Persist only after the entire runtime contract is GREEN.
    mkdirSync("ops/evidence", { recursive: true });
    writeFileSync(
      "ops/evidence/PAY-W7-01a-identity-runtime.json",
      `${JSON.stringify(
        {
          taskId: "PAY-W7-01a",
          recordedAt: new Date().toISOString(),
          layer: "windows_identity_runtime",
          ...expectedReport,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  },
  60_000,
);