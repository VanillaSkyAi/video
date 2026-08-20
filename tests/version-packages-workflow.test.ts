import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const workflowPath = resolve(root, ".github/workflows/version-packages.yml");

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
    expect(workflow).toContain("github.sha");
    expect(workflow).toContain("origin/main");
    expect(workflow).not.toMatch(/npm publish|npm dist-tag|git tag|gh release/);
    expect(workflow).not.toContain("pull-requests: write");
    expect(workflow).not.toContain("gh pr create");
    expect(workflow).not.toContain("changesets/action");
  });

  it("passes credentials only to a race-safe exact-branch push", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow.match(/GITHUB_TOKEN:/g)).toHaveLength(1);
    expect(workflow).toContain("--force-with-lease=refs/heads/changeset-release/main:");
    expect(workflow).toContain("HEAD:refs/heads/changeset-release/main");
    expect(workflow).not.toContain("HEAD:main");
    expect(workflow).toContain("scripts/verify-version-packages-pr.mjs");
    expect(workflow).toContain("github-actions[bot]");
  });

  it("publishes a direct compare URL without opening or merging a PR", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("https://github.com/VanillaSkyAi/video/compare/main...changeset-release/main?expand=1");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
  });
});
