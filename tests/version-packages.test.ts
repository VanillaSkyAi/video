import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateVersionPackages,
  verifyVersionPackagesPullRequest,
} from "../scripts/lib/version-packages.mjs";
import { verifyChangesetGovernance } from "../scripts/verify-changeset.mjs";

const fixtures: string[] = [];
const repositoryRoot = resolve(import.meta.dirname, "..");
const changesetsCliPath = resolve(repositoryRoot, "node_modules/@changesets/cli/bin.js");

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function write(root: string, path: string, contents: string): void {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function json(root: string, path: string, value: unknown): void {
  write(root, path, `${JSON.stringify(value, null, 2)}\n`);
}

function commit(root: string, message: string, bot = false): string {
  git(root, "add", "--all");
  const identity = bot
    ? [
        "-c", "user.name=github-actions[bot]",
        "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
      ]
    : ["-c", "user.name=VanillaSky Test", "-c", "user.email=test@vanillasky.invalid"];
  git(root, ...identity, "-c", "commit.gpgsign=false", "commit", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

function createFixture({ release = "patch" }: { release?: "patch" | "empty" } = {}): {
  baseRef: string;
  root: string;
} {
  const root = mkdtempSync(join(tmpdir(), "vanillasky-version-packages-"));
  fixtures.push(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "VanillaSky Test");
  git(root, "config", "user.email", "test@vanillasky.invalid");
  json(root, "package.json", { name: "@vanillaskyai/video", version: "0.1.0" });
  json(root, "package-lock.json", {
    name: "@vanillaskyai/video",
    version: "0.1.0",
    lockfileVersion: 3,
    packages: { "": { name: "@vanillaskyai/video", version: "0.1.0" } },
  });
  json(root, ".changeset/config.json", {
    changelog: "@changesets/cli/changelog",
    commit: false,
    fixed: [],
    linked: [],
    access: "public",
    baseBranch: "main",
    updateInternalDependencies: "patch",
    ignore: [],
  });
  write(root, "README.md", [
    "![Version 0.1.0 beta](https://img.shields.io/badge/version-0.1.0_beta-7c3aed)",
    "npm install @vanillaskyai/video@0.1.0 ai @ai-sdk/openai",
    "https://github.com/VanillaSkyAi/video/tree/v0.1.0/examples/nextjs-quickstart",
  ].join("\n"));
  write(root, "PUBLIC-API.md", "Status: frozen public beta contract for `0.1.0`.\n");
  for (const path of ["docs/getting-started.md", "docs/integrate-nextjs.md"]) {
    write(root, path, [
      "npm install @vanillaskyai/video@0.1.0 ai @ai-sdk/openai",
      "https://github.com/VanillaSkyAi/video/tree/v0.1.0/examples/nextjs-quickstart",
    ].join("\n"));
  }
  write(root, "skills/vanillasky/SKILL.md", "npm install @vanillaskyai/video@0.1.0 ai @ai-sdk/openai\n");
  for (const path of [
    "examples/react-vite/package.json",
    "examples/server-integrations/package.json",
    "examples/nextjs-quickstart/package.json",
    "tests/fixtures/nextjs-provider-app/package.json",
  ]) json(root, path, { dependencies: { "@vanillaskyai/video": "0.1.0" } });
  write(root, "CHANGELOG.md", "# Changelog\n\n## 0.1.0\n\nInitial beta release.\n");
  write(root, ".changeset/pending-release.md", release === "patch" ? `---
"@vanillaskyai/video": patch
---

Preserve the public package behavior in the next beta patch.
` : `---
---

Document repository-only release tooling.
`);
  const baseRef = commit(root, "add pending release intent");
  return { baseRef, root };
}

function treeSnapshot(root: string): string {
  return `${git(root, "diff", "--binary", "HEAD")}\n${git(root, "status", "--short", "--untracked-files=all")}`;
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("Version Packages generation", () => {
  it("uses real Changesets prerelease output and synchronizes every version surface", () => {
    const { root } = createFixture();

    const result = generateVersionPackages({ root, changesetsCliPath });

    expect(result).toMatchObject({ changed: true, previousVersion: "0.1.0", version: "0.1.1-beta.0" });
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version).toBe("0.1.1-beta.0");
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
    expect(lock.version).toBe("0.1.1-beta.0");
    expect(lock.packages[""].version).toBe("0.1.1-beta.0");
    expect(JSON.parse(readFileSync(join(root, ".changeset/pre.json"), "utf8"))).toEqual({ mode: "pre", tag: "beta" });
    expect(existsSync(join(root, ".changeset/pending-release.md"))).toBe(false);
    expect(readFileSync(join(root, ".changeset/pre/pending-release.md"), "utf8")).toContain("next beta patch");
    expect(readFileSync(join(root, "CHANGELOG.md"), "utf8")).toMatch(
      /^## 0\.1\.1-beta\.0\n\n### Patch Changes\n\n- [a-f0-9]+: Preserve the public package behavior/m,
    );
    expect(readFileSync(join(root, "README.md"), "utf8")).toContain("@vanillaskyai/video@0.1.1-beta.0");
    expect(readFileSync(join(root, "PUBLIC-API.md"), "utf8")).toContain("contract for `0.1.1-beta.0`");
    for (const path of [
      "examples/react-vite/package.json",
      "examples/server-integrations/package.json",
      "examples/nextjs-quickstart/package.json",
      "tests/fixtures/nextjs-provider-app/package.json",
    ]) {
      expect(JSON.parse(readFileSync(join(root, path), "utf8")).dependencies["@vanillaskyai/video"])
        .toBe("0.1.1-beta.0");
    }
  });

  it("is byte-idempotent when rerun on the generated tree", () => {
    const { root } = createFixture();
    generateVersionPackages({ root, changesetsCliPath });
    const generated = treeSnapshot(root);

    const result = generateVersionPackages({ root, changesetsCliPath });

    expect(result).toMatchObject({ changed: false, previousVersion: "0.1.1-beta.0", version: "0.1.1-beta.0" });
    expect(treeSnapshot(root)).toBe(generated);
  });

  it("does not enter prerelease mode when only empty Changesets are pending", () => {
    const { root } = createFixture({ release: "empty" });
    const before = treeSnapshot(root);

    expect(generateVersionPackages({ root, changesetsCliPath })).toMatchObject({
      changed: false,
      previousVersion: "0.1.0",
      version: "0.1.0",
    });
    expect(treeSnapshot(root)).toBe(before);
    expect(existsSync(join(root, ".changeset/pre.json"))).toBe(false);
  });

  it("fails closed instead of changing a non-beta prerelease mode", () => {
    const { root } = createFixture();
    json(root, ".changeset/pre.json", { mode: "pre", tag: "next" });

    expect(() => generateVersionPackages({ root, changesetsCliPath })).toThrow(/beta.*next|next.*beta/i);
  });
});

describe("Version Packages pull request verification", () => {
  function generatedPullRequest(): { baseRef: string; headRef: string; root: string } {
    const { baseRef, root } = createFixture();
    generateVersionPackages({ root, changesetsCliPath });
    const headRef = commit(root, "chore: version packages", true);
    return { baseRef, headRef, root };
  }

  const metadata = {
    baseBranch: "main",
    baseRepository: "VanillaSkyAi/video",
    headBranch: "changeset-release/main",
    headRepository: "VanillaSkyAi/video",
  };

  it("accepts only the exact reproducible tree generated from its one protected-main parent", () => {
    const pullRequest = generatedPullRequest();

    expect(verifyVersionPackagesPullRequest({ ...pullRequest, ...metadata, changesetsCliPath })).toMatchObject({
      baseRef: pullRequest.baseRef,
      headRef: pullRequest.headRef,
      version: "0.1.1-beta.0",
    });
  });

  it("routes the canonical generated branch through reproducibility instead of ordinary immutability", () => {
    const pullRequest = generatedPullRequest();

    expect(verifyChangesetGovernance({
      ...pullRequest,
      ...metadata,
      changesetsCliPath,
    })).toMatchObject({
      changesets: [],
      generated: true,
      packageAffecting: true,
      version: "0.1.1-beta.0",
    });
  });

  it.each([
    ["branch", { headBranch: "changeset-release/main/forged" }],
    ["head repository", { headRepository: "fork/video" }],
    ["base repository", { baseRepository: "fork/video" }],
    ["base branch", { baseBranch: "develop" }],
  ])("rejects incorrect canonical %s identity", (_name, override) => {
    const pullRequest = generatedPullRequest();

    expect(() => verifyVersionPackagesPullRequest({
      ...pullRequest,
      ...metadata,
      ...override,
      changesetsCliPath,
    })).toThrow(/version packages|canonical|main/i);
  });

  it("rejects a same-repository branch whose generated files drift", () => {
    const pullRequest = generatedPullRequest();
    write(pullRequest.root, "README.md", `${readFileSync(join(pullRequest.root, "README.md"), "utf8")}forged\n`);
    const forgedHead = commit(pullRequest.root, "chore: version packages", true);

    expect(() => verifyVersionPackagesPullRequest({
      ...pullRequest,
      headRef: forgedHead,
      ...metadata,
      changesetsCliPath,
    })).toThrow(/reproducible|tree|generated/i);
  });

  it("rejects a generated branch with more than one commit after main", () => {
    const pullRequest = generatedPullRequest();
    write(pullRequest.root, "extra.txt", "not generated\n");
    const extraHead = commit(pullRequest.root, "add another commit", true);

    expect(() => verifyVersionPackagesPullRequest({
      ...pullRequest,
      headRef: extraHead,
      ...metadata,
      changesetsCliPath,
    })).toThrow(/parent|single|base/i);
  });

  it("rejects a generated commit without GitHub Actions bot provenance", () => {
    const { baseRef, root } = createFixture();
    generateVersionPackages({ root, changesetsCliPath });
    const headRef = commit(root, "chore: version packages");

    expect(() => verifyVersionPackagesPullRequest({
      baseRef,
      headRef,
      root,
      ...metadata,
      changesetsCliPath,
    })).toThrow(/github-actions\[bot\]|provenance/i);
  });
});
