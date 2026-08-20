import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

interface SurfaceEntry {
  source: string;
  declaration: string;
  runtime: string;
  environment: "universal" | "server" | "browser" | "test";
  runtimeExports: string[];
  typeExports: string[];
}

const root = resolve(import.meta.dirname, "..");
const surface = JSON.parse(
  readFileSync(resolve(root, "tests/fixtures/public-api-surface.json"), "utf8"),
) as Record<string, SurfaceEntry>;
const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
if (!configPath) throw new Error("Missing tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();

function sourceExports(sourcePath: string): { runtimeExports: string[]; typeExports: string[] } {
  const source = program.getSourceFile(resolve(root, sourcePath));
  const module = source && checker.getSymbolAtLocation(source);
  if (!module) throw new Error(`Missing public entry source: ${sourcePath}`);

  const runtimeExports: string[] = [];
  const typeExports: string[] = [];
  for (const exported of checker.getExportsOfModule(module)) {
    const target = exported.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(exported)
      : exported;
    if (target.flags & ts.SymbolFlags.Value) runtimeExports.push(exported.name);
    if (target.flags & ts.SymbolFlags.Type) typeExports.push(exported.name);
  }
  return {
    runtimeExports: runtimeExports.sort(),
    typeExports: typeExports.sort(),
  };
}

describe("frozen public API surface", () => {
  it("matches every source entry to the reviewed runtime and type export manifest", () => {
    for (const [entry, expected] of Object.entries(surface)) {
      expect(sourceExports(expected.source), entry).toEqual({
        runtimeExports: [...expected.runtimeExports].sort(),
        typeExports: [...expected.typeExports].sort(),
      });
    }
  });

  it("has an executable declaration/runtime verifier wired into release and packed checks", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const packedVerifier = readFileSync(resolve(root, "scripts/verify-packed-package.mjs"), "utf8");

    expect(existsSync(resolve(root, "scripts/verify-public-api-surface.mjs"))).toBe(true);
    expect(existsSync(resolve(root, "scripts/lib/public-api-surface.mjs"))).toBe(true);
    expect(existsSync(resolve(root, "tests/fixtures/public-api-signatures.json"))).toBe(true);
    expect(manifest.scripts["verify:api"]).toBe("npm run build && node scripts/verify-public-api-surface.mjs");
    expect(manifest.scripts["release:build"]).toBe("node scripts/release-build.mjs");
    expect(packedVerifier).toContain("verifyPublicApiSurface");
    expect(packedVerifier).toContain("public-api-signatures.json");
  });

  it("installs the injected tarball with React peers before verifying declarations", () => {
    const verifier = readFileSync(resolve(root, "scripts/verify-public-api-surface.mjs"), "utf8");
    expect(verifier).toContain('"install", "--ignore-scripts"');
    expect(verifier).toContain('"react@18"');
    expect(verifier).toContain('"@types/react@18"');
    expect(verifier).toContain('"node_modules", "@vanillaskyai", "video"');
  });

  it("documents the conservative limit of normalized signature comparison", () => {
    const publicApi = readFileSync(resolve(root, "PUBLIC-API.md"), "utf8");

    expect(publicApi).toContain("intentionally conservative");
    expect(publicApi).toContain("optional field additions");
    expect(publicApi).toContain("input and output positions");
  });
});
