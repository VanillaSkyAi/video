import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { compareSemver, parseSemver } from "./release-integrity.mjs";

const RELEASE_TYPE_RANK = { patch: 0, minor: 1, major: 2 };

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function versionReleaseType(baselineVersion, candidateVersion) {
  const baseline = parseSemver(baselineVersion);
  const candidate = parseSemver(candidateVersion);
  if (baseline.core[0] !== candidate.core[0]) return "major";
  if (baseline.core[1] !== candidate.core[1]) return "minor";
  return "patch";
}

function parseChangeset(source, packageName) {
  const match = /^---\s*\n([\s\S]*?)\n---(?:\s*\n)?([\s\S]*)$/.exec(source);
  if (!match) return undefined;
  const packageKey = `(?:["']${escapeRegExp(packageName)}["']|${escapeRegExp(packageName)})`;
  const release = new RegExp(`^\\s*${packageKey}\\s*:\\s*(patch|minor|major)\\s*$`, "m")
    .exec(match[1]);
  if (!release) return undefined;
  return { releaseType: release[1], body: match[2].trim() };
}

function pendingChangesetIntent(root, packageName) {
  const directory = join(root, ".changeset");
  if (!existsSync(directory)) return undefined;
  const changesets = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
    .map((entry) => {
      const source = `.changeset/${entry.name}`;
      const parsed = parseChangeset(readFileSync(join(root, source), "utf8"), packageName);
      return parsed ? { ...parsed, source } : undefined;
    })
    .filter(Boolean);
  if (changesets.length === 0) return undefined;
  const releaseType = changesets.reduce((highest, candidate) =>
    RELEASE_TYPE_RANK[candidate.releaseType] > RELEASE_TYPE_RANK[highest]
      ? candidate.releaseType
      : highest, "patch");
  return {
    releaseType,
    evidence: changesets
      .filter((changeset) => changeset.releaseType === releaseType)
      .map(({ source, body }) => ({ source, body })),
  };
}

function changelogSection(root, candidateVersion) {
  const path = join(root, "CHANGELOG.md");
  if (!existsSync(path)) return undefined;
  const changelog = readFileSync(path, "utf8");
  const escapedVersion = escapeRegExp(candidateVersion);
  const heading = new RegExp(`^##\\s+${escapedVersion}\\s*$`, "m").exec(changelog);
  if (!heading) return undefined;
  const bodyStart = heading.index + heading[0].length;
  const tail = changelog.slice(bodyStart);
  const nextHeading = tail.search(/^##\s+/m);
  return tail.slice(0, nextHeading < 0 ? undefined : nextHeading).trim();
}

function headingSection(markdown, heading) {
  const match = new RegExp(`^###\\s+${escapeRegExp(heading)}\\s*$`, "im").exec(markdown);
  if (!match) return undefined;
  const contentStart = match.index + match[0].length;
  const tail = markdown.slice(contentStart);
  const nextHeading = tail.search(/^#{1,3}\s+/m);
  return tail.slice(0, nextHeading < 0 ? undefined : nextHeading).trim();
}

function hasConcreteFencedCode(markdown) {
  if (!markdown) return false;
  const fences = /(```|~~~)[^\n]*\n([\s\S]*?)\n\1/g;
  for (const match of markdown.matchAll(fences)) {
    const code = match[2].trim();
    if (code.length >= 4 && !/^(?:\.\.\.|todo|tbd|before|after)$/i.test(code)) return true;
  }
  return false;
}

export function findBreakingChangeEvidence(releaseIntent) {
  if (releaseIntent?.releaseType !== "minor") return undefined;
  for (const evidence of releaseIntent.evidence ?? []) {
    const breaking = headingSection(evidence.body, "Breaking changes");
    const adoption = headingSection(evidence.body, "Adoption");
    if (hasConcreteFencedCode(breaking) && hasConcreteFencedCode(adoption)) return evidence.source;
  }
  return undefined;
}

export function readCompatibilityReleaseIntent({
  root,
  packageName,
  baselineVersion,
  candidateVersion,
}) {
  const repositoryRoot = resolve(root);
  const comparison = compareSemver(candidateVersion, baselineVersion);
  if (comparison === 0) return pendingChangesetIntent(repositoryRoot, packageName);

  const releaseType = versionReleaseType(baselineVersion, candidateVersion);
  const body = changelogSection(repositoryRoot, candidateVersion);
  return {
    releaseType,
    evidence: body
      ? [{ source: `CHANGELOG.md#${candidateVersion}`, body }]
      : [],
  };
}
