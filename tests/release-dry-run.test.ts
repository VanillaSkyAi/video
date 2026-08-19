import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const packageManifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  name: string;
  version: string;
  packageManager?: string;
  scripts: Record<string, string>;
};

describe("local release dry run", () => {
  it("locks the fresh package identity and deterministic local entry point", () => {
    expect(packageManifest.name).toBe("@vanillaskyai/video");
    expect(packageManifest.version).toBe("0.1.0");
    expect(packageManifest.packageManager).toBe("npm@11.17.0");
    expect(packageManifest.scripts["release:dry-run"]).toBe("node scripts/release-dry-run.mjs");
    expect(existsSync(resolve(root, "scripts", "release-dry-run.mjs"))).toBe(true);
  });

  it("packs once and passes both immutable hashes to every artifact gate", () => {
    const scriptPath = resolve(root, "scripts", "release-dry-run.mjs");
    expect(existsSync(scriptPath)).toBe(true);
    if (!existsSync(scriptPath)) return;
    const orchestrator = readFileSync(scriptPath, "utf8");
    expect(orchestrator.match(/"pack"/g)).toHaveLength(1);
    expect(orchestrator).toContain("createReleaseNpmGuard");
    expect(orchestrator).toContain("assertComplete");
    expect(orchestrator).toContain("VANILLASKY_PACKED_TARBALL");
    expect(orchestrator).toContain("VANILLASKY_EXPECTED_INTEGRITY");
    expect(orchestrator).toContain("VANILLASKY_EXPECTED_SHA256");
    expect(orchestrator).toContain("VANILLASKY_PROVIDER_EVIDENCE_PATH");
    expect(orchestrator).toContain("VANILLASKY_CANDIDATE_COMMIT");
    for (const command of [
      "verify:api",
      "verify:package",
      "verify:package-size",
      "verify:onboarding",
      "verify:nextjs",
      "examples:verify-documented",
      "examples:install-current",
    ]) expect(orchestrator).toContain(command);
  });

  it("makes every tarball-facing verifier reuse an injected candidate", () => {
    for (const relative of [
      "scripts/verify-public-api-surface.mjs",
      "scripts/verify-packed-package.mjs",
      "scripts/verify-package-size.ts",
      "scripts/verify-onboarding.mjs",
      "scripts/verify-nextjs-onboarding.mjs",
      "scripts/verify-documented-examples.mjs",
      "scripts/install-current-examples.mjs",
    ]) {
      const source = readFileSync(resolve(root, relative), "utf8");
      expect(source, relative).toContain("VANILLASKY_PACKED_TARBALL");
      expect(source, relative).toContain("VANILLASKY_EXPECTED_INTEGRITY");
      expect(source, relative).toContain("VANILLASKY_EXPECTED_SHA256");
    }
  });

  it("records coherence and exact consumer results without public side effects", () => {
    const scriptPath = resolve(root, "scripts", "release-dry-run.mjs");
    expect(existsSync(scriptPath)).toBe(true);
    if (!existsSync(scriptPath)) return;
    const orchestrator = readFileSync(scriptPath, "utf8");
    for (const contract of [
      "package-lock.json",
      "CHANGELOG.md",
      "PUBLIC-API.md",
      "README.md",
      "examples",
      "generatedTrees",
      "providerCompatibility",
      "pending-annotated",
      "VANILLASKY_ALLOW_DIRTY_RELEASE",
      "workingTree",
      "websiteHandoff",
    ]) expect(orchestrator).toContain(contract);
    expect(orchestrator).not.toMatch(/npm publish|gh release|git tag|git push/);
  });

  it("enforces tag-mode CI and the packed package identity before artifact gates", () => {
    const orchestrator = readFileSync(resolve(root, "scripts", "release-dry-run.mjs"), "utf8");
    expect(orchestrator).toContain('assertEqual(process.env.VANILLASKY_RELEASE_MODE, "tag", "release mode")');
    expect(orchestrator).toContain('assertEqual(packed.name, source.packageManifest.name, "packed package name")');
    expect(orchestrator).toContain('assertEqual(packed.version, source.packageManifest.version, "packed package version")');
    expect(orchestrator).toContain("ancestryVerified: ciMode");
    expect(orchestrator).toContain("refs/tags/${releaseTag}^{commit}");
    expect(orchestrator).toContain('assertEqual(tagCommit, sourceCommit, "annotated tag commit")');
    expect(orchestrator).not.toContain('assertEqual(packageManifest.version, "0.1.0", "first release version")');
  });

  it("requires compatibility, first-release, signing, and immutable release guidance", () => {
    const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
    const releasing = readFileSync(resolve(root, "docs", "maintainers", "releasing.md"), "utf8");
    expect(changelog).toContain("### Compatibility");
    expect(changelog).toContain("### First release");
    expect(changelog).toContain("PUBLIC-API.md");
    expect(releasing).toContain("npm@11.17.0");
    expect(releasing).toContain("annotated tag");
    expect(releasing).toContain("Signing is deferred");
    expect(releasing).toContain("never repacks");
    expect(releasing).toContain("release-manifest.json");
    expect(releasing).toContain("exact release body");
    expect(releasing).toContain("missing asset fails closed");
    expect(releasing).toContain("intentionally scoped to the `0.x` public beta line");
  });

  it("keeps the packaged public API status publication-neutral", () => {
    const publicApi = readFileSync(resolve(root, "PUBLIC-API.md"), "utf8");
    expect(publicApi).not.toMatch(/\bunpublished\b/i);
    expect(publicApi).toContain("Status: frozen public beta contract for `0.1.0`.");
  });
});
