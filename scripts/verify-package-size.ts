#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { initSync, parse } from "es-module-lexer";
import { parseNpmPackJson } from "./lib/parse-npm-pack-json.mjs";
import { selectPackedArtifact } from "./lib/release-integrity.mjs";

export const PACKED_SIZE_BUDGET = 1_250_000;
export const UNPACKED_SIZE_BUDGET = 5_000_000;
export const INITIAL_CLIENT_GZIP_BUDGET = 50_000;
export const TEST_KIT_GZIP_BUDGET = 50_000;
export const LOADED_TEST_KIT_GZIP_BUDGET = 60_000;
export const ENTRY_GZIP_HEADROOM = 5_000;

initSync();

interface PackedPackageSize {
  size: number;
  unpackedSize: number;
}

export function assertPackageSizeWithinBudget({ size, unpackedSize }: PackedPackageSize): void {
  if (size > PACKED_SIZE_BUDGET) {
    throw new Error(`Packed size ${size} exceeds ${PACKED_SIZE_BUDGET} byte budget`);
  }
  if (unpackedSize > UNPACKED_SIZE_BUDGET) {
    throw new Error(`Unpacked size ${unpackedSize} exceeds ${UNPACKED_SIZE_BUDGET} byte budget`);
  }
}

export function listLocalModuleSpecifiers(
  source: string,
  options: { includeDynamic?: boolean } = {},
): string[] {
  const [imports] = parse(source);
  return imports.flatMap((entry) => {
    if (!entry.n?.startsWith("./") || !entry.n.endsWith(".js")) return [];
    if (entry.d >= 0 && !options.includeDynamic) return [];
    return [entry.n];
  });
}

export function measureEntryGzip(
  dist: string,
  entry: string,
  options: { includeDynamic?: boolean } = {},
): number {
  const visited = new Set<string>();
  const visit = (filename: string): number => {
    if (visited.has(filename)) return 0;
    visited.add(filename);
    const source = readFileSync(join(dist, filename), "utf8");
    const imports = listLocalModuleSpecifiers(source, options).map((specifier) =>
      normalize(join(dirname(filename), specifier)),
    );
    if (imports.some((path) => path.startsWith(".."))) {
      throw new Error(`Entry graph for ${entry} escapes the dist directory`);
    }
    return gzipSync(source).length + imports.reduce((total, path) => total + visit(path), 0);
  };
  return visit(entry);
}

export function measureInitialClientGzip(dist: string): number {
  return measureEntryGzip(dist, "react.js");
}

export function assertTestKitWithinBudget(size: number): void {
  if (size > TEST_KIT_GZIP_BUDGET) {
    throw new Error(`Test kit gzip size ${size} exceeds ${TEST_KIT_GZIP_BUDGET} byte budget`);
  }
  if (TEST_KIT_GZIP_BUDGET - size < ENTRY_GZIP_HEADROOM) {
    throw new Error(`Test kit gzip size ${size} leaves less than ${ENTRY_GZIP_HEADROOM} bytes of release headroom`);
  }
}

export function assertLoadedTestKitWithinBudget(size: number): void {
  if (size > LOADED_TEST_KIT_GZIP_BUDGET) {
    throw new Error(`Loaded test kit gzip size ${size} exceeds ${LOADED_TEST_KIT_GZIP_BUDGET} byte budget`);
  }
  if (LOADED_TEST_KIT_GZIP_BUDGET - size < ENTRY_GZIP_HEADROOM) {
    throw new Error(`Loaded test kit gzip size ${size} leaves less than ${ENTRY_GZIP_HEADROOM} bytes of release headroom`);
  }
}

export function assertInitialClientWithinBudget(size: number): void {
  if (size > INITIAL_CLIENT_GZIP_BUDGET) {
    throw new Error(`Initial client gzip size ${size} exceeds ${INITIAL_CLIENT_GZIP_BUDGET} byte budget`);
  }
  if (INITIAL_CLIENT_GZIP_BUDGET - size < ENTRY_GZIP_HEADROOM) {
    throw new Error(`Initial client gzip size ${size} leaves less than ${ENTRY_GZIP_HEADROOM} bytes of release headroom`);
  }
}

function measureUnpackedSize(directory: string): number {
  return readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const path = join(directory, entry.name);
    return total + (entry.isDirectory() ? measureUnpackedSize(path) : statSync(path).size);
  }, 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const workspace = mkdtempSync(join(tmpdir(), "vanillasky-package-size-"));
  try {
    const selectedArtifact = selectPackedArtifact({
      providedPath: process.env.VANILLASKY_PACKED_TARBALL
        ? resolve(process.env.VANILLASKY_PACKED_TARBALL)
        : undefined,
      expectedIntegrity: process.env.VANILLASKY_EXPECTED_INTEGRITY,
      expectedSha256: process.env.VANILLASKY_EXPECTED_SHA256,
      packArtifact: () => {
        execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
        const [packed] = parseNpmPackJson(execFileSync("npm", [
          "pack", "--silent", "--json", "--ignore-scripts", "--pack-destination", workspace,
        ], { cwd: root, encoding: "utf8" })) as Array<{ filename: string; integrity: string }>;
        return { path: join(workspace, packed.filename), integrity: packed.integrity };
      },
    });
    const extracted = join(workspace, "extracted");
    mkdirSync(extracted);
    execFileSync("tar", ["-xzf", selectedArtifact.path, "-C", extracted]);
    const packageRoot = join(extracted, "package");
    const packed: PackedPackageSize = {
      size: statSync(selectedArtifact.path).size,
      unpackedSize: measureUnpackedSize(packageRoot),
    };
    assertPackageSizeWithinBudget(packed);
    const initialClientGzip = measureInitialClientGzip(join(packageRoot, "dist"));
    assertInitialClientWithinBudget(initialClientGzip);
    const testKitGzip = measureEntryGzip(join(packageRoot, "dist"), "test.js");
    assertTestKitWithinBudget(testKitGzip);
    const loadedTestKitGzip = measureEntryGzip(join(packageRoot, "dist"), "test.js", { includeDynamic: true });
    assertLoadedTestKitWithinBudget(loadedTestKitGzip);
    console.log(`Package size passed: ${packed.size} packed, ${packed.unpackedSize} unpacked, ${initialClientGzip} initial client gzip bytes, ${testKitGzip} initial test kit gzip bytes, ${loadedTestKitGzip} loaded test kit gzip bytes.`);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
