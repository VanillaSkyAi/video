#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareRelease } from "./lib/release-prepare.mjs";
import { assertReleaseToolchain } from "./lib/release-toolchain.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const targets = process.argv.slice(2);
if (targets.length !== 1) {
  throw new Error("Exactly one explicit target version is required: npm run release:prepare -- <semver>");
}
assertReleaseToolchain({
  nodeVersion: process.versions.node,
  npmVersion: execFileSync("npm", ["--version"], { encoding: "utf8" }).trim(),
});
const result = prepareRelease({ root, targetVersion: targets[0] });
console.log(`Prepared ${result.version} from ${result.previousVersion}. Review and commit the complete diff before release:dry-run.`);
