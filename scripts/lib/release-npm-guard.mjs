import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

function defaultNpmExecPath() {
  if (process.env.npm_execpath) return process.env.npm_execpath;
  return realpathSync(execFileSync("which", ["npm"], { encoding: "utf8" }).trim());
}

export function parseReleaseNpmInvocation(args) {
  const allowedCommands = new Set(["audit", "install", "pack", "run", "view"]);
  const booleanOptions = new Set(["--silent", "-s"]);
  const logLevels = new Set(["silent", "error", "warn", "notice", "http", "info", "verbose", "silly"]);
  let index = 0;
  while (index < args.length) {
    const argument = args[index];
    if (argument === "--version" || argument === "-v") {
      if (args.length !== 1) throw new Error("npm version option cannot precede a release command");
      return undefined;
    }
    if (!argument.startsWith("-") || argument === "-") {
      if (argument === "publish") return argument;
      if (argument === "exec") {
        const approvedExec = [
          "--yes", "create-vite@9.1.2", "--", "video-demo", "--no-interactive", "--template", "react-ts",
        ];
        const execArguments = args.slice(index + 1);
        if (execArguments.length !== approvedExec.length
          || execArguments.some((value, execIndex) => value !== approvedExec[execIndex])) {
          throw new Error("npm exec is restricted to the pinned create-vite release verifier invocation");
        }
        return argument;
      }
      if (!allowedCommands.has(argument)) throw new Error(`npm command ${argument} is not allowed during a release dry run`);
      return argument;
    }
    if (argument === "--") throw new Error("npm option terminator is not allowed before a release command");
    if (booleanOptions.has(argument)) {
      index += 1;
      continue;
    }
    if (argument === "--loglevel") {
      const value = args[index + 1];
      if (!logLevels.has(value)) throw new Error("npm --loglevel requires an allowed explicit value");
      index += 2;
      continue;
    }
    if (argument.startsWith("--loglevel=")) {
      const value = argument.slice("--loglevel=".length);
      if (!logLevels.has(value)) throw new Error("npm --loglevel requires an allowed explicit value");
      index += 1;
      continue;
    }
    throw new Error(`npm global option ${argument} is not allowed during a release dry run`);
  }
  return undefined;
}

export function createReleaseNpmGuard({ workspace, npmExecPath = defaultNpmExecPath() }) {
  const guardDirectory = join(workspace, "npm-guard-bin");
  const statePath = join(workspace, "npm-guard-state.json");
  const wrapperPath = join(guardDirectory, "npm");
  mkdirSync(guardDirectory, { recursive: true });
  writeFileSync(statePath, `${JSON.stringify({ invalidCalls: 0, packCalls: 0, publishCalls: 0 })}\n`);
  writeFileSync(wrapperPath, `#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

${parseReleaseNpmInvocation.toString()}

const args = process.argv.slice(2);
const statePath = ${JSON.stringify(statePath)};
const npmExecPath = ${JSON.stringify(npmExecPath)};
const state = JSON.parse(readFileSync(statePath, "utf8"));
let command;
try {
  command = parseReleaseNpmInvocation(args);
} catch (error) {
  state.invalidCalls += 1;
  writeFileSync(statePath, JSON.stringify(state) + "\\n");
  console.error(error instanceof Error ? error.message : "Invalid npm invocation");
  process.exit(88);
}
if (command === "pack") state.packCalls += 1;
if (command === "publish") state.publishCalls += 1;
writeFileSync(statePath, JSON.stringify(state) + "\\n");
if (state.publishCalls > 0) {
  console.error("Release dry run forbids every npm publish invocation, including --dry-run");
  process.exit(86);
}
if (state.packCalls > 1) {
  console.error("Release dry run permits exactly one npm pack invocation");
  process.exit(87);
}
const result = spawnSync(process.execPath, [npmExecPath, ...args], {
  env: process.env,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
`);
  chmodSync(wrapperPath, 0o755);

  return {
    environment: {
      PATH: [guardDirectory, process.env.PATH].filter(Boolean).join(delimiter),
    },
    assertComplete() {
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      if (state.invalidCalls !== 0 || state.packCalls !== 1 || state.publishCalls !== 0) {
        throw new Error(`Release dry run executed ${state.packCalls} npm pack, ${state.publishCalls} npm publish, and ${state.invalidCalls} invalid npm commands; expected exactly one pack, zero publish, and zero invalid commands`);
      }
      return state;
    },
  };
}
