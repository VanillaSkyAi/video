import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { stopProcessTree } from "../scripts/lib/stop-process-tree.mjs";

async function readPid(stream: NodeJS.ReadableStream): Promise<number> {
  return new Promise((resolve, reject) => {
    let output = "";
    stream.on("data", (chunk) => {
      output += chunk;
      const pid = Number(output.trim());
      if (Number.isInteger(pid)) resolve(pid);
    });
    stream.on("error", reject);
  });
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

describe("stopProcessTree", () => {
  it.skipIf(process.platform === "win32")(
    "kills a detached process group after a child ignores SIGTERM",
    async () => {
      const parent = spawn(process.execPath, ["-e", `
        const { spawn } = require("node:child_process");
        const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
        console.log(child.pid);
        setInterval(() => {}, 1000);
      `], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
      const childPid = await readPid(parent.stdout!);

      try {
        await stopProcessTree(parent, { graceMs: 50 });
        expect(processExists(childPid)).toBe(false);
      } finally {
        try { process.kill(-parent.pid!, "SIGKILL"); } catch { /* already stopped */ }
      }
    },
  );
});
