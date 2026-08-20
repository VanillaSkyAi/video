#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseNpmPackJson } from "./lib/parse-npm-pack-json.mjs";
import {
  assertFileHashes,
  assertValidSemver,
  calculateFileSha256,
  createDeterministicReleaseManifest,
  isPrereleaseSemver,
} from "./lib/release-integrity.mjs";
import { createReleaseNpmGuard } from "./lib/release-npm-guard.mjs";
import { extractChangesetReleaseNotes } from "./lib/release-notes.mjs";
import { assertReleaseToolchain } from "./lib/release-toolchain.mjs";
import { assertNoPendingPackageChangesets } from "./lib/changeset-records.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const expectedRepository = "VanillaSkyAi/video";
const expectedPackage = "@vanillaskyai/video";
const expectedNpm = "11.17.0";
const ciMode = process.argv.includes("--ci");
const manifestOnly = process.argv.includes("--manifest-only");
assertReleaseToolchain({
  nodeVersion: process.versions.node,
  npmVersion: execFileSync("npm", ["--version"], { encoding: "utf8" }).trim(),
});
assertNoPendingPackageChangesets({ root });
const temporaryRoot = mkdtempSync(join(tmpdir(), "vanillasky-release-dry-run-"));
const requestedOutput = process.env.VANILLASKY_RELEASE_OUTPUT_DIR;
const outputDirectory = requestedOutput ? resolve(requestedOutput) : join(temporaryRoot, "release-assets");
const consumerResults = {};
let releaseNpmGuard;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function run(command, args, { environment, resultName } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...releaseNpmGuard.environment, ...environment },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
  if (resultName) consumerResults[resultName] = "passed";
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

function hashTree(directory) {
  const hash = createHash("sha256");
  const visit = (current, prefix = "") => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(current, entry.name);
      hash.update(entry.isDirectory() ? `directory:${path}\0` : `file:${path}\0`);
      if (entry.isDirectory()) visit(absolute, path);
      else hash.update(readFileSync(absolute));
    }
  };
  visit(directory);
  return hash.digest("hex");
}

