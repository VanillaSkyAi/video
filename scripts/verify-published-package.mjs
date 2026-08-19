#!/usr/bin/env node

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { waitForRegistryIntegrity } from "./lib/release-integrity.mjs";

const manifest = await import("../package.json", { with: { type: "json" } });
const packageName = manifest.default.name;
const version = process.env.VANILLASKY_PUBLISHED_VERSION ?? manifest.default.version;
const evidenceDirectory = resolve(process.env.VANILLASKY_EVIDENCE_DIR ?? "artifacts/release-verification");
mkdirSync(evidenceDirectory, { recursive: true });

const candidateIntegrity = process.env.VANILLASKY_EXPECTED_INTEGRITY;
if (!candidateIntegrity) throw new Error("VANILLASKY_EXPECTED_INTEGRITY is required for published verification");
const integrity = await waitForRegistryIntegrity({
  expectedIntegrity: candidateIntegrity,
  attempts: 12,
  delayMs: 5_000,
  fetchIntegrity: async () => {
    try {
      const output = execFileSync("npm", ["view", `${packageName}@${version}`, "dist.integrity", "--json"], { encoding: "utf8" }).trim();
      return output ? JSON.parse(output) : undefined;
    } catch {
      return undefined;
    }
  },
});

const result = spawnSync(process.execPath, [resolve("scripts/verify-onboarding.mjs")], {
  stdio: "inherit",
  env: {
    ...process.env,
    VANILLASKY_INSTALL_SPEC: `${packageName}@${version}`,
    VANILLASKY_EVIDENCE_DIR: evidenceDirectory,
    VANILLASKY_EXPECTED_INTEGRITY: integrity,
  },
});
process.exitCode = result.status ?? 1;
