#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseChangesetFile } from "@changesets/parse";
import {
  CANONICAL_REPOSITORY,
  VERSION_PACKAGES_BRANCH,
  verifyVersionPackagesPullRequest,
} from "./lib/version-packages.mjs";

const PACKAGE_NAME = "@vanillaskyai/video";
const RELEASE_TYPES = ["patch", "minor", "major"];
const REPOSITORY_ONLY_SCRIPTS = new Set([
  "acceptance:live",
  "acceptance:review",
  "acceptance:replay",
  "browser:install",
  "browser:test",
  "catalog:check",
  "catalog:sync",
  "changeset",
  "changeset:check",
  "changeset:status",
  "example:build",
  "example:dev",
  "example:install",
  "example:preview",
  "examples:install-current",
  "examples:verify-documented",
  "lint",
  "registry:check",
  "registry:sync",
  "release:check",
  "release:dry-run",
  "release:preflight",
  "release:prepare",
  "server-examples:compat",
  "server-examples:typecheck",
  "template:check",
  "test",
  "test:watch",
  "typecheck",
  "verify:api",
  "verify:nextjs",
  "verify:onboarding",
  "verify:package",
  "verify:package-size",
  "verify:published",
  "verify:version-packages-pr",
  "version-packages:prepare",
]);
const PACKAGE_FILES = new Set([
  ".npmignore",
  "CHANGELOG.md",
  "LICENSE",
  "PUBLIC-API.md",
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
  "npm-shrinkwrap.json",
  "tsconfig.json",
  "tsup.config.ts",
]);
const PACKAGE_PREFIXES = [
  "bin/",
  "dist/",
  "examples/custom-template/",
  "examples/nextjs-quickstart/",
  "registry/",
  "src/",
];

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function packageManifestSurface(manifest) {
  const surface = structuredClone(manifest);
  delete surface.devDependencies;
  delete surface.packageManager;
  surface.scripts = Object.fromEntries(
    Object.entries(surface.scripts ?? {}).filter(([name]) => !REPOSITORY_ONLY_SCRIPTS.has(name)),
  );
  return surface;
}

function packageManifestChanged(root, baseRef) {
  let before;
  let after;
  try {
    before = JSON.parse(git(root, ["show", `${baseRef}:package.json`]));
    after = JSON.parse(git(root, ["show", "HEAD:package.json"]));
  } catch {
    return true;
  }
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

function parseNameStatus(output) {
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const changes = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const pathCount = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
    const paths = fields.slice(index, index + pathCount);
    if (!status || paths.length !== pathCount || paths.some((path) => !path)) {
      throw new Error("Git returned malformed NUL-delimited name-status output");
    }
    changes.push({ paths, status });
    index += pathCount;
  }
  return changes;
}

function isChangesetRecord(path) {
  return path !== ".changeset/README.md" && /^\.changeset\/[^/]+\.md$/.test(path);
}

function assertPendingChangesetsAreImmutable(changes) {
  const actions = new Map([
    ["D", "deleted"],
    ["M", "modified"],
    ["R", "renamed"],
    ["T", "modified"],
  ]);
  for (const change of changes) {
    const action = actions.get(change.status[0]);
    if (action && isChangesetRecord(change.paths[0])) {
      throw new Error(`Base-owned pending Changeset ${change.paths[0]} was ${action}; pending release records are immutable`);
    }
  }
}

function assertSummaryFormat(path, contents) {
  const normalized = contents.replaceAll("\r\n", "\n");
  const contentLines = normalized.split("\n");
  const frontmatterEnd = contentLines.findIndex((line, index) => index > 0 && line.trim() === "---");
  const bodyLines = contentLines.slice(frontmatterEnd + 1);
  while (bodyLines[0]?.trim() === "") bodyLines.shift();
  const summary = bodyLines[0]?.trim();
  if (!summary || /^#{1,6}(?:\s|$)/.test(summary)) {
    throw new Error(`Changeset ${path} must start its body with a one-line summary`);
  }
  if (bodyLines.length > 1 && bodyLines[1].trim() !== "") {
    throw new Error(`Changeset ${path} must put a blank line between its one-line summary and details`);
  }
}

function parseChangeset(path, contents) {
  let parsed;
  try {
    parsed = parseChangesetFile(contents);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Changeset ${path} failed official validation: ${detail}`, { cause: error });
  }
  assertSummaryFormat(path, contents);
  return parsed.releases.map((release) => {
    if (release.name !== PACKAGE_NAME) throw new Error(`Changeset ${path} names unsupported package ${release.name}`);
    if (!RELEASE_TYPES.includes(release.type)) {
      throw new Error(`Changeset ${path} contains invalid version type ${release.type} for ${PACKAGE_NAME}`);
    }
    return release.type;
  });
}

export function verifyChangesetGovernance({
  root,
  baseRef = process.env.CHANGESET_BASE_REF ?? "origin/main",
  headRef = process.env.CHANGESET_HEAD_REF ?? "HEAD",
  baseBranch = process.env.CHANGESET_BASE_BRANCH,
  baseRepository = process.env.CHANGESET_BASE_REPOSITORY,
  headBranch = process.env.CHANGESET_HEAD_BRANCH,
  headRepository = process.env.CHANGESET_HEAD_REPOSITORY,
  changesetsCliPath = process.env.CHANGESETS_CLI_PATH,
} = {}) {
  const repositoryRoot = resolve(root ?? fileURLToPath(new URL("..", import.meta.url)));
  const canonicalGeneratedBranch = headBranch === VERSION_PACKAGES_BRANCH
    && baseBranch === "main"
    && headRepository === CANONICAL_REPOSITORY
    && baseRepository === CANONICAL_REPOSITORY;
  if (canonicalGeneratedBranch) {
    const generated = verifyVersionPackagesPullRequest({
      root: repositoryRoot,
      baseRef,
      headRef,
      baseBranch,
      baseRepository,
      headBranch,
      headRepository,
      changesetsCliPath,
    });
    return { changesets: [], generated: true, packageAffecting: true, releaseType: null, version: generated.version };
  }
  const comparison = `${baseRef}...HEAD`;
  const changes = parseNameStatus(git(repositoryRoot, ["diff", "--name-status", "-z", "--find-renames", comparison]));
  assertPendingChangesetsAreImmutable(changes);
  const changedPaths = changes.flatMap((change) => change.paths);
  const changesets = changes
    .filter((change) => change.status === "A" && isChangesetRecord(change.paths[0]))
    .map((change) => change.paths[0]);
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
    console.log(`Changeset governance passed with ${result.changesets.length} new changeset(s).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
