#!/usr/bin/env node

// Builds and packs the release artifact for an annotated tag on main.
// CI has already run lint, types, tests, and consumer verification on the
// commit this tag points at, so this script only proves that the tag, the
// source tree, and the packed tarball agree — it does not re-run the suite.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseNpmPackJson } from "./lib/parse-npm-pack-json.mjs";
import {
  assertFileHashes,
  assertValidSemver,
  calculateFileSha256,
  createDeterministicReleaseManifest,
  isPrereleaseSemver,
} from "./lib/release-integrity.mjs";
import { assertReleaseToolchain } from "./lib/release-toolchain.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const expectedRepository = "VanillaSkyAi/video";
const expectedPackage = "@vanillaskyai/video";
const expectedNpm = "11.17.0";
const ciMode = process.argv.includes("--ci");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

function releaseNotesFor(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) throw new Error(`CHANGELOG.md has no "## ${version}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const notes = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  if (!notes) throw new Error(`CHANGELOG.md section for ${version} is empty`);
  return notes;
}

function verifySource() {
  const packageManifest = readJson(join(root, "package.json"));
  const packageLock = readJson(join(root, "package-lock.json"));
  const version = packageManifest.version;
  const releaseTag = `v${version}`;

  if (git("status", "--porcelain", "--untracked-files=all")) {
    throw new Error("Release source must be a clean committed tree");
  }

  assertEqual(packageManifest.name, expectedPackage, "package name");
  assertValidSemver(version);
  assertEqual(packageManifest.packageManager, `npm@${expectedNpm}`, "package manager");
  assertEqual(packageManifest.license, "Apache-2.0", "package license");
  assertEqual(packageLock.version, version, "lockfile package version");
  assertEqual(packageLock.packages?.[""]?.version, version, "lockfile root package version");

  // Every canonical surface pins the exact version (PUBLIC-API.md); a stale pin
  // is how the repository, npm, and the site drift into disagreeing.
  for (const path of ["README.md", "docs/getting-started.md", "docs/integrate-nextjs.md", "skills/vanillasky/SKILL.md"]) {
    const source = readFileSync(join(root, path), "utf8");
    if (!source.includes(`npm install ${expectedPackage}@${version} `)) {
      throw new Error(`${path} must pin the install command to ${version}`);
    }
  }
  for (const path of ["README.md", "docs/getting-started.md", "docs/integrate-nextjs.md"]) {
    const source = readFileSync(join(root, path), "utf8");
    if (source.includes("/tree/main/examples/") || !source.includes(`/tree/${releaseTag}/examples/`)) {
      throw new Error(`${path} must link examples at ${releaseTag}`);
    }
  }
  for (const example of ["react-vite", "server-integrations", "nextjs-quickstart"]) {
    const manifest = readJson(join(root, "examples", example, "package.json"));
    assertEqual(manifest.dependencies?.[expectedPackage], version, `${example} SDK dependency`);
  }

  const releaseNotes = releaseNotesFor(readFileSync(join(root, "CHANGELOG.md"), "utf8"), version);
  const commit = git("rev-parse", "HEAD");
  let tagType = "pending-annotated";
  let approvedBranch = "local-head";

  if (ciMode) {
    assertEqual(process.env.GITHUB_REPOSITORY, expectedRepository, "GitHub repository");
    assertEqual(process.env.GITHUB_REF_TYPE, "tag", "GitHub ref type");
    assertEqual(process.env.GITHUB_REF_NAME, releaseTag, "Git tag");
    tagType = git("cat-file", "-t", `refs/tags/${releaseTag}`);
    assertEqual(tagType, "tag", "Git tag object type");
    assertEqual(git("rev-parse", `refs/tags/${releaseTag}^{commit}`), commit, "annotated tag commit");
    approvedBranch = process.env.VANILLASKY_APPROVED_BRANCH ?? "origin/main";
    assertEqual(commit, git("rev-parse", approvedBranch), "release commit on approved branch");
  }

  return {
    packageManifest,
    releaseNotes,
    sourceIdentity: {
      approvedBranch,
      ancestryVerified: ciMode,
      commit,
      repository: ciMode ? process.env.GITHUB_REPOSITORY : expectedRepository,
      tag: releaseTag,
      tagType,
    },
  };
}

function writeGitHubOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n");
  writeFileSync(process.env.GITHUB_OUTPUT, `${lines}\n`, { flag: "a" });
}

assertReleaseToolchain({
  nodeVersion: process.versions.node,
  npmVersion: execFileSync("npm", ["--version"], { encoding: "utf8" }).trim(),
});

const outputDirectory = resolve(process.env.VANILLASKY_RELEASE_OUTPUT_DIR ?? "release-assets");
if (existsSync(outputDirectory)) {
  throw new Error("VANILLASKY_RELEASE_OUTPUT_DIR must name a new directory");
}
const source = verifySource();
mkdirSync(outputDirectory, { recursive: true });

execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
const [packed] = parseNpmPackJson(execFileSync("npm", [
  "pack", "--silent", "--json", "--ignore-scripts", "--pack-destination", outputDirectory,
], { cwd: root, encoding: "utf8" }));
assertEqual(packed.name, source.packageManifest.name, "packed package name");
assertEqual(packed.version, source.packageManifest.version, "packed package version");

const tarball = join(outputDirectory, packed.filename);
const sha256 = calculateFileSha256(tarball);
const hashes = assertFileHashes(tarball, { sha512: packed.integrity, sha256 });

writeFileSync(
  join(outputDirectory, "RELEASE_NOTES.md"),
  `# ${source.packageManifest.name} ${source.sourceIdentity.tag}\n\n${source.releaseNotes}\n`,
);
const manifest = createDeterministicReleaseManifest({
  schemaVersion: 2,
  artifact: {
    filename: basename(tarball),
    fileCount: packed.entryCount,
    sha256: hashes.sha256,
    sha512: hashes.sha512,
    size: statSync(tarball).size,
    unpackedSize: packed.unpackedSize,
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
  source: source.sourceIdentity,
});
writeFileSync(join(outputDirectory, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

writeGitHubOutputs({
  filename: basename(tarball),
  integrity: hashes.sha512,
  name: source.packageManifest.name,
  prerelease: isPrereleaseSemver(source.packageManifest.version) ? "true" : "false",
  sha256: hashes.sha256,
  version: source.packageManifest.version,
});
console.log(`Packed ${basename(tarball)} for ${source.sourceIdentity.tag}.`);
