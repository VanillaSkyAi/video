#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { generateVersionPackages } from "./lib/version-packages.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const expectedSha = process.env.VERSION_PACKAGES_BASE_SHA;

try {
  if (expectedSha) {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const main = execFileSync("git", ["rev-parse", "origin/main"], { cwd: root, encoding: "utf8" }).trim();
    if (head !== expectedSha || main !== expectedSha) {
      throw new Error(`Version Packages must prepare exact protected main ${expectedSha}; found HEAD ${head} and origin/main ${main}`);
    }
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
    if (status !== "") throw new Error("Version Packages must start from a clean protected-main checkout");
  }
  const result = generateVersionPackages({ root });
  console.log(result.changed
    ? `Prepared ${result.version} from ${result.previousVersion}.`
    : `No package release Changesets are pending at ${result.previousVersion}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
