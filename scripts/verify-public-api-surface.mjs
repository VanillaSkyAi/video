#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPatchCompatibility,
  createPublicApiSignatureReport,
  verifyPublicApiSurface,
} from "./lib/public-api-surface.mjs";
import { readCompatibilityReleaseIntent } from "./lib/compatibility-release-intent.mjs";
import { assertFileHashes } from "./lib/release-integrity.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = resolve(root, "tests/fixtures/public-api-surface.json");
const signaturePath = resolve(root, "tests/fixtures/public-api-signatures.json");
const packageName = "@vanillaskyai/video";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function packageSpecifier(exportKey) {
  return exportKey === "." ? packageName : `${packageName}${exportKey.slice(1)}`;
}

function baselineSurface(currentSurface, baselineManifest) {
  const surface = {};
  for (const [exportKey, definition] of Object.entries(baselineManifest.exports ?? {})) {
    const specifier = packageSpecifier(exportKey);
    const current = currentSurface[specifier];
    if (!current) throw new Error(`Published npm latest entry ${specifier} is missing from the reviewed public surface`);
    const declaration = typeof definition === "object" && definition ? definition.types : undefined;
    if (!declaration?.startsWith("./")) {
      throw new Error(`Published npm latest entry ${specifier} has no package-owned declaration path`);
    }
    surface[specifier] = { ...current, declaration: declaration.slice(2) };
  }
  return surface;
}
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
let compatibilityWorkspace;
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

  const candidateManifest = readJson(join(packageRoot, "package.json"));
  const candidateVersion = candidateManifest.version;
  const baselineVersion = JSON.parse(execFileSync("npm", [
    "view", "@vanillaskyai/video@latest", "version", "--json",
  ], { cwd: root, encoding: "utf8" }));
  compatibilityWorkspace = mkdtempSync(join(tmpdir(), "vanillasky-api-baseline-"));
  writeFileSync(join(compatibilityWorkspace, "package.json"), `${JSON.stringify({ private: true }, null, 2)}\n`);
  const baselineSpecifier = `${packageName}@${baselineVersion}`;
  execFileSync("npm", [
    "install", "--ignore-scripts", "--no-audit", "--no-fund",
    baselineSpecifier, "react@18", "react-dom@18", "@types/react@18", "@types/react-dom@18",
  ], { cwd: compatibilityWorkspace, stdio: "inherit" });
  const baselinePackageRoot = join(compatibilityWorkspace, "node_modules", "@vanillaskyai", "video");
  const baselineManifest = readJson(join(baselinePackageRoot, "package.json"));
  if (baselineManifest.version !== baselineVersion) {
    throw new Error(`Installed npm baseline ${baselineManifest.version} does not match resolved latest ${baselineVersion}`);
  }
  const baselineManifestPath = join(compatibilityWorkspace, "public-api-surface.json");
  writeFileSync(
    baselineManifestPath,
    `${JSON.stringify(baselineSurface(readJson(manifestPath), baselineManifest), null, 2)}\n`,
  );
  const compatibility = assertPatchCompatibility({
    baselineVersion,
    candidateVersion,
    baselineManifest,
    candidateManifest,
    baselineSignatures: createPublicApiSignatureReport({
      packageRoot: baselinePackageRoot,
      manifestPath: baselineManifestPath,
    }),
    candidateSignatures: createPublicApiSignatureReport({ packageRoot, manifestPath }),
    releaseIntent: readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion,
      candidateVersion,
    }),
  });
  console.log(`Verified public API compatibility against npm latest ${baselineVersion}: ${compatibility.status}.`);
} finally {
  if (workspace) rmSync(workspace, { recursive: true, force: true });
  if (compatibilityWorkspace) rmSync(compatibilityWorkspace, { recursive: true, force: true });
}
