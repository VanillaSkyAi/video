import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("superseded npm package retirement", () => {
  it("is manual, secret-backed, and deprecates the package if npm refuses deletion", () => {
    const workflow = readFileSync(".github/workflows/retire-superseded-package.yml", "utf8");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("NPM_BOOTSTRAP_TOKEN: ${{ secrets.NPM_BOOTSTRAP_TOKEN }}");
    expect(workflow).toContain('npm unpublish "$PACKAGE_SPEC" --force');
    expect(workflow).toContain('npm deprecate "$PACKAGE_SPEC@*"');
    expect(workflow).toContain("Package renamed to $REPLACEMENT_PACKAGE");
    expect(workflow).toContain('npm view "$PACKAGE_SPEC"');
  });
});
