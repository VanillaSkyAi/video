import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fromMarkdown } from "mdast-util-from-markdown";
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

function markdownText(node) {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(markdownText).join("");
}

function isHeading(node, depth, text) {
  return node.type === "heading" && node.depth === depth && markdownText(node) === text;
}

function sectionEnd(children, start, maximumHeadingDepth) {
  const nextHeading = children.findIndex((node, index) =>
    index >= start && node.type === "heading" && node.depth <= maximumHeadingDepth);
  return nextHeading === -1 ? children.length : nextHeading;
}

function codeFence(value) {
  const backticks = Math.max(0, ...Array.from(value.matchAll(/`+/g), (match) => match[0].length));
  const tildes = Math.max(0, ...Array.from(value.matchAll(/~+/g), (match) => match[0].length));
  const marker = backticks <= tildes ? "`" : "~";
  return marker.repeat(Math.max(3, (marker === "`" ? backticks : tildes) + 1));
}

function isFencedCodeNode(node, markdown) {
  const offset = node.position?.start.offset;
  if (offset === undefined) return false;
  const lineEnd = markdown.indexOf("\n", offset);
  const openingLine = markdown.slice(offset, lineEnd === -1 ? markdown.length : lineEnd);
  return fenceOpening(openingLine) !== undefined;
}

function canonicalEvidenceBody(listItem, markdown) {
  if (listItem.type !== "listItem" || listItem.children.length === 0) return undefined;
  const [summary, ...details] = listItem.children;
  if (summary.type !== "paragraph"
    || summary.position?.start.line !== summary.position?.end.line) return undefined;
  const summaryText = markdownText(summary);
  if (!isPlainSummary(summaryText)) return undefined;

  let phase = "introduction";
  const codeFences = { breaking: 0, adoption: 0 };
  const body = [summaryText, ""];
  for (const node of details) {
    if (node.type === "heading") {
      const heading = markdownText(node);
      if (node.depth === 3 && heading === "Breaking changes" && phase === "introduction") {
        phase = "breaking";
      } else if (node.depth === 3 && heading === "Adoption"
        && phase === "breaking" && codeFences.breaking === 1) {
        phase = "adoption";
      } else {
        return undefined;
      }
      body.push(`### ${heading}`);
      continue;
    }
    if (node.type === "code") {
      if (phase !== "breaking" && phase !== "adoption") return undefined;
      if (!isFencedCodeNode(node, markdown)
        || !isConcreteCode([node.value]) || codeFences[phase] !== 0) return undefined;
      codeFences[phase] += 1;
      const fence = codeFence(node.value);
      body.push(fence, node.value, fence);
      continue;
    }
    if (node.type !== "paragraph") return undefined;
    body.push(markdownText(node));
  }
  if (phase !== "adoption" || codeFences.breaking !== 1 || codeFences.adoption !== 1) {
    return undefined;
  }
  return body.join("\n");
}

function canonicalMinorChangelogEvidence(root, candidateVersion, source) {
  const path = join(root, "CHANGELOG.md");
  if (!existsSync(path)) return [];
  const markdown = readFileSync(path, "utf8");
  const { children } = fromMarkdown(markdown);
  const candidateIndex = children.findIndex((node) => isHeading(node, 2, candidateVersion));
  if (candidateIndex === -1) return [];
  const candidateEnd = sectionEnd(children, candidateIndex + 1, 2);
  const evidence = [];
  for (let index = candidateIndex + 1; index < candidateEnd; index += 1) {
    if (!isHeading(children[index], 3, "Minor Changes")) continue;
    const groupEnd = Math.min(sectionEnd(children, index + 1, 3), candidateEnd);
    for (const node of children.slice(index + 1, groupEnd)) {
      if (node.type !== "list" || node.ordered) continue;
      for (const listItem of node.children) {
        const body = canonicalEvidenceBody(listItem, markdown);
        if (body) evidence.push({ source, body });
      }
    }
    index = groupEnd - 1;
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
  const source = `CHANGELOG.md#${candidateVersion}`;
  return {
    releaseType,
    evidence: releaseType === "minor"
      ? canonicalMinorChangelogEvidence(repositoryRoot, candidateVersion, source)
      : [],
  };
}
