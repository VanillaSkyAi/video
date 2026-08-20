import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyChangesetGovernance } from "../scripts/verify-changeset.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const fixtures: string[] = [];

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function write(root: string, path: string, contents: string): void {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function commit(root: string, message: string): void {
  git(root, "add", "--all");
  git(root, "-c", "commit.gpgsign=false", "commit", "-m", message);
}

function createRepository(): { baseRef: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "vanillasky-changeset-governance-"));
  fixtures.push(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "VanillaSky Test");
  git(root, "config", "user.email", "test@vanillasky.invalid");
  write(root, "src/index.ts", "export const version = 1;\n");
  write(root, "CONTRIBUTING.md", "# Contributing\n");
  commit(root, "initial fixture");
  const baseRef = git(root, "rev-parse", "HEAD");
  git(root, "checkout", "-b", "feature/test");
  return { baseRef, root };
}

const emptyChangeset = `---
---

Document this non-release repository change.
`;

const packageChangeset = `---
"@vanillaskyai/video": patch
---

Preserve the public package behavior in the next patch release.
`;

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("changeset governance", () => {
  it("provides a repository-scoped changeset verifier", () => {
    expect(existsSync(resolve(repositoryRoot, "scripts/verify-changeset.mjs"))).toBe(true);
  });

  it("rejects a pull request without a new changeset", () => {
    const { baseRef, root } = createRepository();
    write(root, "src/index.ts", "export const version = 2;\n");
    commit(root, "change package source");

    expect(() => verifyChangesetGovernance({ root, baseRef, headBranch: "feature/test" })).toThrow(
      /new changeset/i,
    );
  });

  it("rejects an empty changeset when package files change", () => {
    const { baseRef, root } = createRepository();
    write(root, "src/index.ts", "export const version = 2;\n");
    write(root, ".changeset/quiet-tools.md", emptyChangeset);
    commit(root, "change package source without a bump");

    expect(() => verifyChangesetGovernance({ root, baseRef, headBranch: "feature/test" })).toThrow(
      /@vanillaskyai\/video.*patch.*minor.*major/i,
    );
  });

  it("accepts a package changeset with an explicit semver bump", () => {
    const { baseRef, root } = createRepository();
    write(root, "src/index.ts", "export const version = 2;\n");
    write(root, ".changeset/brave-rivers.md", packageChangeset);
    commit(root, "change package source with a bump");

    expect(verifyChangesetGovernance({ root, baseRef, headBranch: "feature/test" })).toMatchObject({
      changesets: [".changeset/brave-rivers.md"],
      packageAffecting: true,
      releaseType: "patch",
    });
  });

  it("accepts an empty changeset for a non-package change", () => {
    const { baseRef, root } = createRepository();
    write(root, "CONTRIBUTING.md", "# Contributing\n\nDocument governance.\n");
    write(root, ".changeset/README.md", "# Changesets\n\nRepository guidance, not a release record.\n");
    write(root, ".changeset/quiet-tools.md", emptyChangeset);
    commit(root, "document repository governance");

    expect(verifyChangesetGovernance({ root, baseRef, headBranch: "feature/test" })).toMatchObject({
      changesets: [".changeset/quiet-tools.md"],
      packageAffecting: false,
      releaseType: null,
    });
  });

  it("exempts generated Version Packages branches that consume changesets", () => {
    const { baseRef, root } = createRepository();
    write(root, "src/index.ts", "export const version = 2;\n");
    commit(root, "consume pending changesets");

    expect(verifyChangesetGovernance({ root, baseRef, headBranch: "changeset-release/main" })).toEqual({
      exempt: true,
      reason: "version-packages-branch",
    });
  });

  it("pins Changesets and runs governance for every ordinary pull request", () => {
    const manifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
    const workflow = readFileSync(join(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
    const configPath = join(repositoryRoot, ".changeset/config.json");

    expect(manifest.devDependencies["@changesets/cli"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.scripts.changeset).toBe("changeset");
    expect(manifest.scripts["changeset:status"]).toBe("changeset status");
    expect(manifest.scripts["changeset:check"]).toBe("node scripts/verify-changeset.mjs");
    expect(existsSync(configPath)).toBe(true);
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("CHANGESET_BASE_REF: ${{ github.event.pull_request.base.sha }}");
    expect(workflow).toContain("CHANGESET_HEAD_BRANCH: ${{ github.head_ref }}");
    expect(workflow).toContain("npm run changeset:check");
  });
});
