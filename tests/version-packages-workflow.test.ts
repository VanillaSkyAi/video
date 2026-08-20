import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const workflowPath = resolve(root, ".github/workflows/version-packages.yml");
const fixtures: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function sha256(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function extractRunStep(name: string): string {
  const workflow = readFileSync(workflowPath, "utf8");
  const marker = `      - name: ${name}\n`;
  const stepStart = workflow.indexOf(marker);
  if (stepStart < 0) throw new Error(`Missing workflow step ${name}`);
  const runStart = workflow.indexOf("        run: |\n", stepStart);
  if (runStart < 0) throw new Error(`Missing run block for ${name}`);
  const bodyStart = runStart + "        run: |\n".length;
  const nextStep = workflow.indexOf("\n      - name:", bodyStart);
  return workflow.slice(bodyStart, nextStep < 0 ? undefined : nextStep)
    .split("\n")
    .map((line) => line.startsWith("          ") ? line.slice(10) : line)
    .join("\n");
}

type HandoffFixture = {
  baseSha: string;
  digest: string;
  handoff: string;
  remote: string;
  runnerTemp: string;
  source: string;
  headSha: string;
};

function refreshChecksums(fixture: Omit<HandoffFixture, "digest">): string {
  const files = ["base-sha", "remote-sha", "tree-sha", "version-packages.patch"];
  const manifest = files.map((name) => {
    const contents = readFileSync(join(fixture.handoff, name));
    return `${sha256(contents)}  ${name}`;
  }).join("\n") + "\n";
  writeFileSync(join(fixture.handoff, "handoff.sha256"), manifest);
  return sha256(manifest);
}

function createHandoffFixture(kind: "normal" | "unexpected" | "symlink" | "executable" = "normal"): HandoffFixture {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "vanillasky-handoff-workflow-"));
  fixtures.push(fixtureRoot);
  const source = join(fixtureRoot, "source");
  const remote = join(fixtureRoot, "remote.git");
  const runnerTemp = join(fixtureRoot, "runner");
  const handoff = join(runnerTemp, "version-packages-handoff");
  mkdirSync(source, { recursive: true });
  mkdirSync(handoff, { recursive: true });
  git(source, "init", "--initial-branch=main");
  git(source, "config", "user.name", "VanillaSky Test");
  git(source, "config", "user.email", "test@vanillasky.invalid");
  writeFileSync(join(source, "package.json"), '{"name":"@vanillaskyai/video","version":"0.1.0"}\n');
  writeFileSync(join(source, "README.md"), "fixture\n");
  git(source, "add", "--all");
  git(source, "commit", "-m", "base");
  const baseSha = git(source, "rev-parse", "HEAD");
  execFileSync("git", ["clone", "--quiet", "--bare", source, remote]);

  if (kind === "unexpected") {
    writeFileSync(join(source, "unexpected.txt"), "not allowlisted\n");
  } else if (kind === "symlink") {
    rmSync(join(source, "package.json"));
    symlinkSync("README.md", join(source, "package.json"));
  } else {
    writeFileSync(join(source, "package.json"), '{"name":"@vanillaskyai/video","version":"0.1.1-beta.0"}\n');
    if (kind === "executable") chmodSync(join(source, "package.json"), 0o755);
  }
  git(source, "add", "--all");
  git(source, "commit", "-m", "chore: version packages");
  const headSha = git(source, "rev-parse", "HEAD");
  writeFileSync(join(handoff, "base-sha"), `${baseSha}\n`);
  writeFileSync(join(handoff, "remote-sha"), "\n");
  writeFileSync(join(handoff, "tree-sha"), `${git(source, "rev-parse", "HEAD^{tree}")}\n`);
  writeFileSync(join(handoff, "version-packages.patch"), execFileSync(
    "git",
    ["diff", "--full-index", "--binary", "--no-renames", baseSha, headSha],
    { cwd: source },
  ));
  const provisional = { baseSha, handoff, remote, runnerTemp, source, headSha };
  return { ...provisional, digest: refreshChecksums(provisional) };
}

