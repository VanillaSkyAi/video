#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  assertDistTagsCoherent,
  assertDistTagTransitionCoherent,
  assertFileHashes,
  waitForRegistryIntegrity,
} from "./lib/release-integrity.mjs";

const [mode, target, expectedIntegrity, expectedSha256] = process.argv.slice(2);

if (mode === "file") {
  if (!target || !expectedIntegrity || !expectedSha256) {
    throw new Error("Usage: verify-release-integrity.mjs file <tarball> <sha512-integrity> <sha256>");
  }
  const path = resolve(target);
  assertFileHashes(path, { sha512: expectedIntegrity, sha256: expectedSha256 });
  console.log(`Release artifact integrity verified: ${path}`);
} else if (mode === "registry") {
  if (!target || !expectedIntegrity) throw new Error("Usage: verify-release-integrity.mjs registry <package@version> <sha512-integrity>");
  const attempts = Number(process.env.VANILLASKY_REGISTRY_ATTEMPTS ?? "12");
  const delayMs = Number(process.env.VANILLASKY_REGISTRY_DELAY_MS ?? "5000");
  await waitForRegistryIntegrity({
    expectedIntegrity,
    attempts,
    delayMs,
    fetchIntegrity: async () => {
      try {
        const output = execFileSync("npm", ["view", target, "dist.integrity", "--json"], { encoding: "utf8" }).trim();
        return output ? JSON.parse(output) : undefined;
      } catch {
        return undefined;
      }
    },
  });
  console.log(`Published npm integrity verified: ${target}`);
} else if (mode === "dist-tags") {
  if (!target || !expectedIntegrity || !["latest", "beta"].includes(expectedSha256)) {
    throw new Error("Usage: verify-release-integrity.mjs dist-tags <package> <candidate-version> <latest|beta>");
  }
  const output = execFileSync("npm", ["view", target, "dist-tags", "--json"], { encoding: "utf8" }).trim();
  const tags = assertDistTagsCoherent(JSON.parse(output), {
    candidateVersion: expectedIntegrity,
    candidateTag: expectedSha256,
  });
  console.log(`npm dist-tags are coherent: ${Object.keys(tags).sort().join(", ")}`);
} else if (mode === "dist-tags-transition") {
  if (!target || !expectedIntegrity || !["latest", "beta"].includes(expectedSha256)) {
    throw new Error("Usage: verify-release-integrity.mjs dist-tags-transition <package> <candidate-version> <latest|beta>");
  }
  const result = spawnSync("npm", ["view", target, "dist-tags", "--json"], { encoding: "utf8" });
  if (result.error) throw result.error;
  const output = (result.stdout ?? "").trim();
  const notFound = result.status !== 0 && /(?:E404|404 Not Found)/.test(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  if (result.status !== 0 && !notFound) throw new Error(`Unable to read npm dist-tags for ${target}`);
  const currentTags = output && !notFound ? JSON.parse(output) : {};
  const tags = assertDistTagTransitionCoherent(currentTags, {
    candidateVersion: expectedIntegrity,
    candidateTag: expectedSha256,
  });
  console.log(`Prospective npm dist-tags are coherent: ${Object.keys(tags).sort().join(", ")}`);
} else {
  throw new Error("Usage: verify-release-integrity.mjs <file|registry|dist-tags|dist-tags-transition> <target> [expected] [tag-or-sha256]");
}