function verifySourceCoherence() {
  const packageManifest = readJson(join(root, "package.json"));
  const packageLock = readJson(join(root, "package-lock.json"));
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const publicApi = readFileSync(join(root, "PUBLIC-API.md"), "utf8");
  const releaseTag = `v${packageManifest.version}`;
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const dirtyStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const allowDirty = !ciMode && process.env.VANILLASKY_ALLOW_DIRTY_RELEASE === "1";
  if (dirtyStatus && !allowDirty) {
    throw new Error("Release source must be a clean committed tree");
  }

  assertEqual(packageManifest.name, expectedPackage, "package name");
  assertValidSemver(packageManifest.version);
  assertEqual(packageManifest.packageManager, `npm@${expectedNpm}`, "package manager");
  assertEqual(packageManifest.license, "Apache-2.0", "package license");
  assertEqual(packageManifest.repository?.url, "git+https://github.com/VanillaSkyAi/video.git", "package repository");
  assertEqual(packageLock.name, packageManifest.name, "lockfile package name");
  assertEqual(packageLock.version, packageManifest.version, "lockfile package version");
  assertEqual(packageLock.packages?.[""]?.name, packageManifest.name, "lockfile root package name");
  assertEqual(packageLock.packages?.[""]?.version, packageManifest.version, "lockfile root package version");
  assertEqual(execFileSync("npm", ["--version"], {
    encoding: "utf8",
    env: { ...process.env, ...releaseNpmGuard.environment },
  }).trim(), expectedNpm, "npm CLI version");

  const releaseNotes = extractChangesetReleaseNotes(changelog, packageManifest.version);
  if (!/compatib/i.test(publicApi) || !/Patch releases preserve/.test(publicApi)) {
    throw new Error("PUBLIC-API.md must contain the 0.x compatibility statement");
  }
  if (!readme.includes(`npm install ${packageManifest.name}@${packageManifest.version}`)) {
    throw new Error("README install command must pin the exact candidate version");
  }
  if (!readme.includes(`Version ${packageManifest.version} beta`) || !readme.includes("Status: Beta")) {
    throw new Error("README badge and status must identify the exact beta version");
  }
  for (const example of ["react-vite", "server-integrations", "nextjs-quickstart"]) {
    const manifest = readJson(join(root, "examples", example, "package.json"));
    assertEqual(manifest.dependencies?.[packageManifest.name], packageManifest.version, `${example} SDK dependency`);
  }

  let tagType = "pending-annotated";
  let approvedBranch = "local-head";
  let repository = expectedRepository;
  if (ciMode) {
    repository = process.env.GITHUB_REPOSITORY;
    assertEqual(repository, expectedRepository, "GitHub repository");
    assertEqual(process.env.VANILLASKY_RELEASE_MODE, "tag", "release mode");
    assertEqual(process.env.GITHUB_REF_TYPE, "tag", "GitHub ref type");
    assertEqual(process.env.GITHUB_REF_NAME, releaseTag, "Git tag");
    tagType = execFileSync("git", ["cat-file", "-t", `refs/tags/${releaseTag}`], { cwd: root, encoding: "utf8" }).trim();
    assertEqual(tagType, "tag", "Git tag object type");
    const tagCommit = execFileSync("git", ["rev-parse", `refs/tags/${releaseTag}^{commit}`], { cwd: root, encoding: "utf8" }).trim();
    assertEqual(tagCommit, sourceCommit, "annotated tag commit");
    approvedBranch = process.env.VANILLASKY_APPROVED_BRANCH ?? "origin/main";
    const approvedCommit = execFileSync("git", ["rev-parse", approvedBranch], { cwd: root, encoding: "utf8" }).trim();
    assertEqual(sourceCommit, approvedCommit, "release commit on approved branch");
  }

  return {
    packageManifest,
    releaseNotes,
    sourceIdentity: {
      approvedBranch,
      ancestryStatus: ciMode ? "verified" : "pending",
      ancestryVerified: ciMode,
      commit: sourceCommit,
      repository,
      tag: releaseTag,
      tagType,
      workingTree: dirtyStatus ? "dirty-development" : "clean",
    },
    coherence: {
      changelog: true,
      compatibility: true,
      examples: true,
      packageLock: true,
      readme: true,
      repository: true,
      releaseNotes: true,
    },
  };
}

function writeGitHubOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n");
  writeFileSync(process.env.GITHUB_OUTPUT, `${lines}\n`, { flag: "a" });
}

