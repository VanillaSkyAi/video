import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("legacy npm package retirement", () => {
  it("is manual, secret-backed, and deprecates the package if npm refuses deletion", () => {
    const workflow = readFileSync(".github/workflows/retire-legacy-package.yml", "utf8");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("NPM_BOOTSTRAP_TOKEN: ${{ secrets.NPM_BOOTSTRAP_TOKEN }}");
    expect(workflow).toContain("npm unpublish @vanillaskyai/sdk --force");
    expect(workflow).toContain("npm deprecate '@vanillaskyai/sdk@*'");
    expect(workflow).toContain("Package renamed to @vanillaskyai/video");
    expect(workflow).toContain("npm view @vanillaskyai/sdk");
  });
});
