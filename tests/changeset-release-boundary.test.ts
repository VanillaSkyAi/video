import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as changesetRecords from "../scripts/lib/changeset-records.mjs";

const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vanillasky-release-changesets-"));
  roots.push(root);
  mkdirSync(join(root, ".changeset"));
  writeFileSync(join(root, ".changeset", "tooling.md"), "---\n---\n\nChange repository tooling.\n");
  writeFileSync(
    join(root, ".changeset", "package.md"),
    "---\n\"@vanillaskyai/video\": patch\n---\n\nChange package behavior.\n",
  );
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release Changeset boundary", () => {
  it("ignores repository-only records but returns package release intent", () => {
    const list = (changesetRecords as Record<string, unknown>).listPendingPackageChangesetPaths;
    expect(list).toBeTypeOf("function");
    if (typeof list !== "function") return;

    expect(list({ root: fixture() })).toEqual([".changeset/package.md"]);
  });

  it("blocks a package Changeset without treating an empty Changeset as a release", () => {
    const assertNone = (changesetRecords as Record<string, unknown>).assertNoPendingPackageChangesets;
    expect(assertNone).toBeTypeOf("function");
    if (typeof assertNone !== "function") return;

    const emptyOnly = fixture();
    rmSync(join(emptyOnly, ".changeset", "package.md"));
    expect(() => assertNone({ root: emptyOnly })).not.toThrow();
    expect(() => assertNone({ root: fixture() })).toThrow(/pending package Changesets.*package\.md/i);
  });
});
