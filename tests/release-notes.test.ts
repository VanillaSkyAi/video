import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const helperPath = resolve(root, "scripts", "lib", "release-notes.mjs");

describe("release notes", () => {
  it("accepts a standard Changesets prerelease entry without redundant beta prose", async () => {
    expect(existsSync(helperPath)).toBe(true);
    if (!existsSync(helperPath)) return;

    const { extractChangesetReleaseNotes } = await import("../scripts/lib/release-notes.mjs");
    const changelog = `# Changelog

## Unreleased

## 0.1.1-beta.0

### Patch Changes

- 66e8e95: Preserve compatibility across the 0.1.x line.

## 0.1.0

Initial release.
`;

    expect(extractChangesetReleaseNotes(changelog, "0.1.1-beta.0")).toBe(
      "### Patch Changes\n\n- 66e8e95: Preserve compatibility across the 0.1.x line.",
    );
  });

  it("rejects an empty or malformed generated release entry", async () => {
    expect(existsSync(helperPath)).toBe(true);
    if (!existsSync(helperPath)) return;

    const { extractChangesetReleaseNotes } = await import("../scripts/lib/release-notes.mjs");
    expect(() => extractChangesetReleaseNotes("# Changelog\n\n## 0.1.1-beta.0\n", "0.1.1-beta.0"))
      .toThrow(/Changesets release notes/);
    expect(() => extractChangesetReleaseNotes(
      "# Changelog\n\n## 0.1.1-beta.0\n\n### Patch Changes\n",
      "0.1.1-beta.0",
    )).toThrow(/Changesets release notes/);
  });
});
