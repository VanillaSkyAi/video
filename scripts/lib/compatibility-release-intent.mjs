import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function pendingChangesetIntent(root, packageName, baseSha) {
  if (baseSha === undefined) return undefined;
  if (!/^[0-9a-f]{40}$/.test(baseSha)) {
    throw new Error("Compatibility feature base must be a full 40-character Git SHA");
  }
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", baseSha, "HEAD"], {
      cwd: root,
      stdio: "pipe",
    });
  } catch {
    throw new Error(`Compatibility feature base ${baseSha} must be an ancestor of HEAD`);
  }
  const addedPaths = git(root, [
    "diff", "--name-only", "--diff-filter=A", `${baseSha}...HEAD`, "--", ".changeset/*.md",
  ]).split("\n").filter((path) =>
    path !== ".changeset/README.md" && /^\.changeset\/[^/]+\.md$/.test(path));
  const changesets = addedPaths
    .map((source) => {
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
  const lines = readFileSync(path, "utf8").replaceAll("\r\n", "\n").split("\n");
  const candidateHeading = `## ${candidateVersion}`;
  let bodyStart;
  let bodyEnd = lines.length;
  let outerFence;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (outerFence) {
      if (isFenceClosing(line, outerFence)) outerFence = undefined;
      continue;
    }
    const opening = fenceOpening(line);
    if (opening) {
      outerFence = opening;
      continue;
    }
    if (bodyStart === undefined) {
      if (line.trimEnd() === candidateHeading) bodyStart = index + 1;
      continue;
    }
    if (/^##\s+/.test(line)) {
      bodyEnd = index;
      break;
    }
  }
  if (bodyStart === undefined) return undefined;
  const section = lines.slice(bodyStart, bodyEnd);
  while (section[0]?.trim() === "") section.shift();
  while (section.at(-1)?.trim() === "") section.pop();
  return section.join("\n");
}

function canonicalMinorChangelogEvidence(section, source) {
  const lines = section.split("\n");
  const evidence = [];
  let inMinorChanges = false;
  let outerFence;
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (outerFence) {
      if (isFenceClosing(line, outerFence)) outerFence = undefined;
      index += 1;
      continue;
    }
    const opening = fenceOpening(line);
    if (opening) {
      outerFence = opening;
      inMinorChanges = false;
      index += 1;
      continue;
    }
    if (/^###\s+/.test(line)) {
      inMinorChanges = line === "### Minor Changes";
      index += 1;
      continue;
    }
    if (!inMinorChanges || !line.startsWith("- ")) {
      index += 1;
      continue;
    }
    const body = [line.slice(2)];
    let canonical = true;
    index += 1;
    while (index < lines.length && !lines[index].startsWith("- ") && !/^###\s+/.test(lines[index])) {
      if (!lines[index].startsWith("  ")) canonical = false;
      else body.push(lines[index].slice(2));
      index += 1;
    }
    if (canonical) evidence.push({ source, body: body.join("\n") });
  }
  return evidence;
}

function isPlainSummary(line) {
  return line.length > 0
    && line === line.trim()
    && !/^(?:#{1,6}\s|>|[-+*]\s|\d+\.\s|`{3,}|~{3,}|---$)/.test(line);
}

function fenceOpening(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return undefined;
  return { marker: match[1][0], length: match[1].length };
}

function isFenceClosing(line, fence) {
  const escapedMarker = escapeRegExp(fence.marker);
  return new RegExp(`^ {0,3}${escapedMarker}{${fence.length},}\\s*$`).test(line);
}

function isConcreteCode(lines) {
  const code = lines.join("\n").trim();
  return code.length >= 4 && !/^(?:\.\.\.|todo|tbd|before|after)$/i.test(code);
}

function hasStructuredBreakingEvidence(markdown) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  if (!isPlainSummary(lines[0] ?? "") || lines[1]?.trim() !== "") return false;

  let phase = "introduction";
  let fence;
  const codeFences = { breaking: 0, adoption: 0 };
  for (const line of lines.slice(2)) {
    if (fence) {
      if (/^ {0,3}### (?:Breaking changes|Adoption)$/.test(line)) return false;
      if (isFenceClosing(line, fence)) {
        if (!isConcreteCode(fence.code)) return false;
        codeFences[fence.phase] += 1;
        fence = undefined;
      } else {
        fence.code.push(line);
      }
      continue;
    }

    const opening = fenceOpening(line);
    if (opening) {
      if (phase !== "breaking" && phase !== "adoption") return false;
      fence = { ...opening, phase, code: [] };
      continue;
    }

    if (/^#{1,6}(?:\s|$)/.test(line)) {
      if (line === "### Breaking changes" && phase === "introduction") {
        phase = "breaking";
        continue;
      }
      if (line === "### Adoption" && phase === "breaking" && codeFences.breaking === 1) {
        phase = "adoption";
        continue;
      }
      return false;
    }
  }
  return fence === undefined
    && phase === "adoption"
    && codeFences.breaking === 1
    && codeFences.adoption === 1;
}

export function findBreakingChangeEvidence(releaseIntent) {
  if (releaseIntent?.releaseType !== "minor") return undefined;
  for (const evidence of releaseIntent.evidence ?? []) {
    if (hasStructuredBreakingEvidence(evidence.body)) return evidence.source;
  }
  return undefined;
}

export function readCompatibilityReleaseIntent({
  root,
  packageName,
  baselineVersion,
  candidateVersion,
  baseSha,
}) {
  const repositoryRoot = resolve(root);
  const comparison = compareSemver(candidateVersion, baselineVersion);
  if (comparison === 0) return pendingChangesetIntent(repositoryRoot, packageName, baseSha);

  const releaseType = versionReleaseType(baselineVersion, candidateVersion);
  const body = changelogSection(repositoryRoot, candidateVersion);
  const source = `CHANGELOG.md#${candidateVersion}`;
  return {
    releaseType,
    evidence: body && releaseType === "minor"
      ? canonicalMinorChangelogEvidence(body, source)
      : [],
  };
}
