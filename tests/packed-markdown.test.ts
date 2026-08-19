import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyPackedMarkdownDocumentation } from "../scripts/lib/packed-markdown.mjs";

const temporaryDirectories: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vanillasky-packed-markdown-"));
  temporaryDirectories.push(root);
  const repositoryRoot = join(root, "repository");
  const realPackageRoot = join(root, "real-package");
  const packageRoot = join(root, "package-link");
  const outside = join(root, "outside.txt");
  mkdirSync(join(repositoryRoot, "docs"), { recursive: true });
  mkdirSync(join(realPackageRoot, "docs"), { recursive: true });
  symlinkSync(realPackageRoot, packageRoot);
  writeFileSync(outside, "outside\n");

  const readme = [
    "# Package",
    "",
    "[Guide](docs/guide.md)",
    "[Guide fragment](docs/guide.md#details)",
    "[Guide title](docs/guide.md \"Guide title\")",
    "[Anchor](#package)",
    "[External](https://example.test/docs)",
    "[Angle external](<https://example.test/angle>)",
    "[Inside symlink](docs/inside.txt)",
    "",
  ].join("\n");
  for (const directory of [repositoryRoot, realPackageRoot]) {
    writeFileSync(join(directory, "README.md"), readme);
    writeFileSync(join(directory, "docs", "guide.md"), "# Guide\n\n## Details\n");
    writeFileSync(join(directory, "docs", "asset.txt"), "inside\n");
  }
  symlinkSync(join(realPackageRoot, "docs", "asset.txt"), join(realPackageRoot, "docs", "inside.txt"));

  return { outside, packageRoot, realPackageRoot, repositoryRoot };
}

afterEach(async () => {
  const { rmSync } = await import("node:fs");
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("packed Markdown verification", () => {
  it("accepts every valid local Markdown form through a symlinked package root", () => {
    const { packageRoot, repositoryRoot } = fixture();

    const documentation = verifyPackedMarkdownDocumentation({ packageRoot, repositoryRoot });
    expect(documentation).toHaveLength(2);
    expect(documentation).toEqual(expect.arrayContaining([
      "README.md",
      join("docs", "guide.md"),
    ]));
  });

  it("rejects missing local links", () => {
    const { packageRoot, realPackageRoot, repositoryRoot } = fixture();
    const broken = "[Missing](docs/missing.md)\n";
    writeFileSync(join(realPackageRoot, "README.md"), broken);
    writeFileSync(join(repositoryRoot, "README.md"), broken);

    expect(() => verifyPackedMarkdownDocumentation({ packageRoot, repositoryRoot }))
      .toThrow("Packed documentation has a broken local link in README.md");
  });

  it("rejects lexical escapes even when the outside target exists", () => {
    const { packageRoot, realPackageRoot, repositoryRoot } = fixture();
    const escaped = "[Outside](../outside.txt)\n";
    writeFileSync(join(realPackageRoot, "README.md"), escaped);
    writeFileSync(join(repositoryRoot, "README.md"), escaped);

    expect(() => verifyPackedMarkdownDocumentation({ packageRoot, repositoryRoot }))
      .toThrow("Packed documentation escapes the package root in README.md");
  });

  it("rejects a local link whose symlink resolves outside the package", () => {
    const { outside, packageRoot, realPackageRoot, repositoryRoot } = fixture();
    symlinkSync(outside, join(realPackageRoot, "docs", "outside.txt"));
    const linked = "[Outside symlink](docs/outside.txt)\n";
    writeFileSync(join(realPackageRoot, "README.md"), linked);
    writeFileSync(join(repositoryRoot, "README.md"), linked);

    expect(() => verifyPackedMarkdownDocumentation({ packageRoot, repositoryRoot }))
      .toThrow("Packed documentation escapes the package root in README.md");
  });

  it("rejects shipped Markdown bytes that differ from repository source", () => {
    const { packageRoot, realPackageRoot, repositoryRoot } = fixture();
    writeFileSync(join(realPackageRoot, "README.md"), "# Altered\n");

    expect(() => verifyPackedMarkdownDocumentation({ packageRoot, repositoryRoot }))
      .toThrow("Packed documentation differs from repository source: README.md");
  });
});
