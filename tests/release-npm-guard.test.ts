import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

function writeFakeNpm(workspace: string) {
  const fakeNpm = join(workspace, "fake-npm.mjs");
  writeFileSync(fakeNpm, [
    'import { appendFileSync } from "node:fs";',
    'appendFileSync(process.env.FAKE_NPM_ARGV_LOG, `${JSON.stringify(process.argv.slice(2))}\\n`);',
  ].join("\n"));
  return fakeNpm;
}

function writeNestedInvoker(workspace: string) {
  const invoker = join(workspace, "invoke-npm.mjs");
  writeFileSync(invoker, [
    'import { spawnSync } from "node:child_process";',
    'const result = spawnSync("npm", JSON.parse(process.env.NESTED_NPM_ARGS), {',
    '  env: { PATH: process.env.PATH, FAKE_NPM_ARGV_LOG: process.env.FAKE_NPM_ARGV_LOG },',
    '  stdio: "ignore",',
    '});',
    'if (result.error) throw result.error;',
    'process.exit(result.status ?? 1);',
  ].join("\n"));
  return invoker;
}

function runNestedNpm(invoker: string, args: string[], environment: NodeJS.ProcessEnv) {
  return execFileSync(process.execPath, [invoker], {
    env: { ...environment, NESTED_NPM_ARGS: JSON.stringify(args) },
  });
}

describe("release npm execution guard", () => {
  it("permits exactly one real pack and rejects every publish invocation", async () => {
    const modulePath = resolve("scripts/lib/release-npm-guard.mjs");
    expect(existsSync(modulePath)).toBe(true);
    if (!existsSync(modulePath)) return;
    const { createReleaseNpmGuard } = await import(pathToFileURL(modulePath).href);
    expect(createReleaseNpmGuard).toBeTypeOf("function");

    const workspace = mkdtempSync(join(tmpdir(), "vanillasky-release-npm-guard-"));
    try {
      const argvLog = join(workspace, "forwarded.jsonl");
      const fakeNpm = writeFakeNpm(workspace);
      const invoker = writeNestedInvoker(workspace);
      const guard = createReleaseNpmGuard({ workspace, npmExecPath: fakeNpm });
      const environment = {
        ...process.env,
        ...guard.environment,
        FAKE_NPM_ARGV_LOG: argvLog,
      };

      runNestedNpm(invoker, ["--version"], {
        PATH: guard.environment.PATH,
        FAKE_NPM_ARGV_LOG: argvLog,
      });
      execFileSync("npm", ["run", "build"], { env: environment });
      runNestedNpm(invoker, ["view", "@vanillaskyai/video@latest", "version", "--json"], {
        PATH: guard.environment.PATH,
        FAKE_NPM_ARGV_LOG: argvLog,
      });
      runNestedNpm(invoker, [
        "exec", "--yes", "create-vite@9.1.2", "--", "video-demo", "--no-interactive", "--template", "react-ts",
      ], {
        PATH: guard.environment.PATH,
        FAKE_NPM_ARGV_LOG: argvLog,
      });
      runNestedNpm(invoker, ["-s", "pack", "--json"], {
        PATH: guard.environment.PATH,
        FAKE_NPM_ARGV_LOG: argvLog,
      });
      guard.assertComplete();
      expect(readFileSync(argvLog, "utf8").trim().split("\n").map((line) => JSON.parse(line))).toEqual([
        ["--version"],
        ["run", "build"],
        ["view", "@vanillaskyai/video@latest", "version", "--json"],
        ["exec", "--yes", "create-vite@9.1.2", "--", "video-demo", "--no-interactive", "--template", "react-ts"],
        ["-s", "pack", "--json"],
      ]);
      expect(() => runNestedNpm(invoker, ["--silent", "pack", "--json"], {
        PATH: guard.environment.PATH,
        FAKE_NPM_ARGV_LOG: argvLog,
      })).toThrow();
      expect(() => execFileSync("npm", ["publish", "candidate.tgz", "--dry-run"], { env: environment, stdio: "ignore" })).toThrow();
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it.each([
    ["long boolean option", ["--silent", "publish", "candidate.tgz"]],
    ["long valued option", ["--loglevel=error", "publish", "candidate.tgz"]],
    ["separate option value", ["--loglevel", "error", "publish", "candidate.tgz"]],
    ["option terminator", ["--", "publish", "candidate.tgz"]],
    ["unknown option", ["--definitely-unknown", "publish", "candidate.tgz"]],
    ["nested npm exec", ["exec", "--", "npm", "publish", "candidate.tgz"]],
    ["unapproved npm exec", ["exec", "--yes", "create-vite@latest", "--", "video-demo"]],
  ])("rejects a guarded bypass using %s", async (_label, args) => {
    const modulePath = resolve("scripts/lib/release-npm-guard.mjs");
    const { createReleaseNpmGuard } = await import(pathToFileURL(modulePath).href);
    const workspace = mkdtempSync(join(tmpdir(), "vanillasky-release-npm-guard-adversarial-"));
    try {
      const argvLog = join(workspace, "forwarded.jsonl");
      const guard = createReleaseNpmGuard({ workspace, npmExecPath: writeFakeNpm(workspace) });
      const invoker = writeNestedInvoker(workspace);
      const environment = {
        PATH: guard.environment.PATH,
        FAKE_NPM_ARGV_LOG: argvLog,
      };

      expect(() => runNestedNpm(invoker, args, environment)).toThrow();
      expect(() => guard.assertComplete()).toThrow();
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
