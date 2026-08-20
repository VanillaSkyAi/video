import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCompatibilityReleaseIntent } from "../scripts/lib/compatibility-release-intent.mjs";

const fixtures: string[] = [];
const packageName = "@vanillaskyai/video";

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "vanillasky-compat-intent-"));
  fixtures.push(root);
  return root;
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("compatibility release intent", () => {
  it("reads future minor intent from a package-targeting Changeset on a feature PR", () => {
    const root = fixtureRoot();
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

    expect(readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.1.0",
    })).toEqual({
      releaseType: "minor",
      evidence: [{
        source: ".changeset/remove-root.md",
        body: expect.stringContaining("### Breaking changes"),
      }],
    });
  });

  it("does not treat a patch Changeset as future minor intent", () => {
    const root = fixtureRoot();
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

    expect(readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.1.0",
    })).toMatchObject({ releaseType: "patch" });
  });

  it("reads consumed Changeset evidence from the generated candidate changelog section", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "CHANGELOG.md"), [
      "# Changelog",
      "",
      "## 0.2.0-beta.0",
      "",
      "### Minor Changes",
      "",
      "- Remove the root parser export in favor of its server-scoped replacement.",
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
      "## 0.1.0",
      "Initial release.",
    ].join("\n"));

    expect(readCompatibilityReleaseIntent({
      root,
      packageName,
      baselineVersion: "0.1.0",
      candidateVersion: "0.2.0-beta.0",
    })).toEqual({
      releaseType: "minor",
      evidence: [{
        source: "CHANGELOG.md#0.2.0-beta.0",
        body: expect.stringContaining("### Adoption"),
      }],
    });
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
});
