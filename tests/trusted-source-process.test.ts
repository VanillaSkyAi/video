import { afterEach, describe, expect, it, vi } from "vitest";
import { runTrustedSourceProcess } from "../src/cli/trusted-source-process";

describe("trusted source process cleanup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves the process result when a finished process group cannot be signaled", async () => {
    const kill = process.kill.bind(process);
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid < 0) {
        const error = new Error("kill EPERM") as NodeJS.ErrnoException;
        error.code = "EPERM";
        throw error;
      }
      return kill(pid, signal);
    });

    await expect(runTrustedSourceProcess(["-e", ""], {
      cwd: process.cwd(),
    })).resolves.toBe("");
  });
});
