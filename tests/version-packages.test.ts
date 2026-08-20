import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  it("keeps the intended beta prerelease mode committed on main", () => {
    const checkedInState = readFileSync(join(repositoryRoot, ".changeset/pre.json"), "utf8");
    expect(JSON.parse(checkedInState)).toEqual({
      mode: "pre",
      tag: "beta",
    });
    const { root } = createFixture();
    execFileSync(process.execPath, [changesetsCliPath, "pre", "enter", "beta"], {
      cwd: root,
      env: { ...process.env, CI: "1" },
    });
    expect(readFileSync(join(root, ".changeset/pre.json"), "utf8")).toBe(checkedInState);
    expect(generateVersionPackages({ root, changesetsCliPath })).toMatchObject({ version: "0.1.1-beta.0" });
  });

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

  it("generates from an exact detached main SHA without requiring a local main branch", () => {
    const { baseRef, root } = createFixture();
    git(root, "checkout", "--detach", baseRef);
    git(root, "branch", "--delete", "main");

    expect(generateVersionPackages({ root, changesetsCliPath })).toMatchObject({
      changed: true,
      previousVersion: "0.1.0",
      version: "0.1.1-beta.0",
    });
  });

  it("fails closed instead of changing a non-beta prerelease mode", () => {
    const { root } = createFixture();
    json(root, ".changeset/pre.json", { mode: "pre", tag: "next" });

    expect(() => generateVersionPackages({ root, changesetsCliPath })).toThrow(/beta.*next|next.*beta/i);
  });

  it("rejects a pending Changeset symlink instead of silently skipping it", () => {
    const { root } = createFixture({ release: "empty" });
    write(root, "linked-release.md", `---
"@vanillaskyai/video": patch
---

Linked release intent must never be followed.
`);
    symlinkSync("../linked-release.md", join(root, ".changeset/linked-release.md"));
    commit(root, "add linked release intent");

    expect(() => generateVersionPackages({ root, changesetsCliPath })).toThrow(/100644|regular file|symlink/i);
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

  it("rejects a commit that lacks the deterministic generated identity", () => {
    const { baseRef, root } = createFixture();
    generateVersionPackages({ root, changesetsCliPath });
    const headRef = commit(root, "chore: version packages");

    expect(() => verifyVersionPackagesPullRequest({
      baseRef,
      headRef,
      root,
      ...metadata,
      changesetsCliPath,
    })).toThrow(/generated commit identity/i);
  });

  it("runs the exact verifier from a dependency-free temporary base worktree", () => {
    const { baseRef, root } = createFixture();
    for (const path of [
      "scripts/lib/changeset-records.mjs",
      "scripts/lib/version-packages.mjs",
      "scripts/lib/version-surfaces.mjs",
      "scripts/verify-version-packages-pr.mjs",
    ]) write(root, path, readFileSync(join(repositoryRoot, path), "utf8"));
    commit(root, "add base verifier");
    const verifierBase = git(root, "rev-parse", "HEAD");
    generateVersionPackages({ root, changesetsCliPath });
    const headRef = commit(root, "chore: version packages", true);
    const baseWorktree = mkdtempSync(join(tmpdir(), "vanillasky-version-packages-base-verifier-"));
    fixtures.push(baseWorktree);
    git(root, "worktree", "add", "--detach", baseWorktree, verifierBase);

    const output = execFileSync(process.execPath, [join(baseWorktree, "scripts/verify-version-packages-pr.mjs")], {
      cwd: baseWorktree,
      encoding: "utf8",
      env: {
        ...process.env,
        CHANGESET_BASE_BRANCH: "main",
        CHANGESET_BASE_REF: verifierBase,
        CHANGESET_BASE_REPOSITORY: "VanillaSkyAi/video",
        CHANGESET_HEAD_BRANCH: "changeset-release/main",
        CHANGESET_HEAD_REF: headRef,
        CHANGESET_HEAD_REPOSITORY: "VanillaSkyAi/video",
        CHANGESETS_CLI_PATH: changesetsCliPath,
        CHANGESETS_PARSE_PATH: resolve(repositoryRoot, "node_modules/@changesets/parse/dist/index.mjs"),
        VERSION_PACKAGES_REPOSITORY_ROOT: root,
      },
    });

    expect(output).toContain("0.1.1-beta.0 is reproducible");
    expect(existsSync(join(baseWorktree, "node_modules"))).toBe(false);
    expect(baseRef).not.toBe(verifierBase);
  });
});
