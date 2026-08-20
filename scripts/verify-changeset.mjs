#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const PACKAGE_NAME = "@vanillaskyai/video";
const RELEASE_TYPES = ["patch", "minor", "major"];
const PACKAGE_FILES = new Set([
  "CHANGELOG.md",
  "LICENSE",
  "PUBLIC-API.md",
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
  "tsup.config.ts",
]);
const PACKAGE_PREFIXES = [
  "bin/",
  "examples/custom-template/",
  "examples/nextjs-quickstart/",
  "registry/",
  "src/",
];

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function lines(value) {
  return value ? value.split("\n").filter(Boolean) : [];
}

function packageManifestSurface(manifest) {
  const surface = structuredClone(manifest);
  delete surface.devDependencies;
  delete surface.packageManager;
  delete surface.scripts;
  return surface;
}

function packageManifestChanged(root, baseRef) {
  const before = JSON.parse(git(root, ["show", `${baseRef}:package.json`]));
  const after = JSON.parse(git(root, ["show", "HEAD:package.json"]));
  return JSON.stringify(packageManifestSurface(before)) !== JSON.stringify(packageManifestSurface(after));
}

function isPackagePath(root, baseRef, path) {
  if (path === "package.json") return packageManifestChanged(root, baseRef);
  if (PACKAGE_FILES.has(path)) return true;
  if (PACKAGE_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (!path.startsWith("docs/")) return false;
  const relative = path.slice("docs/".length);
  return !relative.includes("/") || relative.startsWith("reference/");
}

function parseChangeset(path, contents) {
  const normalized = contents.replaceAll("\r\n", "\n");
  const frontmatterStart = "---\n";
  const frontmatterEnd = normalized.indexOf("---\n", frontmatterStart.length);
  if (!normalized.startsWith(frontmatterStart) || frontmatterEnd < 0) {
    throw new Error(`Changeset ${path} must contain valid YAML frontmatter`);
  }
  const frontmatter = normalized.slice(frontmatterStart.length, frontmatterEnd);
  const body = normalized.slice(frontmatterEnd + frontmatterStart.length);
  if (!body.trim()) throw new Error(`Changeset ${path} must explain the change`);

  const releases = [];
  for (const rawLine of frontmatter.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const release = /^(?:"([^"]+)"|'([^']+)'|([^:]+)):\s*(patch|minor|major)\s*$/.exec(line);
    if (!release) throw new Error(`Changeset ${path} contains an invalid package release declaration`);
    const name = (release[1] ?? release[2] ?? release[3]).trim();
    if (name !== PACKAGE_NAME) throw new Error(`Changeset ${path} names unsupported package ${name}`);
    releases.push(release[4]);
  }
  return releases;
}

export function verifyChangesetGovernance({
  root,
  baseRef = process.env.CHANGESET_BASE_REF ?? "origin/main",
  headBranch = process.env.CHANGESET_HEAD_BRANCH,
} = {}) {
  const repositoryRoot = resolve(root ?? fileURLToPath(new URL("..", import.meta.url)));
  const branch = headBranch || git(repositoryRoot, ["branch", "--show-current"]);
  if (branch.startsWith("changeset-release/")) {
    return { exempt: true, reason: "version-packages-branch" };
  }

  const comparison = `${baseRef}...HEAD`;
  const changedPaths = lines(git(repositoryRoot, ["diff", "--name-only", "--diff-filter=ACMR", comparison]));
  const changesets = lines(
    git(repositoryRoot, ["diff", "--name-only", "--diff-filter=A", comparison, "--", ".changeset/*.md"]),
  ).filter((path) => path !== ".changeset/README.md" && /^\.changeset\/[^/]+\.md$/.test(path));
  if (changesets.length === 0) {
    throw new Error("Every pull request must add a new changeset; use `npm run changeset` or `npm run changeset -- --empty`");
  }

  const releaseTypes = changesets.flatMap((path) => parseChangeset(path, readFileSync(resolve(repositoryRoot, path), "utf8")));
  const packageAffecting = changedPaths.some((path) => isPackagePath(repositoryRoot, baseRef, path));
  if (packageAffecting && releaseTypes.length === 0) {
    throw new Error(`Package changes require ${PACKAGE_NAME} to declare patch, minor, or major in a changeset`);
  }
  const releaseType = releaseTypes.sort((left, right) => RELEASE_TYPES.indexOf(right) - RELEASE_TYPES.indexOf(left))[0] ?? null;
  return { changesets, packageAffecting, releaseType };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = verifyChangesetGovernance({});
    if (result.exempt) console.log("Changeset governance skipped for a generated Version Packages branch.");
    else console.log(`Changeset governance passed with ${result.changesets.length} new changeset(s).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
