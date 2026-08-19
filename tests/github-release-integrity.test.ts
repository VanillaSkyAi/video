import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("GitHub release integrity", () => {
  it("requires exact immutable release metadata", async () => {
    const modulePath = resolve("scripts/lib/github-release-integrity.mjs");
    expect(existsSync(modulePath)).toBe(true);
    if (!existsSync(modulePath)) return;
    const { assertGitHubReleaseCoherent } = await import(pathToFileURL(modulePath).href);
    const expected = {
      body: "# Release notes\n",
      commit: "a".repeat(40),
      prerelease: false,
      tag: "v0.1.0",
      targetCommitish: "main",
    };
    const release = {
      body: expected.body,
      isDraft: false,
      isPrerelease: false,
      tagName: expected.tag,
      targetCommitish: expected.targetCommitish,
    };

    expect(assertGitHubReleaseCoherent(release, expected)).toEqual(release);
    for (const [field, value] of [
      ["body", "stale notes"],
      ["isDraft", true],
      ["isPrerelease", true],
      ["tagName", "v0.1.1"],
      ["targetCommitish", "other-branch"],
    ] as const) {
      expect(() => assertGitHubReleaseCoherent({ ...release, [field]: value }, expected), field)
        .toThrow();
    }
  });
});
