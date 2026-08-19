import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverProjectTemplates,
  mapWithConcurrency,
  resolveProjectTsxRuntime,
} from "../src/cli/project-templates";

function template(id = "card", extra = ""): string {
  return `
${extra}
export const card = {
  id: ${JSON.stringify(id)},
  useWhen: typeof observed === "undefined" ? "normal" : observed,
  usesGlobalTextEffect: false,
  usesGlobalTransition: false,
  usesGlobalBackgroundEffect: false,
  schema: { type: "object", properties: {} },
  component: () => null,
};
`;
}

function project(source: string): string {
  const cwd = mkdtempSync(join(tmpdir(), "vanillasky-loader-"));
  mkdirSync(join(cwd, "vanillasky/templates"), { recursive: true });
  writeFileSync(join(cwd, "vanillasky/templates/card.tsx"), source);
  return cwd;
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

function childPrelude(pidFile: string): string {
  const readyFile = `${pidFile}.ready`;
  return `
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
const child = spawn(process.execPath, ["-e", ${JSON.stringify(`const { writeFileSync } = require("node:fs"); process.on("SIGTERM", () => {}); writeFileSync(${JSON.stringify(readyFile)}, "ready"); setInterval(() => {}, 1000);`)}], { stdio: "ignore" });
child.unref();
const readyDeadline = Date.now() + 2000;
while (!existsSync(${JSON.stringify(readyFile)}) && Date.now() < readyDeadline) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
}
if (!existsSync(${JSON.stringify(readyFile)})) throw new Error("descendant did not become ready");
writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
`;
}

describe("trusted project template loader", () => {
  it("resolves the optional TSX loader lazily with an actionable install command", () => {
    expect(() => resolveProjectTsxRuntime(() => {
      throw new Error("missing");
    })).toThrow(/npm install --save-dev tsx/);
  });

  it("uses a bounded default timeout", async () => {
    const cwd = project(`while (true) {}\n${template()}`);
    await expect(discoverProjectTemplates(cwd)).rejects.toThrow(/loading timed out after \d+ms/i);
  }, 15_000);

  it("bounds noisy source output and keeps diagnostics project-relative", async () => {
    const cwd = project(template());
    const pidFile = join(cwd, "child.pid");
    writeFileSync(join(cwd, "vanillasky/templates/card.tsx"), template("card", `${childPrelude(pidFile)}\nprocess.stdout.write("x".repeat(2_000_000));`));
    let caught: Error | undefined;
    try {
      await discoverProjectTemplates(cwd, { maxOutputBytes: 1024 });
    } catch (error) {
      caught = error as Error;
    }
    expect(caught?.message).toMatch(/output exceeded 1024 bytes/i);
    expect(caught?.message).toContain("vanillasky/templates/card.tsx");
    expect(caught?.message).not.toContain(cwd);
    expect(readFileSync(`${pidFile}.ready`, "utf8")).toBe("ready");
    expect(processExists(Number(readFileSync(pidFile, "utf8")))).toBe(false);
  });

  it("does not expose parent secrets and ignores console output in its result protocol", async () => {
    const cwd = project(template("card", `
const observed = process.env.VANILLASKY_TEST_SECRET ?? "secret unavailable";
console.log("not protocol");
console.error("also not protocol");
`));
    process.env.VANILLASKY_TEST_SECRET = "must-not-reach-template";
    try {
      const [loaded] = await discoverProjectTemplates(cwd);
      expect(loaded.metadata.useWhen).toBe("secret unavailable");
    } finally {
      delete process.env.VANILLASKY_TEST_SECRET;
    }
  });

  it.skipIf(process.platform === "win32")("kills the template process tree on timeout", async () => {
    const cwd = project(template());
    const pidFile = join(cwd, "child.pid");
    writeFileSync(join(cwd, "vanillasky/templates/card.tsx"), template("card", `${childPrelude(pidFile)}\nwhile (true) {}`));

    // Leave enough startup headroom for Node 20 under the full parallel CI suite;
    // the assertion is about descendant cleanup after the module has executed.
    await expect(discoverProjectTemplates(cwd, { timeoutMs: 1_500 })).rejects.toThrow(/timed out/i);
    const pid = Number(readFileSync(pidFile, "utf8"));
    expect(processExists(pid)).toBe(false);
  });

  it.skipIf(process.platform === "win32")("awaits descendant cleanup after success, nonzero exit, and malformed protocol", async () => {
    for (const mode of ["success", "exit", "protocol"] as const) {
      const cwd = project(template());
      const pidFile = join(cwd, `${mode}.pid`);
      const tail = mode === "exit"
        ? `throw new Error("source failed");`
        : mode === "protocol"
          ? `import { writeSync } from "node:fs"; writeSync(3, "not-json");`
          : "";
      writeFileSync(join(cwd, "vanillasky/templates/card.tsx"), template("card", `${childPrelude(pidFile)}\n${tail}`));

      if (mode === "success") await expect(discoverProjectTemplates(cwd)).resolves.toHaveLength(1);
      else await expect(discoverProjectTemplates(cwd)).rejects.toThrow();
      expect(readFileSync(`${pidFile}.ready`, "utf8"), mode).toBe("ready");
      expect(processExists(Number(readFileSync(pidFile, "utf8"))), mode).toBe(false);
    }
  });

  it("bounds source count and limits loader concurrency", async () => {
    const cwd = project(template());
    for (let index = 0; index < 128; index += 1) {
      writeFileSync(join(cwd, `vanillasky/templates/card-${index}.tsx`), template(`card${index}`));
    }
    await expect(discoverProjectTemplates(cwd)).rejects.toThrow(/at most 128 template source files/i);

    let active = 0;
    let peak = 0;
    const values = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return value * 2;
    });
    expect(peak).toBe(2);
    expect(values).toEqual([2, 4, 6, 8, 10, 12]);
  });

  it("sanitizes project and dependency paths from loader diagnostics", async () => {
    const cwd = project("export const broken = ;");
    const dependencyRoot = createRequire(import.meta.url).resolve("tsx").split("node_modules")[0];
    let message = "";
    try { await discoverProjectTemplates(cwd); } catch (error) { message = (error as Error).message; }
    expect(message).toContain("vanillasky/templates/card.tsx");
    expect(message).not.toContain(cwd);
    expect(message).not.toContain(dependencyRoot);
  });

  it("rejects symbolic-link traversal for template source discovery", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-loader-root-"));
    const outside = mkdtempSync(join(tmpdir(), "vanillasky-loader-outside-"));
    mkdirSync(join(cwd, "vanillasky"));
    writeFileSync(join(outside, "card.tsx"), template());
    symlinkSync(outside, join(cwd, "vanillasky/templates"), "dir");

    await expect(discoverProjectTemplates(cwd)).rejects.toThrow(/symbolic link/i);
  });

  it("rejects a symbolic-link template file instead of silently ignoring it", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-loader-file-root-"));
    const outside = mkdtempSync(join(tmpdir(), "vanillasky-loader-file-outside-"));
    mkdirSync(join(cwd, "vanillasky/templates"), { recursive: true });
    writeFileSync(join(outside, "card.tsx"), template());
    symlinkSync(join(outside, "card.tsx"), join(cwd, "vanillasky/templates/card.tsx"), "file");

    await expect(discoverProjectTemplates(cwd)).rejects.toThrow(/symbolic link/i);
  });
});
