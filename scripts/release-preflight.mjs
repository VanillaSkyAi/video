#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertReleasePreflight } from "./lib/release-preflight.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const tag = `v${manifest.version}`;

const localTag = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/tags/${tag}`], { cwd: root });
if (![0, 1].includes(localTag.status ?? -1)) throw new Error(`Unable to inspect local tag ${tag}`);

const remoteTag = spawnSync("git", ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`], {
  cwd: root,
  encoding: "utf8",
});
if (![0, 2].includes(remoteTag.status ?? -1)) {
  throw new Error(`Unable to prove remote tag ${tag} is absent; verify origin connectivity and try again`);
}

const result = assertReleasePreflight({
  currentBranch: git("branch", "--show-current"),
  expectedRepository: "VanillaSkyAi/video",
  head: git("rev-parse", "HEAD"),
  localTagExists: localTag.status === 0,
  originMain: git("rev-parse", "origin/main"),
  packageName: manifest.name,
  packageRepository: manifest.repository?.url,
  remoteTagExists: remoteTag.status === 0,
  remoteUrl: git("remote", "get-url", "origin"),
  status: git("status", "--porcelain"),
  version: manifest.version,
});

console.log(`Release preflight passed: ${result.repository} ${result.tag} ${result.commit}`);
