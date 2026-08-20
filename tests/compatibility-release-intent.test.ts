import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findBreakingChangeEvidence,
  readCompatibilityReleaseIntent,
} from "../scripts/lib/compatibility-release-intent.mjs";

const fixtures: string[] = [];
const packageName = "@vanillaskyai/video";

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "vanillasky-compat-intent-"));
  fixtures.push(root);
  return root;
}

function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commit(root: string, message: string) {
  git(root, "add", "--all");
  git(root, "-c", "commit.gpgsign=false", "commit", "-m", message);
}

function gitFixtureRoot() {
  const root = fixtureRoot();
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "VanillaSky Test");
  git(root, "config", "user.email", "test@vanillasky.invalid");
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ name: packageName, version: "0.1.0" })}\n`);
  commit(root, "initial fixture");
  return root;
}

function validEvidenceBody() {
  return [
    "Remove the root parser export in favor of its server-scoped replacement.",
    "",
    "### Breaking changes",
    "Before:",
    "```ts",
    "oldApi();",
    "```",
    "",
    "### Adoption",
    "After:",
    "```ts",
    "newApi();",
    "```",
  ].join("\n");
}

function minorIntent(body: string) {
  return {
    releaseType: "minor" as const,
    evidence: [{ source: ".changeset/remove-root.md", body }],
  };
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("compatibility release intent", () => {
  it("reads future minor intent from a package-targeting Changeset on a feature PR", () => {
    const root = gitFixtureRoot();
    const baseSha = git(root, "rev-parse", "HEAD");
    mkdirSync(join(root, ".changeset"));
    writeFileSync(join(root, ".changeset", "remove-root.md"), [
      "---",
      `"${packageName}": minor`,
      "---",
      "",
      "Remove the root parser export in favor of its server-scoped replacement.",
      "",
      "### Breaking changes",
      "Before:",
      "```ts",
      "oldApi();",
      "```",
      "",
      "### Adoption",
      "After:",
      "```ts",
      "newApi();",
      "```",
      "",
    ].join("\n"));
    commit(root, "add breaking minor intent");

    expect(readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.1.0",
      baseSha,
    })).toEqual({
      releaseType: "minor",
      evidence: [{
        source: ".changeset/remove-root.md",
        body: expect.stringContaining("### Breaking changes"),
      }],
    });
  });

  it.each([
    {
      name: "HTML comment",
      opening: "<!--",
      closing: "-->",
    },
    {
      name: "HTML block",
      opening: "<div>",
      closing: "</div>",
    },
  ])("does not accept pending Changeset headings and fences inside an $name", ({ opening, closing }) => {
    const root = gitFixtureRoot();
    const baseSha = git(root, "rev-parse", "HEAD");
    mkdirSync(join(root, ".changeset"));
    writeFileSync(join(root, ".changeset", "hidden-evidence.md"), [
      "---",
      `"${packageName}": minor`,
      "---",
      "",
      "Remove the root parser export.",
      "",
      opening,
      "### Breaking changes",
      "Before:",
      "```ts",
      "oldApi();",
      "```",
      "### Adoption",
      "After:",
      "```ts",
      "newApi();",
      "```",
      closing,
      "",
    ].join("\n"));
    commit(root, "add hidden breaking evidence");

    const intent = readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.1.0",
      baseSha,
    });
    expect(intent).toMatchObject({ releaseType: "minor" });
    expect(findBreakingChangeEvidence(intent)).toBeUndefined();
  });

  it("does not treat a patch Changeset as future minor intent", () => {
    const root = gitFixtureRoot();
    const baseSha = git(root, "rev-parse", "HEAD");
    mkdirSync(join(root, ".changeset"));
    writeFileSync(join(root, ".changeset", "breaking-patch.md"), [
      "---",
      `"${packageName}": patch`,
      "---",
      "",
      "### Breaking changes",
      "```ts",
      "oldApi();",
      "```",
      "### Adoption",
      "```ts",
      "newApi();",
      "```",
    ].join("\n"));
    commit(root, "add patch intent");

    expect(readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.1.0",
      baseSha,
    })).toMatchObject({ releaseType: "patch" });
  });

  it("reads consumed Changeset evidence from the generated candidate changelog section", () => {
    const root = fixtureRoot();
    // Reproduced with @changesets/cli@3.0.1's configured `@changesets/cli/changelog` formatter.
    writeFileSync(join(root, "CHANGELOG.md"), [
      "# Changelog",
      "",
      "## 0.2.0-beta.0",
      "",
      "### Minor Changes",
      "",
      "- 1234567: Remove the root parser export in favor of its server-scoped replacement.",
      "  ",
      "  ### Breaking changes",
      "  Before:",
      "  ```ts",
      "  oldApi();",
      "  ```",
      "  ",
      "  ### Adoption",
      "  After:",
      "  ```ts",
      "  newApi();",
      "  ```",
      "",
      "## 0.1.0",
      "Initial release.",
    ].join("\n"));

    const intent = readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.2.0-beta.0",
    });
    expect(intent).toEqual({
      releaseType: "minor",
      evidence: [{
        source: "CHANGELOG.md#0.2.0-beta.0",
        body: expect.stringContaining("### Adoption"),
      }],
    });
    expect(findBreakingChangeEvidence(intent)).toBe("CHANGELOG.md#0.2.0-beta.0");
  });

  it("does not let a pending minor Changeset override an actual patch candidate", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, ".changeset"));
    writeFileSync(join(root, ".changeset", "future-minor.md"), [
      "---",
      `"${packageName}": minor`,
      "---",
      "",
      "### Breaking changes",
      "```ts",
      "oldApi();",
      "```",
      "### Adoption",
      "```ts",
      "newApi();",
      "```",
    ].join("\n"));
    writeFileSync(join(root, "CHANGELOG.md"), "# Changelog\n\n## 0.1.1\n\nPatch release.\n");

    expect(readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.1.1",
    })).toMatchObject({ releaseType: "patch" });
  });

  it("ignores a minor Changeset that was already present at the pull request base", () => {
    const root = gitFixtureRoot();
    mkdirSync(join(root, ".changeset"));
    writeFileSync(join(root, ".changeset", "old-minor.md"), [
      "---",
      `"${packageName}": minor`,
      "---",
      "",
      validEvidenceBody(),
    ].join("\n"));
    commit(root, "add earlier minor intent");
    const baseSha = git(root, "rev-parse", "HEAD");
    writeFileSync(join(root, "feature.ts"), "export const feature = true;\n");
    commit(root, "add later breaking feature");

    expect(readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.1.0",
      baseSha,
    })).toBeUndefined();
  });

  it("fails closed when feature intent has no pull request base SHA", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, ".changeset"));
    writeFileSync(join(root, ".changeset", "unscoped-minor.md"), [
      "---",
      `"${packageName}": minor`,
      "---",
      "",
      validEvidenceBody(),
    ].join("\n"));

    expect(readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.1.0",
    })).toBeUndefined();
  });

  it("rejects an unsafe feature base ref instead of passing it to Git", () => {
    const root = gitFixtureRoot();

    expect(() => readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.1.0",
      baseSha: "origin/main",
    })).toThrow(/full 40-character Git SHA/i);
  });

  it.each([
    ["0.1.0", "0.1.1-beta.0", "patch"],
    ["0.1.1-beta.0", "0.1.1-beta.1", "patch"],
    ["0.1.1-beta.1", "0.1.1", "patch"],
    ["0.1.0", "0.2.0-beta.0", "minor"],
  ])("classifies the prerelease transition %s -> %s as %s", (baselineVersion, candidateVersion, releaseType) => {
    const root = fixtureRoot();
    writeFileSync(join(root, "CHANGELOG.md"), `# Changelog\n\n## ${candidateVersion}\n\nCandidate.\n`);

    expect(readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion,
      candidateVersion,
    })).toMatchObject({ releaseType });
  });

  it("does not accept breaking evidence generated from a patch Changeset in a minor release", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "CHANGELOG.md"), [
      "# Changelog",
      "",
      "## 0.2.0",
      "",
      "### Patch Changes",
      "",
      ...validEvidenceBody().split("\n").map((line, index) => index === 0 ? `- ${line}` : `  ${line}`),
    ].join("\n"));
    const intent = readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.2.0",
    });

    expect(findBreakingChangeEvidence(intent)).toBeUndefined();
  });

  it.each([
    {
      name: "version and Minor Changes headings",
      lines: [
        "```md",
        "## 0.2.0",
        "### Minor Changes",
        "```",
      ],
    },
    {
      name: "Minor Changes heading",
      lines: [
        "## 0.2.0",
        "",
        "```md",
        "### Minor Changes",
        "```",
      ],
    },
  ])("does not discover $name inside an outer changelog fence", ({ lines }) => {
    const root = fixtureRoot();
    writeFileSync(join(root, "CHANGELOG.md"), [
      "# Changelog",
      "",
      ...lines,
      "- 1234567: Remove the root parser export.",
      "  ",
      ...validEvidenceBody().split("\n").slice(2).map((line) => `  ${line}`),
      "",
      "## 0.1.0",
      "Initial release.",
    ].join("\n"));
    const intent = readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.2.0",
    });

    expect(findBreakingChangeEvidence(intent)).toBeUndefined();
  });

  it.each([1, 2, 3])("does not discover outer changelog headings inside a %i-space CommonMark fence", (indent) => {
    const root = fixtureRoot();
    const spaces = " ".repeat(indent);
    writeFileSync(join(root, "CHANGELOG.md"), [
      "# Changelog",
      "",
      `${spaces}\`\`\`md`,
      "## 0.2.0",
      "### Minor Changes",
      `${spaces}\`\`\``,
      "- 1234567: Remove the root parser export.",
      "  ",
      ...validEvidenceBody().split("\n").slice(2).map((line) => `  ${line}`),
      "",
      "## 0.1.0",
      "Initial release.",
    ].join("\n"));
    const intent = readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.2.0",
    });

    expect(findBreakingChangeEvidence(intent)).toBeUndefined();
  });

  it.each([
    {
      name: "HTML comment",
      opening: "<!--",
      closing: "-->",
    },
    {
      name: "HTML block",
      opening: "<div>",
      closing: "</div>",
    },
  ])("does not discover candidate headings inside an outer $name", ({ opening, closing }) => {
    const root = fixtureRoot();
    writeFileSync(join(root, "CHANGELOG.md"), [
      "# Changelog",
      "",
      opening,
      "## 0.2.0",
      "### Minor Changes",
      closing,
      `- ${validEvidenceBody().split("\n")[0]}`,
      ...validEvidenceBody().split("\n").slice(1).map((line) => `  ${line}`),
      "",
      "## 0.1.0",
      "Initial release.",
    ].join("\n"));
    const intent = readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.2.0",
    });

    expect(findBreakingChangeEvidence(intent)).toBeUndefined();
  });

  it.each([
    {
      name: "HTML comment",
      opening: "<!--",
      closing: "-->",
    },
    {
      name: "HTML block",
      opening: "<div>",
      closing: "</div>",
    },
  ])("does not discover a Minor Changes group inside an outer $name", ({ opening, closing }) => {
    const root = fixtureRoot();
    writeFileSync(join(root, "CHANGELOG.md"), [
      "# Changelog",
      "",
      "## 0.2.0",
      "",
      opening,
      "### Minor Changes",
      closing,
      `- ${validEvidenceBody().split("\n")[0]}`,
      ...validEvidenceBody().split("\n").slice(1).map((line) => `  ${line}`),
    ].join("\n"));
    const intent = readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.2.0",
    });

    expect(findBreakingChangeEvidence(intent)).toBeUndefined();
  });

  it.each([
    {
      name: "HTML comment",
      opening: "<!--",
      closing: "-->",
    },
    {
      name: "HTML block",
      opening: "<div>",
      closing: "</div>",
    },
  ])("does not discover breaking evidence boundaries inside an $name", ({ opening, closing }) => {
    const root = fixtureRoot();
    writeFileSync(join(root, "CHANGELOG.md"), [
      "# Changelog",
      "",
      "## 0.2.0",
      "",
      "### Minor Changes",
      "",
      `- ${validEvidenceBody().split("\n")[0]}`,
      "  ",
      `  ${opening}`,
      ...validEvidenceBody().split("\n").slice(2).map((line) => `  ${line}`),
      `  ${closing}`,
    ].join("\n"));
    const intent = readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.2.0",
    });

    expect(findBreakingChangeEvidence(intent)).toBeUndefined();
  });

  it("does not turn indented changelog code blocks into fenced adoption examples", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "CHANGELOG.md"), [
      "# Changelog",
      "",
      "## 0.2.0",
      "",
      "### Minor Changes",
      "",
      "- Remove the root parser export.",
      "  ",
      "  ### Breaking changes",
      "  Before:",
      "",
      "      oldApi();",
      "  ",
      "  ### Adoption",
      "  After:",
      "",
      "      newApi();",
    ].join("\n"));
    const intent = readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.2.0",
    });

    expect(findBreakingChangeEvidence(intent)).toBeUndefined();
  });

  it("treats four leading spaces as indented code rather than an outer fence", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "CHANGELOG.md"), [
      "# Changelog",
      "",
      "    ```md",
      "## 0.2.0",
      "",
      "### Minor Changes",
      "",
      `- ${validEvidenceBody().split("\n")[0]}`,
      ...validEvidenceBody().split("\n").slice(1).map((line) => `  ${line}`),
    ].join("\n"));
    const intent = readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.2.0",
    });

    expect(findBreakingChangeEvidence(intent)).toBe("CHANGELOG.md#0.2.0");
  });

  it("requires one plain summary line followed by a blank line", () => {
    const summaryless = validEvidenceBody().split("\n").slice(2).join("\n");
    const missingBlank = validEvidenceBody().replace("\n\n### Breaking changes", "\n### Breaking changes");
    const twoLineSummary = validEvidenceBody().replace(
      "\n\n### Breaking changes",
      "\nA second summary line.\n\n### Breaking changes",
    );

    expect(findBreakingChangeEvidence(minorIntent(summaryless))).toBeUndefined();
    expect(findBreakingChangeEvidence(minorIntent(missingBlank))).toBeUndefined();
    expect(findBreakingChangeEvidence(minorIntent(twoLineSummary))).toBeUndefined();
  });

  it("requires exact ordered evidence headings outside code fences", () => {
    const reversed = validEvidenceBody()
      .replace("### Breaking changes", "### TEMP")
      .replace("### Adoption", "### Breaking changes")
      .replace("### TEMP", "### Adoption");
    const wrongCase = validEvidenceBody().replace("### Breaking changes", "### Breaking Changes");
    const requiredHeadingInsideFence = validEvidenceBody().replace(
      "oldApi();\n```",
      "oldApi();\n### Adoption\n```",
    );
    const fencedHeadings = [
      "Remove the root parser export.",
      "",
      "~~~md",
      "### Breaking changes",
      "```ts",
      "oldApi();",
      "```",
      "### Adoption",
      "```ts",
      "newApi();",
      "```",
      "~~~",
    ].join("\n");

    expect(findBreakingChangeEvidence(minorIntent(reversed))).toBeUndefined();
    expect(findBreakingChangeEvidence(minorIntent(wrongCase))).toBeUndefined();
    expect(findBreakingChangeEvidence(minorIntent(requiredHeadingInsideFence))).toBeUndefined();
    expect(findBreakingChangeEvidence(minorIntent(fencedHeadings))).toBeUndefined();
  });

  it("requires exactly the before fence in Breaking changes and after fence in Adoption", () => {
    const fenceBeforeHeadings = validEvidenceBody().replace(
      "\n\n### Breaking changes",
      "\n\n```ts\nunrelated();\n```\n\n### Breaking changes",
    );
    const bothFencesInBreaking = [
      "Remove the root parser export.",
      "",
      "### Breaking changes",
      "```ts",
      "oldApi();",
      "```",
      "```ts",
      "newApi();",
      "```",
      "### Adoption",
      "Adopt newApi().",
    ].join("\n");

    expect(findBreakingChangeEvidence(minorIntent(fenceBeforeHeadings))).toBeUndefined();
    expect(findBreakingChangeEvidence(minorIntent(bothFencesInBreaking))).toBeUndefined();
  });

  it.each([1, 2, 3])("accepts concrete examples in a %i-space CommonMark fence", (indent) => {
    const spaces = " ".repeat(indent);
    const body = validEvidenceBody().replaceAll("```", `${spaces}\`\`\``);

    expect(findBreakingChangeEvidence(minorIntent(body))).toBe(".changeset/remove-root.md");
  });

  it("does not treat four-space indented markers as fenced examples", () => {
    const body = validEvidenceBody().replaceAll("```", "    ```");

    expect(findBreakingChangeEvidence(minorIntent(body))).toBeUndefined();
  });
});
