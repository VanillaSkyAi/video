import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const fixtures: string[] = [];
const repositoryRoot = resolve(import.meta.dirname, "..");

function write(root: string, path: string, contents: string): void {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), contents);
}

function json(root: string, path: string, value: unknown): void {
  write(root, path, `${JSON.stringify(value, null, 2)}\n`);
}

function createReleaseFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "vanillasky-release-prepare-"));
  fixtures.push(root);
  json(root, "package.json", { name: "@vanillaskyai/video", version: "0.1.0" });
  json(root, "package-lock.json", {
    name: "@vanillaskyai/video",
    version: "0.1.0",
    packages: { "": { name: "@vanillaskyai/video", version: "0.1.0" } },
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
  write(root, "CHANGELOG.md", `# Changelog

## Unreleased

This beta patch adds a repeatable release preparation command and protects the
existing public package contract against accidental breaking changes.

### Compatibility

The candidate remains compatible with the documented 0.1 API and stored videos.

## 0.1.0

Initial beta release.
`);
  return root;
}

function snapshot(root: string): Record<string, string> {
  const paths = [
    "package.json",
    "package-lock.json",
    "README.md",
    "PUBLIC-API.md",
    "docs/getting-started.md",
    "docs/integrate-nextjs.md",
    "skills/vanillasky/SKILL.md",
    "examples/react-vite/package.json",
    "examples/server-integrations/package.json",
    "examples/nextjs-quickstart/package.json",
    "tests/fixtures/nextjs-provider-app/package.json",
    "CHANGELOG.md",
  ];
  return Object.fromEntries(paths.map((path) => [path, readFileSync(join(root, path), "utf8")]));
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("release candidate preparation", () => {
  it("exposes a repository-scoped preparation function", async () => {
    const module = await import("../scripts/lib/release-prepare.mjs");

    expect(module).toHaveProperty("prepareRelease");
    expect(module.prepareRelease).toBeTypeOf("function");
  });

  it("synchronizes an explicit target version and is idempotent", async () => {
    const root = createReleaseFixture();
    const { prepareRelease } = await import("../scripts/lib/release-prepare.mjs");

    prepareRelease({ root, targetVersion: "0.1.1-beta.0" });
    const prepared = snapshot(root);
    prepareRelease({ root, targetVersion: "0.1.1-beta.0" });

    expect(snapshot(root)).toEqual(prepared);
    expect(JSON.parse(prepared["package.json"]).version).toBe("0.1.1-beta.0");
    expect(JSON.parse(prepared["package-lock.json"]).packages[""].version).toBe("0.1.1-beta.0");
    expect(prepared["README.md"]).toContain("Version 0.1.1-beta.0 beta");
    expect(prepared["README.md"]).toContain("@vanillaskyai/video@0.1.1-beta.0");
    expect(prepared["README.md"]).toContain("tree/v0.1.1-beta.0/examples/nextjs-quickstart");
    expect(prepared["PUBLIC-API.md"]).toContain("contract for `0.1.1-beta.0`");
    for (const path of [
      "examples/react-vite/package.json",
      "examples/server-integrations/package.json",
      "examples/nextjs-quickstart/package.json",
      "tests/fixtures/nextjs-provider-app/package.json",
    ]) expect(JSON.parse(prepared[path]).dependencies["@vanillaskyai/video"]).toBe("0.1.1-beta.0");
    expect(prepared["CHANGELOG.md"].match(/^## 0\.1\.1-beta\.0$/gm)).toHaveLength(1);
    expect(prepared["CHANGELOG.md"]).toMatch(
      /^## Unreleased\n\n<!-- Add release notes here before running release:prepare\. -->\n\n## 0\.1\.1-beta\.0$/m,
    );
    expect(prepared["CHANGELOG.md"].match(/Add release notes here before running release:prepare/g)).toHaveLength(1);
  });

  it("rejects a target older than the current package without writing files", async () => {
    const root = createReleaseFixture();
    const before = snapshot(root);
    const { prepareRelease } = await import("../scripts/lib/release-prepare.mjs");

    expect(() => prepareRelease({ root, targetVersion: "0.0.9" })).toThrow(/newer/i);
    expect(snapshot(root)).toEqual(before);
  });

  it("fails closed when a configured version surface has drifted", async () => {
    const root = createReleaseFixture();
    write(root, "README.md", "Version reference was removed.\n");
    const before = snapshot(root);
    const { prepareRelease } = await import("../scripts/lib/release-prepare.mjs");

    expect(() => prepareRelease({ root, targetVersion: "0.1.1" })).toThrow(/README\.md.*0\.1\.0/);
    expect(snapshot(root)).toEqual(before);
  });

  it("requires substantive Unreleased notes before changing versions", async () => {
    const root = createReleaseFixture();
    write(root, "CHANGELOG.md", `# Changelog

## Unreleased

<!-- Add release notes here before running release:prepare. -->

This note remains too short after the release placeholder is removed.

## 0.1.0

Initial beta.
`);
    const before = snapshot(root);
    const { prepareRelease } = await import("../scripts/lib/release-prepare.mjs");

    expect(() => prepareRelease({ root, targetVersion: "0.1.1" })).toThrow(/substantive.*Unreleased/i);
    expect(snapshot(root)).toEqual(before);
  });

  it("keeps one fresh placeholder out of substantive notes during promotion", async () => {
    const root = createReleaseFixture();
    const marker = "<!-- Add release notes here before running release:prepare. -->";
    write(root, "CHANGELOG.md", readFileSync(join(root, "CHANGELOG.md"), "utf8").replace(
      "## Unreleased\n\n",
      `## Unreleased\n\n${marker}\n\n`,
    ));
    const { prepareRelease } = await import("../scripts/lib/release-prepare.mjs");

    prepareRelease({ root, targetVersion: "0.1.1" });

    const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
    const unreleasedStart = changelog.indexOf("## Unreleased");
    const markerStart = changelog.indexOf(marker);
    const releaseStart = changelog.indexOf("## 0.1.1");
    const priorReleaseStart = changelog.indexOf("## 0.1.0");
    expect(changelog.match(/Add release notes here before running release:prepare/g)).toHaveLength(1);
    expect(markerStart).toBeGreaterThan(unreleasedStart);
    expect(markerStart).toBeLessThan(releaseStart);
    expect(changelog.slice(releaseStart, priorReleaseStart)).not.toContain(marker);
    expect(changelog.slice(releaseStart, priorReleaseStart)).toContain("repeatable release preparation command");
  });

  it("fails closed when the target changelog heading already exists for another current version", async () => {
    const root = createReleaseFixture();
    write(root, "CHANGELOG.md", readFileSync(join(root, "CHANGELOG.md"), "utf8").replace(
      "## 0.1.0",
      "## 0.1.1\n\nPreviously staged notes.\n\n## 0.1.0",
    ));
    const before = snapshot(root);
    const { prepareRelease } = await import("../scripts/lib/release-prepare.mjs");

    expect(() => prepareRelease({ root, targetVersion: "0.1.1" })).toThrow(/already contains.*0\.1\.1/i);
    expect(snapshot(root)).toEqual(before);
  });

  it("wires one explicit-version command into the pinned release workflow", () => {
    const manifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
    const cliPath = join(repositoryRoot, "scripts/release-prepare.mjs");
    expect(existsSync(cliPath)).toBe(true);
    if (!existsSync(cliPath)) return;
    const cli = readFileSync(cliPath, "utf8");
    const dryRun = readFileSync(join(repositoryRoot, "scripts/release-dry-run.mjs"), "utf8");
    const preflight = readFileSync(join(repositoryRoot, "scripts/release-preflight.mjs"), "utf8");

    expect(manifest.scripts["release:prepare"]).toBe("node scripts/release-prepare.mjs");
    expect(readFileSync(join(repositoryRoot, ".node-version"), "utf8").trim()).toBe("22.23.1");
    expect(cli).toContain("assertReleaseToolchain");
    expect(cli).toContain("process.argv.slice(2)");
    expect(cli).toContain("Exactly one explicit target version is required");
    expect(dryRun).toContain("assertReleaseToolchain");
    expect(preflight).toContain("assertReleaseToolchain");
  });

  it("documents prepare, review, commit, and clean-tree dry-run in executable order", () => {
    const changelog = readFileSync(join(repositoryRoot, "CHANGELOG.md"), "utf8");
    const guide = readFileSync(join(repositoryRoot, "docs/maintainers/releasing.md"), "utf8");
    const prepare = guide.indexOf("npm run release:prepare -- X.Y.Z");
    const review = guide.indexOf("git diff --check");
    const commit = guide.indexOf('git commit -m "chore: release vX.Y.Z"');
    const dryRun = guide.indexOf("npm run release:dry-run");

    expect(changelog).toMatch(/^## Unreleased$/m);
    expect(prepare).toBeGreaterThanOrEqual(0);
    expect(review).toBeGreaterThan(prepare);
    expect(commit).toBeGreaterThan(review);
    expect(dryRun).toBeGreaterThan(commit);
    expect(guide).not.toContain("npm version patch");
    expect(guide).not.toContain("npm version prerelease");
  });
});
