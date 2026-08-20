#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicApiSignatureReport,
  verifyPublicApiSurface,
} from "./lib/public-api-surface.mjs";
import { assertFileHashes } from "./lib/release-integrity.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = resolve(root, "tests/fixtures/public-api-surface.json");
const signaturePath = resolve(root, "tests/fixtures/public-api-signatures.json");

if (process.argv.includes("--write-signatures")) {
  if (process.env.VANILLASKY_PACKED_TARBALL) {
    throw new Error("Signature snapshots can only be written from reviewed repository source");
  }
  const signatures = createPublicApiSignatureReport({ packageRoot: root, manifestPath });
  writeFileSync(signaturePath, `${JSON.stringify(signatures, null, 2)}\n`);
  console.log(`Wrote reviewed public API signature snapshot to ${signaturePath}.`);
  process.exit(0);
}
const workspace = process.env.VANILLASKY_PACKED_TARBALL
  ? mkdtempSync(join(tmpdir(), "vanillasky-api-surface-"))
  : undefined;
try {
  let packageRoot = root;
  if (workspace) {
    const tarball = resolve(process.env.VANILLASKY_PACKED_TARBALL);
    assertFileHashes(tarball, {
      sha512: process.env.VANILLASKY_EXPECTED_INTEGRITY,
      sha256: process.env.VANILLASKY_EXPECTED_SHA256,
    });
    writeFileSync(join(workspace, "package.json"), `${JSON.stringify({ private: true }, null, 2)}\n`);
    execFileSync("npm", [
      "install", "--ignore-scripts", "--no-audit", "--no-fund",
      tarball, "react@18", "react-dom@18", "@types/react@18", "@types/react-dom@18",
    ], { cwd: workspace, stdio: "inherit" });
    packageRoot = join(workspace, "node_modules", "@vanillaskyai", "video");
  }
  const report = await verifyPublicApiSurface({ packageRoot, manifestPath, signaturePath });
  console.log(`Verified ${Object.keys(report).length} frozen public API entry points.`);
} finally {
  if (workspace) rmSync(workspace, { recursive: true, force: true });
}
