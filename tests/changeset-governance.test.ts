import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyChangesetGovernance } from "../scripts/verify-changeset.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const canonicalRepository = "VanillaSkyAi/video";
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

function createRepository({ pendingChangeset = false } = {}): { baseRef: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "vanillasky-changeset-governance-"));
  fixtures.push(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "VanillaSky Test");
  git(root, "config", "user.email", "test@vanillasky.invalid");
  write(root, "package.json", `${JSON.stringify({
    name: "@vanillaskyai/video",
    version: "0.1.0",
    scripts: { test: "vitest run" },
  }, null, 2)}\n`);
  write(root, "src/index.ts", "export const version = 1;\n");
  write(root, "CONTRIBUTING.md", "# Contributing\n");
  if (pendingChangeset) write(root, ".changeset/prior-change.md", packageChangeset);
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

    expect(() => verifyChangesetGovernance({ root, baseRef })).toThrow(
      /new changeset/i,
    );
  });

  it("rejects an empty changeset when package files change", () => {
    const { baseRef, root } = createRepository();
    write(root, "src/index.ts", "export const version = 2;\n");
    write(root, ".changeset/quiet-tools.md", emptyChangeset);
    commit(root, "change package source without a bump");

    expect(() => verifyChangesetGovernance({ root, baseRef })).toThrow(
      /@vanillaskyai\/video.*patch.*minor.*major/i,
    );
  });

  it("treats deleted package files as package-affecting", () => {
    const { baseRef, root } = createRepository();
    rmSync(join(root, "src/index.ts"));
    write(root, ".changeset/quiet-tools.md", emptyChangeset);
    commit(root, "delete package source without a bump");

    expect(() => verifyChangesetGovernance({ root, baseRef })).toThrow(
      /@vanillaskyai\/video.*patch.*minor.*major/i,
    );
  });

  it.each([
    ["force-added published dist output", "dist/index.js", "export const built = true;\n"],
    ["root TypeScript build configuration", "tsconfig.json", "{\"compilerOptions\":{\"strict\":false}}\n"],
    ["published npm shrinkwrap", "npm-shrinkwrap.json", "{\"name\":\"@vanillaskyai/video\",\"version\":\"0.1.0\"}\n"],
    ["npm package inclusion rules", ".npmignore", "private-development-file\n"],
  ])("treats %s as package-affecting", (_name, path, contents) => {
    const { baseRef, root } = createRepository();
    write(root, path, contents);
    write(root, ".changeset/quiet-tools.md", emptyChangeset);
    commit(root, `change ${path} without a bump`);

    expect(() => verifyChangesetGovernance({ root, baseRef })).toThrow(
      /@vanillaskyai\/video.*patch.*minor.*major/i,
    );
  });

  it("treats package lifecycle scripts as package-affecting metadata", () => {
    const { baseRef, root } = createRepository();
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    manifest.scripts.postinstall = "node install.mjs";
    write(root, "package.json", `${JSON.stringify(manifest, null, 2)}\n`);
    write(root, ".changeset/quiet-tools.md", emptyChangeset);
    commit(root, "add an install lifecycle script without a bump");

    expect(() => verifyChangesetGovernance({ root, baseRef })).toThrow(
      /@vanillaskyai\/video.*patch.*minor.*major/i,
    );
  });

  it.each([
    "dependencies",
    "preprepare",
    "postprepare",
    "publish",
    "postpublish",
    "preversion",
    "build",
  ])("fails closed for non-allowlisted package script %s", (scriptName) => {
    const { baseRef, root } = createRepository();
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    manifest.scripts[scriptName] = "node package-hook.mjs";
    write(root, "package.json", `${JSON.stringify(manifest, null, 2)}\n`);
    write(root, ".changeset/quiet-tools.md", emptyChangeset);
    commit(root, `add ${scriptName} package script without a bump`);

    expect(() => verifyChangesetGovernance({ root, baseRef })).toThrow(
      /@vanillaskyai\/video.*patch.*minor.*major/i,
    );
  });

  it("keeps repository-only development scripts eligible for an empty changeset", () => {
    const { baseRef, root } = createRepository();
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    manifest.scripts.lint = "eslint .";
    write(root, "package.json", `${JSON.stringify(manifest, null, 2)}\n`);
    write(root, ".changeset/quiet-tools.md", emptyChangeset);
    commit(root, "add repository tooling");

    expect(verifyChangesetGovernance({ root, baseRef })).toMatchObject({
      packageAffecting: false,
      releaseType: null,
    });
  });

  it("accepts a package changeset with an explicit semver bump", () => {
    const { baseRef, root } = createRepository();
    write(root, "src/index.ts", "export const version = 2;\n");
    write(root, ".changeset/brave-rivers.md", packageChangeset);
    commit(root, "change package source with a bump");

    expect(verifyChangesetGovernance({ root, baseRef })).toMatchObject({
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

    expect(verifyChangesetGovernance({ root, baseRef })).toMatchObject({
      changesets: [".changeset/quiet-tools.md"],
      packageAffecting: false,
      releaseType: null,
    });
  });

  it("treats both sides of a rename as package-affecting", () => {
    const { baseRef, root } = createRepository();
    mkdirSync(join(root, "tools"), { recursive: true });
    git(root, "mv", "src/index.ts", "tools/index.ts");
    write(root, ".changeset/quiet-tools.md", emptyChangeset);
    commit(root, "move package source outside the package surface");

    expect(() => verifyChangesetGovernance({ root, baseRef })).toThrow(
      /@vanillaskyai\/video.*patch.*minor.*major/i,
    );
  });

  it.each([
    {
      action: "modified",
      mutate(root: string) {
        write(root, ".changeset/prior-change.md", packageChangeset.replace("next patch", "documented patch"));
      },
    },
    {
      action: "deleted",
      mutate(root: string) {
        rmSync(join(root, ".changeset/prior-change.md"));
      },
    },
    {
      action: "renamed",
      mutate(root: string) {
        git(root, "mv", ".changeset/prior-change.md", ".changeset/renamed-prior.md");
      },
    },
  ])("rejects a base-owned pending Changeset that is $action", ({ action, mutate }) => {
    const { baseRef, root } = createRepository({ pendingChangeset: true });
    mutate(root);
    write(root, ".changeset/quiet-tools.md", emptyChangeset);
    commit(root, `${action} a pending changeset`);

    expect(() => verifyChangesetGovernance({ root, baseRef })).toThrow(
      new RegExp(`base-owned.*${action}`, "i"),
    );
  });

  it("rejects duplicate package keys using the official Changesets parser", () => {
    const { baseRef, root } = createRepository();
    write(root, "src/index.ts", "export const version = 2;\n");
    write(root, ".changeset/duplicate-package.md", `---
"@vanillaskyai/video": patch
"@vanillaskyai/video": minor
---

Reject ambiguous release intent.
`);
    commit(root, "add ambiguous release intent");

    expect(() => verifyChangesetGovernance({ root, baseRef })).toThrow(/invalid YAML|unique/i);
  });

  it("rejects malformed release records using the official Changesets parser", () => {
    const { baseRef, root } = createRepository();
    write(root, "src/index.ts", "export const version = 2;\n");
    write(root, ".changeset/invalid-release.md", `---
"@vanillaskyai/video": breaking
---

Reject an unsupported release type.
`);
    commit(root, "add malformed release intent");

    expect(() => verifyChangesetGovernance({ root, baseRef })).toThrow(/invalid version type/i);
  });

  it.each([
    {
      name: "a heading instead of a one-line summary",
      body: "### Breaking changes\n\nExplain the break.",
      error: /one-line summary/i,
    },
    {
      name: "details without a blank boundary",
      body: "Summarize the release.\n### Adoption\nExplain adoption.",
      error: /blank line/i,
    },
  ])("rejects $name", ({ body, error }) => {
    const { baseRef, root } = createRepository();
    write(root, "src/index.ts", "export const version = 2;\n");
    write(root, ".changeset/invalid-summary.md", `---
"@vanillaskyai/video": patch
---

${body}
`);
    commit(root, "add badly structured release notes");

    expect(() => verifyChangesetGovernance({ root, baseRef })).toThrow(error);
  });

  it("does not exempt a Version Packages branch before generator provenance exists", () => {
    const { baseRef, root } = createRepository();
    write(root, "src/index.ts", "export const version = 2;\n");
    commit(root, "consume pending changesets");

    const provenanceClaim = {
      root,
      baseRef,
      headBranch: "changeset-release/main",
      headRepository: canonicalRepository,
      baseRepository: canonicalRepository,
    };
    expect(() => verifyChangesetGovernance(provenanceClaim)).toThrow(/new changeset/i);
  });

  it.each([
    {
      name: "a fork copying the generated branch name",
      headBranch: "changeset-release/main",
    },
    {
      name: "a nested lookalike branch",
      headBranch: "changeset-release/main/forged",
    },
  ])("does not exempt $name", ({ headBranch }) => {
    const { baseRef, root } = createRepository();
    write(root, "src/index.ts", "export const version = 2;\n");
    commit(root, "spoof a generated release branch");

    const provenanceClaim = { root, baseRef, headBranch };
    expect(() => verifyChangesetGovernance(provenanceClaim)).toThrow(/new changeset/i);
  });

  it("pins Changesets and runs governance for every ordinary pull request", () => {
    const manifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
    const workflow = readFileSync(join(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
    const configPath = join(repositoryRoot, ".changeset/config.json");

    expect(manifest.devDependencies["@changesets/cli"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.devDependencies["@changesets/parse"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.scripts.changeset).toBe("changeset");
    expect(manifest.scripts["changeset:status"]).toBe("changeset status");
    expect(manifest.scripts["changeset:check"]).toBe("node scripts/verify-changeset.mjs");
    expect(existsSync(configPath)).toBe(true);
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("CHANGESET_BASE_REF: ${{ github.event.pull_request.base.sha }}");
    expect(workflow).not.toContain("CHANGESET_HEAD_BRANCH");
    expect(workflow).not.toContain("CHANGESET_BASE_REPOSITORY");
    expect(workflow).not.toContain("CHANGESET_HEAD_REPOSITORY");
    expect(workflow.indexOf("npm run changeset:status")).toBeGreaterThanOrEqual(0);
    expect(workflow.indexOf("npm run changeset:status")).toBeLessThan(workflow.indexOf("npm run changeset:check"));
    expect(workflow).toContain("npm run changeset:check");
  });
});
