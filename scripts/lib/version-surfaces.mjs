import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const TEXT_VERSION_SURFACES = [
  "README.md",
  "PUBLIC-API.md",
  "docs/getting-started.md",
  "docs/integrate-nextjs.md",
  "skills/vanillasky/SKILL.md",
];

export const DEPENDENCY_MANIFESTS = [
  "examples/react-vite/package.json",
  "examples/server-integrations/package.json",
  "examples/nextjs-quickstart/package.json",
  "tests/fixtures/nextjs-provider-app/package.json",
];

export const UNRELEASED_PLACEHOLDER = "<!-- Add release notes here before running release:prepare. -->";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function restoreEmptyUnreleasedChangelog({ root, previousChangelog }) {
  const path = join(resolve(root), "CHANGELOG.md");
  const source = readFileSync(path, "utf8");
  const previousHeadings = [...previousChangelog.matchAll(/^## .+$/gm)];
  const previousUnreleased = [...previousChangelog.matchAll(/^## Unreleased[ \t]*$/gm)];
  if (previousUnreleased.length !== 1 || previousHeadings[0]?.index !== previousUnreleased[0].index) {
    throw new Error("CHANGELOG.md must begin its release headings with exactly one Unreleased section");
  }
  const previousHeading = previousUnreleased[0];
  const previousTail = previousChangelog.slice(previousHeading.index + previousHeading[0].length);
  const previousReleaseOffset = previousTail.search(/^## /m);
  if (previousReleaseOffset < 0) throw new Error("CHANGELOG.md must retain at least one prior release");
  const previousSectionEnd = previousHeading.index + previousHeading[0].length + previousReleaseOffset;
  const previousSectionContents = previousChangelog
    .slice(previousHeading.index + previousHeading[0].length, previousSectionEnd)
    .trim();
  if (previousSectionContents !== "" && previousSectionContents !== UNRELEASED_PLACEHOLDER) {
    throw new Error("CHANGELOG.md Unreleased section must be empty before Version Packages generation");
  }
  const previousPrefix = previousChangelog.slice(0, previousHeading.index).replace(/\s+$/, "");
  const previousReleases = previousChangelog.slice(previousSectionEnd).replace(/^\s+/, "");
  const title = /^# .+$/m.exec(previousPrefix);
  if (!title || title.index !== 0) throw new Error("CHANGELOG.md must begin with a title");
  const prelude = previousPrefix.slice(title[0].length).trim();

  const headings = [...source.matchAll(/^## .+$/gm)];
  const unreleased = [...source.matchAll(/^## Unreleased[ \t]*$/gm)];
  if (headings.length === 0 || headings[0][0].trim() === "## Unreleased") {
    throw new Error("Changesets must prepend a generated release heading");
  }
  if (unreleased.length > 1) throw new Error("CHANGELOG.md must contain at most one Unreleased section");
  if (source.slice(0, headings[0].index).trimEnd() !== title[0]) {
    throw new Error("Changesets changed the CHANGELOG.md title while versioning");
  }
  const stableReleaseIndex = source.lastIndexOf(previousReleases);
  if (stableReleaseIndex < 0 || source.slice(stableReleaseIndex) !== previousReleases) {
    throw new Error("Changesets changed existing CHANGELOG.md release notes while versioning");
  }

  const generatedEnd = unreleased.length === 1 ? unreleased[0].index : stableReleaseIndex;
  let generatedRelease = source.slice(headings[0].index, generatedEnd).trim();
  if (prelude.length > 0) {
    if (!generatedRelease.endsWith(prelude)) {
      throw new Error("Changesets did not preserve the CHANGELOG.md prelude while versioning");
    }
    generatedRelease = generatedRelease.slice(0, -prelude.length).trimEnd();
  }
  if (!generatedRelease.startsWith("## ")) throw new Error("Changesets did not generate release notes");

  if (unreleased.length === 1) {
    const heading = unreleased[0];
    const tail = source.slice(heading.index + heading[0].length);
    const nextHeadingOffset = tail.search(/^## /m);
    if (nextHeadingOffset < 0) throw new Error("CHANGELOG.md lost its prior releases while versioning");
    const sectionEnd = heading.index + heading[0].length + nextHeadingOffset;
    const sectionContents = source.slice(heading.index + heading[0].length, sectionEnd).trim();
    if (sectionContents !== "" && sectionContents !== UNRELEASED_PLACEHOLDER) {
      throw new Error("CHANGELOG.md Unreleased section contains notes that Version Packages must not overwrite");
    }
    if (source.slice(sectionEnd, stableReleaseIndex).trim() !== "") {
      throw new Error("Changesets added unexpected content before existing CHANGELOG.md releases");
    }
  } else if (generatedEnd !== stableReleaseIndex) {
    throw new Error("Changesets generated an unexpected CHANGELOG.md structure");
  }

  const canonicalSection = `## Unreleased\n\n${UNRELEASED_PLACEHOLDER}`;
  const updated = `${previousPrefix}\n\n${canonicalSection}\n\n${generatedRelease}\n\n${previousReleases}`;
  if (updated !== source) writeFileSync(path, updated);
}

export function synchronizeVersionSurfaces({ root, packageName, previousVersion, version }) {
  const repositoryRoot = resolve(root);
  const packageLockPath = join(repositoryRoot, "package-lock.json");
  const packageLock = readJson(packageLockPath);
  packageLock.version = version;
  if (packageLock.packages?.[""]) packageLock.packages[""].version = version;

  const updates = new Map([[packageLockPath, formatJson(packageLock)]]);
  for (const relativePath of TEXT_VERSION_SURFACES) {
    const path = join(repositoryRoot, relativePath);
    const source = readFileSync(path, "utf8");
    if (!source.includes(previousVersion)) {
      throw new Error(`${relativePath} does not contain current version ${previousVersion}`);
    }
    updates.set(path, previousVersion === version ? source : source.replaceAll(previousVersion, version));
  }
  for (const relativePath of DEPENDENCY_MANIFESTS) {
    const path = join(repositoryRoot, relativePath);
    const dependencyManifest = readJson(path);
    if (dependencyManifest.dependencies?.[packageName] !== previousVersion && previousVersion !== version) {
      throw new Error(`${relativePath} does not pin ${packageName}@${previousVersion}`);
    }
    dependencyManifest.dependencies[packageName] = version;
    updates.set(path, formatJson(dependencyManifest));
  }

  for (const [path, contents] of updates) writeFileSync(path, contents);
}