function runValidation(fixture: HandoffFixture, digest = fixture.digest) {
  const script = extractRunStep("Validate handoff and reconstruct generated commit")
    .replace("${{ github.ref == 'refs/heads/main' }}", "true")
    .replace("https://github.com/VanillaSkyAi/video.git", fixture.remote);
  const githubOutput = join(fixture.runnerTemp, "github-output");
  const result = spawnSync("bash", ["-c", script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      EXPECTED_HANDOFF_DIGEST: digest,
      EXPECTED_MAIN_SHA: fixture.baseSha,
      GITHUB_OUTPUT: githubOutput,
      GITHUB_REPOSITORY: "VanillaSkyAi/video",
      RUNNER_TEMP: fixture.runnerTemp,
    },
  });
  return { githubOutput, result };
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("Version Packages workflow", () => {
  it("prepares only an exact protected-main snapshot and cannot publish", () => {
    expect(existsSync(workflowPath)).toBe(true);
    if (!existsSync(workflowPath)) return;
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toMatch(/push:\s*\n\s*branches: \[main\]/);
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('test "$GITHUB_REPOSITORY" = "VanillaSkyAi/video"');
    expect(workflow).toContain("github.sha");
    expect(workflow).toContain("origin/main");
    expect(workflow).not.toMatch(/npm publish|npm dist-tag|git tag|gh release/);
    expect(workflow).not.toContain("pull-requests: write");
    expect(workflow).not.toContain("gh pr create");
    expect(workflow).not.toContain("changesets/action");
  });

  it("passes credentials only to a race-safe exact-branch push", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const publishJob = workflow.slice(workflow.indexOf("  publish:"));

    expect(workflow).toMatch(/permissions:\n\s+contents: read/);
    expect(publishJob).toContain("permissions:\n      contents: write");
    expect(publishJob).toContain("needs: prepare");
    expect(publishJob).not.toContain("npm ci");
    expect(publishJob).not.toContain("npm run");
    expect(publishJob).not.toContain("actions/setup-node");
    expect(workflow.match(/GITHUB_TOKEN:/g)).toHaveLength(1);
    expect(workflow).toContain("--force-with-lease=refs/heads/changeset-release/main:");
    expect(workflow).toContain("HEAD:refs/heads/changeset-release/main");
    expect(workflow).not.toContain("HEAD:main");
    expect(workflow).toContain("scripts/verify-version-packages-pr.mjs");
    expect(workflow).toContain('(cd "$base_verifier" && npm ci --ignore-scripts)');
    expect(workflow).not.toContain('npm --prefix "$base_verifier" ci');
    expect(workflow).toContain('CHANGESETS_CLI_PATH="$base_verifier/node_modules/@changesets/cli/bin.js"');
    expect(workflow).toContain('CHANGESETS_PARSE_PATH="$base_verifier/node_modules/@changesets/parse/dist/index.mjs"');
    expect(workflow).not.toContain('CHANGESETS_CLI_PATH="$GITHUB_WORKSPACE/node_modules/@changesets/cli/bin.js"');
    expect(workflow).toContain("github-actions[bot]");
  });

  it("hands a checksummed patch to a write-only job that validates an allowlisted regular-file tree", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02");
    expect(workflow).toContain("actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093");
    expect(workflow).toContain("version-packages.patch");
    expect(workflow).toContain("handoff_digest: ${{ steps.handoff.outputs.digest }}");
    expect(workflow).toContain("EXPECTED_HANDOFF_DIGEST: ${{ needs.prepare.outputs.handoff_digest }}");
    expect(workflow).toContain("handoff.sha256");
    expect(workflow).toContain("sha256sum -c handoff.sha256");
    expect(workflow).toContain("! -type f");
    expect(workflow).toContain("write-tree");
    expect(workflow).toContain("100644");
    expect(workflow).toContain('[[ "$status" == "M" ]]');
    expect(workflow).toContain("Unexpected generated path");
  });

  it("executes the publish-side validator successfully for an exact handoff", () => {
    const fixture = createHandoffFixture();
    const { githubOutput, result } = runValidation(fixture);

    expect(result.status, result.stderr).toBe(0);
    const outputs = Object.fromEntries(readFileSync(githubOutput, "utf8").trim().split("\n").map((line) => line.split("=", 2)));
    expect(outputs.head_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(git(outputs.repository, "rev-parse", "HEAD^{tree}"))
      .toBe(git(fixture.source, "rev-parse", `${fixture.headSha}^{tree}`));
  });

  it("rejects a forged handoff digest and changed bytes under a valid manifest digest", () => {
    const forgedDigest = createHandoffFixture();
    expect(runValidation(forgedDigest, "0".repeat(64)).result.status).not.toBe(0);

    const forgedBytes = createHandoffFixture();
    writeFileSync(join(forgedBytes.handoff, "version-packages.patch"), "forged\n", { flag: "a" });
    expect(runValidation(forgedBytes).result.status).not.toBe(0);
  });

  it.each([
    ["an unexpected path", "unexpected"],
    ["a symlink", "symlink"],
    ["a 100755 file", "executable"],
  ] as const)("rejects %s in the generated tree", (_name, kind) => {
    const fixture = createHandoffFixture(kind);

    expect(runValidation(fixture).result.status).not.toBe(0);
  });

  it("rejects an altered expected tree even when its checksums are internally consistent", () => {
    const fixture = createHandoffFixture();
    writeFileSync(join(fixture.handoff, "tree-sha"), `${git(fixture.source, "rev-parse", `${fixture.baseSha}^{tree}`)}\n`);
    fixture.digest = refreshChecksums(fixture);

    expect(runValidation(fixture).result.status).not.toBe(0);
  });

  it("rejects a stale generated-branch expectation before reconstruction", () => {
    const fixture = createHandoffFixture();
    git(fixture.source, "push", fixture.remote, `${fixture.headSha}:refs/heads/changeset-release/main`);

    expect(runValidation(fixture).result.status).not.toBe(0);
  });

  it("fails closed when the generated branch races after validation but before push", () => {
    const fixture = createHandoffFixture();
    const validation = runValidation(fixture);
    expect(validation.result.status, validation.result.stderr).toBe(0);
    const outputs = Object.fromEntries(readFileSync(validation.githubOutput, "utf8").trim().split("\n").map((line) => line.split("=", 2)));
    git(fixture.source, "push", fixture.remote, `${fixture.headSha}:refs/heads/changeset-release/main`);
    const pushScript = extractRunStep("Push exact dedicated branch").replace("${{ github.sha }}", fixture.baseSha);
    const result = spawnSync("bash", ["-c", pushScript], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GENERATED_HEAD_SHA: outputs.head_sha,
        GITHUB_STEP_SUMMARY: join(fixture.runnerTemp, "summary"),
        GITHUB_TOKEN: "test-token",
        PUBLISH_REPOSITORY: outputs.repository,
        REMOTE_SHA: outputs.remote_sha,
      },
    });

    expect(result.status).not.toBe(0);
  });

  it("publishes a direct compare URL without opening or merging a PR", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("https://github.com/VanillaSkyAi/video/compare/main...changeset-release/main?expand=1");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
  });
});
