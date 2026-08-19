import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("release workflow", () => {
  it("publishes stable pre-1.0 releases to the latest npm tag explicitly", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");

    expect(workflow).toContain(
      'npm publish "./release-assets/${{ needs.verify.outputs.artifact-filename }}" --provenance --access public --tag latest',
    );
  });

  it("verifies, publishes, and uploads one exact packed release artifact", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");

    expect(workflow).toContain("id: artifact");
    expect(workflow).toContain("npm run release:dry-run -- --ci");
    expect(workflow).toContain("VANILLASKY_PACKED_TARBALL: ./release-assets/${{ needs.verify.outputs.artifact-filename }}");
    expect(workflow).toContain("VANILLASKY_EXPECTED_INTEGRITY: ${{ needs.verify.outputs.integrity }}");
    expect(workflow).toContain('npm publish "./release-assets/${{ needs.verify.outputs.artifact-filename }}" --provenance --access public --tag latest');
    expect(workflow).toContain('npm publish "./release-assets/${{ needs.verify.outputs.artifact-filename }}" --provenance --access public --tag next');
    expect(workflow).toContain("if: ${{ always() && hashFiles('artifacts/release-verification/**') != '' }}");
    expect(workflow).toContain("VANILLASKY_EXPECTED_SHA256:");
    expect(workflow).not.toContain("--clobber");
    expect(workflow).not.toMatch(/\bnpm pack(?:\s|$)/);
    expect(workflow).toContain('dist-tags "${{ needs.verify.outputs.name }}" "${{ needs.verify.outputs.version }}"');

    const buildArtifact = workflow.indexOf("- name: Build release artifact");
    const verifyArtifact = workflow.indexOf("- name: Verify exact release artifact");
    const publishNpm = workflow.indexOf("- name: Publish stable package with trusted provenance");
    const verifyNpm = workflow.indexOf("- name: Verify npm artifact identity");
    const verifyPublished = workflow.indexOf("- name: Verify published npm package");
    const publishGitHub = workflow.indexOf("- name: Publish immutable GitHub release");
    expect(buildArtifact).toBeLessThan(verifyArtifact);
    expect(verifyArtifact).toBeLessThan(publishNpm);
    expect(publishNpm).toBeLessThan(verifyNpm);
    expect(verifyNpm).toBeLessThan(verifyPublished);
    expect(verifyPublished).toBeLessThan(publishGitHub);
  });

  it("separates read-only verification, OIDC publishing, and GitHub release permissions", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");

    expect(workflow).toContain("verify:");
    expect(workflow).toContain("publish-npm:");
    expect(workflow).toContain("publish-github-release:");
    expect(workflow).toMatch(/verify:[\s\S]*?permissions:\n\s+contents: read/);
    expect(workflow).toMatch(/publish-npm:[\s\S]*?permissions:\n\s+contents: read\n\s+id-token: write/);
    expect(workflow).toMatch(/publish-github-release:[\s\S]*?permissions:\n\s+contents: write/);
    expect(workflow).not.toMatch(/^permissions:\n\s+contents: write/m);
  });

  it("bootstraps only the first npm publish, then hands future releases to OIDC", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");
    const guide = readFileSync("docs/maintainers/releasing.md", "utf8");

    expect(workflow).toContain("Require first-publish bootstrap authentication");
    expect(workflow).toContain("NPM_BOOTSTRAP_TOKEN: ${{ secrets.NPM_BOOTSTRAP_TOKEN }}");
    expect(workflow).toContain("needs.verify.outputs.version == '0.1.0'");
    expect(guide).toContain("NPM_BOOTSTRAP_TOKEN");
    expect(guide).toContain("npm trust github @vanillaskyai/video");
    expect(guide).toMatch(/revoke.*bootstrap token/is);
    expect(guide).toMatch(/delete.*NPM_BOOTSTRAP_TOKEN/is);
  });

  it("pins actions, npm, repository identity, ancestry, and annotated-tag eligibility", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");

    expect(workflow).toContain("npm@11.17.0");
    expect(workflow).toContain("repository-identity:");
    expect(workflow).toContain('EXPECTED_REPOSITORY: VanillaSkyAi/video');
    expect(workflow).toContain('if [[ "$GITHUB_REPOSITORY" != "$EXPECTED_REPOSITORY" ]]');
    expect(workflow).toContain("needs: repository-identity");
    expect(workflow).not.toMatch(/^\s+if:\s+github\.repository\s*==/m);
    expect(workflow).toContain("VANILLASKY_APPROVED_BRANCH: origin/main");
    expect(workflow).toContain("VANILLASKY_RELEASE_MODE: tag");
    expect(workflow).toContain("release:dry-run -- --ci");
    expect(workflow).toContain("verify-release-integrity.mjs dist-tags");
    expect(workflow).toContain("verify-release-integrity.mjs dist-tags-transition");
    expect(workflow.indexOf("verify-release-integrity.mjs dist-tags-transition"))
      .toBeLessThan(workflow.indexOf("npm publish"));
    expect(workflow).not.toContain("package-manager-cache");
    expect(workflow).toContain("--notes-file release-assets/RELEASE_NOTES.md");
    expect(workflow).not.toMatch(/uses:\s+[^\s]+@v\d+/);
    for (const sha of [
      "3d3c42e5aac5ba805825da76410c181273ba90b1",
      "820762786026740c76f36085b0efc47a31fe5020",
      "ea165f8d65b6e75b540449e92b4886f43607fa02",
      "d3f86a106a0bac45b974a628896c90dbdf5c8093",
    ]) expect(workflow).toContain(sha);
    expect(workflow).not.toContain("11d5960a326750d5838078e36cf38b85af677262");
    expect(workflow).not.toContain("49933ea5288caeca8642d1e84afbd3f7d6820020");
  });

  it("restores the remote annotated tag object after checkout before building the release", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");

    const checkout = workflow.indexOf("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1");
    const restoreTag = workflow.indexOf("- name: Restore annotated release tag object");
    const buildArtifact = workflow.indexOf("- name: Build release artifact");
    expect(restoreTag).toBeGreaterThan(checkout);
    expect(restoreTag).toBeLessThan(buildArtifact);
    expect(workflow).toContain(
      'git fetch --force origin "refs/tags/$GITHUB_REF_NAME:refs/tags/$GITHUB_REF_NAME"',
    );
  });

  it("uses the pinned Playwright image for browser-facing release verification", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");
    const verifyJob = workflow.split("  verify:")[1].split("  publish-npm:")[0];
    const publishedJob = workflow.split("  verify-published:")[1].split("  publish-github-release:")[0];
    const image = "mcr.microsoft.com/playwright:v1.62.0-noble@sha256:baed2032d533817f3dbe6425de795788430ba345e819a1201337009ba17c9d07";

    for (const job of [verifyJob, publishedJob]) {
      expect(job).toContain(`image: ${image}`);
      expect(job).toContain("options: --ipc=host --user pwuser");
      expect(job).not.toContain("playwright install");
    }
  });

  it("documents the fresh-repository and exact first-tag cutover prerequisite", () => {
    const guide = readFileSync("docs/maintainers/releasing.md", "utf8");
    const preflight = readFileSync("scripts/release-preflight.mjs", "utf8");
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));

    expect(manifest.scripts["release:preflight"]).toBe("node scripts/release-preflight.mjs");
    expect(guide).toContain("npm run release:preflight");
    expect(guide).toContain("VanillaSkyAi/video");
    expect(guide).toMatch(/fresh repository/i);
    expect(guide).toMatch(/without importing.*tags|must not import.*tags/is);
    expect(guide).toContain("VanillaSkyAi/vanillasky-sdk");
    expect(guide).toMatch(/unrelated historical `v0\.1\.0`/i);
    expect(preflight).toContain('"ls-remote", "--exit-code", "--tags", "origin"');
    expect(guide).toMatch(/publish.*exact.*tarball[\s\S]*site/i);
  });

  it("fails closed on an incomplete existing GitHub release without mutating it", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");

    expect(workflow).toMatch(/publish-github-release:[\s\S]*?actions\/checkout@[a-f0-9]{40}[\s\S]*?fetch-depth: 0/);
    expect(workflow).toContain('if gh release download "$GITHUB_REF_NAME" --pattern');
    expect(workflow).toContain("verify-github-release.mjs");
    expect(workflow).toContain('--notes-file release-assets/RELEASE_NOTES.md --target main');
    expect(workflow).not.toContain("gh release upload");
    expect(workflow).not.toMatch(/if gh release view[\s\S]*?else\n\s+gh release upload/);
    expect(workflow).not.toContain("--clobber");
  });

  it("records the local-tarball publish argv without invoking npm", () => {
    const workspace = mkdtempSync(join(tmpdir(), "vanillasky-release-publish-spec-"));
    const assets = join(workspace, "release-assets");
    try {
      mkdirSync(assets);
      const filename = "vanillaskyai-video-0.1.0.tgz";
      writeFileSync(join(assets, filename), "recording-only fixture");
      const localTarball = `./release-assets/${filename}`;
      const argvPath = join(workspace, "npm-argv.json");
      const recorderPath = join(workspace, "record-npm.mjs");
      writeFileSync(recorderPath, [
        'import { writeFileSync } from "node:fs";',
        'writeFileSync(process.env.NPM_ARGV_PATH, JSON.stringify(process.argv.slice(2)));',
      ].join("\n"));

      execFileSync(process.execPath, [
        recorderPath,
        "publish",
        localTarball,
        "--provenance",
        "--access",
        "public",
        "--tag",
        "latest",
      ], { cwd: workspace, env: { ...process.env, NPM_ARGV_PATH: argvPath } });

      expect(JSON.parse(readFileSync(argvPath, "utf8"))).toEqual([
        "publish",
        localTarball,
        "--provenance",
        "--access",
        "public",
        "--tag",
        "latest",
      ]);
      expect(localTarball).toMatch(/^\.\/release-assets\/.+\.tgz$/);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("pins every CI action to the reviewed v7 commit", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const actions = [...workflow.matchAll(/uses:\s+(actions\/(?:checkout|setup-node))@([^\s]+)/g)];
    expect(actions).toHaveLength(12);
    for (const [, action, revision] of actions) {
      expect(revision, action).toMatch(/^[a-f0-9]{40}$/);
    }
    expect(workflow).toContain("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1");
    expect(workflow).toContain("actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0");
  });

  it("parallelizes expensive consumer gates and uses one immutable browser image", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    const browserJob = workflow.split("  browser-compatibility:")[1];

    expect(workflow).toContain("consumer-compatibility:");
    expect(workflow).toContain("provider-compatibility:");
    expect(workflow).toMatch(/consumer-compatibility:[\s\S]*?npm run verify:onboarding/);
    expect(workflow).toMatch(/provider-compatibility:[\s\S]*?npm run verify:nextjs/);
    expect(workflow).toContain(
      "mcr.microsoft.com/playwright:v1.62.0-noble@sha256:baed2032d533817f3dbe6425de795788430ba345e819a1201337009ba17c9d07",
    );
    expect(browserJob).toContain("options: --ipc=host --user pwuser");
    expect(manifest.devDependencies["@playwright/test"]).toBe("1.62.0");
    expect(browserJob).not.toContain("playwright install");
    expect(workflow.match(/npx playwright test(?:\s|$)/g)).toHaveLength(1);
    expect(workflow).not.toContain("matrix.browser");
    expect(workflow.match(/timeout-minutes:/g)).toHaveLength(6);
  });

  it("compiles the source-owned template tree in the clean-room consumer", () => {
    const verifier = readFileSync("scripts/verify-onboarding.mjs", "utf8");

    expect(verifier).toContain('installSpec, "tsx@4.23.12"');
    expect(verifier).toContain('join(app, "src", "template-ownership.ts")');
    expect(verifier).toContain('export { templates as browserTemplates } from "../vanillasky/index";');
    expect(verifier).toContain('export { templates as serverTemplates } from "../vanillasky/server";');
    expect(verifier.indexOf('runCli(["add", "bigNumber"])'))
      .toBeLessThan(verifier.lastIndexOf('run("npm", ["run", "build"], app)'));
  });

  it("exercises the complete packed CLI ownership journey without weakening the scaffold", () => {
    const verifier = readFileSync("scripts/verify-onboarding.mjs", "utf8");

    for (const command of ["list", "describe", "create", "add", "sync", "check"]) {
      expect(verifier).toContain(`runCli(["${command}"`);
    }
    expect(verifier).toContain('runCli(["add", "bigNumber", "--dry-run"]');
    expect(verifier).toContain('runCli(["add", "bigNumber", "--diff"]');
    expect(verifier).toContain('runCli(["sync", "--check"]');
    expect(verifier).toContain("assertProjectImports");
    expect(verifier).toContain("tsconfigSnapshot");
    expect(verifier).toContain("customer-owned acceptance edit");
    expect(verifier).toContain("Expected sync --check to detect deliberate drift");
    expect(verifier).toContain("repeatedAddTreeHash");
    expect(verifier).toContain("server-only-consumer");
    expect(verifier).toContain("Server-only consumer unexpectedly installed React");
    expect(verifier).not.toContain("skipLibCheck");
  });
});