let keepOutput = Boolean(requestedOutput);
try {
  releaseNpmGuard = createReleaseNpmGuard({ workspace: temporaryRoot });
  const source = verifySourceCoherence();
  if (requestedOutput && existsSync(outputDirectory)) {
    throw new Error("VANILLASKY_RELEASE_OUTPUT_DIR must name a new directory");
  }
  mkdirSync(outputDirectory, { recursive: true });

  if (!manifestOnly) {
    for (const [resultName, npmScript] of [
      ["registry", "registry:check"],
      ["lint", "lint"],
      ["types", "typecheck"],
      ["tests", "test"],
      ["replay", "acceptance:replay"],
    ]) run("npm", ["run", npmScript], { resultName });
    run("npm", ["audit", "--audit-level=low"], { resultName: "dependencyAudit" });
  }

  run("npm", ["run", "build"], { resultName: "build" });
  const [packed] = parseNpmPackJson(execFileSync("npm", [
    "pack", "--silent", "--json", "--ignore-scripts", "--pack-destination", outputDirectory,
  ], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...releaseNpmGuard.environment },
  }));
  assertEqual(packed.name, source.packageManifest.name, "packed package name");
  assertEqual(packed.version, source.packageManifest.version, "packed package version");
  const tarball = join(outputDirectory, packed.filename);
  const sha256 = calculateFileSha256(tarball);
  const hashes = assertFileHashes(tarball, { sha512: packed.integrity, sha256 });
  const artifactEnvironment = {
    VANILLASKY_CANDIDATE_COMMIT: source.sourceIdentity.commit,
    VANILLASKY_PACKED_TARBALL: tarball,
    VANILLASKY_EXPECTED_INTEGRITY: hashes.sha512,
    VANILLASKY_EXPECTED_SHA256: hashes.sha256,
    VANILLASKY_PROVIDER_EVIDENCE_PATH: join(outputDirectory, "provider-evidence.json"),
  };

  if (!manifestOnly) {
    for (const [resultName, npmScript] of [
      ["publicApi", "verify:api"],
      ["packedPackage", "verify:package"],
      ["packageSize", "verify:package-size"],
      ["vite", "verify:onboarding"],
      ["nextjs", "verify:nextjs"],
      ["documentedExamples", "examples:verify-documented"],
      ["exampleInstall", "examples:install-current"],
      ["viteBuild", "example:build"],
      ["serverTypes", "server-examples:typecheck"],
      ["providerCompatibility", "server-examples:compat"],
    ]) run("npm", ["run", npmScript], { environment: artifactEnvironment, resultName });
    const browserArguments = ciMode
      ? ["run", "browser:test", "--", "--project=chromium"]
      : ["run", "browser:test"];
    run("npm", browserArguments, { environment: artifactEnvironment, resultName: "browsers" });
  }
  releaseNpmGuard.assertComplete();

  const releaseNotesPath = join(outputDirectory, "RELEASE_NOTES.md");
  writeFileSync(releaseNotesPath, `# ${source.packageManifest.name} ${source.sourceIdentity.tag}\n\n${source.releaseNotes}\n`);
  const providerCompatibility = readJson(join(root, "tests", "fixtures", "provider-compatibility-locks.json"));
  const manifest = createDeterministicReleaseManifest({
    schemaVersion: 1,
    artifact: {
      filename: basename(tarball),
      fileCount: packed.entryCount,
      sha256: hashes.sha256,
      sha512: hashes.sha512,
      size: statSync(tarball).size,
      unpackedSize: packed.unpackedSize,
    },
    coherence: source.coherence,
    consumers: consumerResults,
    generatedTrees: {
      registrySha256: hashTree(join(root, "registry")),
    },
    package: {
      dependencies: source.packageManifest.dependencies,
      exports: source.packageManifest.exports,
      license: source.packageManifest.license,
      name: source.packageManifest.name,
      npm: expectedNpm,
      peerDependencies: source.packageManifest.peerDependencies,
      repository: expectedRepository,
      version: source.packageManifest.version,
    },
    providerCompatibility,
    publicActions: "none-dry-run",
    source: source.sourceIdentity,
    websiteHandoff: {
      expectedPackage: source.packageManifest.name,
      expectedVersion: source.packageManifest.version,
      status: "held-until-publish-and-final-approval",
    },
  });
  const manifestPath = join(outputDirectory, "release-manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const relativeArtifact = relative(root, tarball);
  const relativeManifest = relative(root, manifestPath);
  const relativeNotes = relative(root, releaseNotesPath);
  writeGitHubOutputs({
    artifact: relativeArtifact,
    filename: basename(tarball),
    integrity: hashes.sha512,
    manifest: relativeManifest,
    name: source.packageManifest.name,
    notes: relativeNotes,
    prerelease: isPrereleaseSemver(source.packageManifest.version) ? "true" : "false",
    sha256: hashes.sha256,
    version: source.packageManifest.version,
  });
  console.log(JSON.stringify(manifest, null, 2));
  console.log(`Release dry run passed with one immutable ${basename(tarball)} artifact.`);
} catch (error) {
  keepOutput = false;
  throw error;
} finally {
  if (!keepOutput && existsSync(outputDirectory)) {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
}
