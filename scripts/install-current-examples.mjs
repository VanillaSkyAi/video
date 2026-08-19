#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseNpmPackJson } from "./lib/parse-npm-pack-json.mjs";
import { selectPackedArtifact } from "./lib/release-integrity.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspace = mkdtempSync(join(tmpdir(), "vanillasky-current-examples-"));

try {
  const selectedArtifact = selectPackedArtifact({
    providedPath: process.env.VANILLASKY_PACKED_TARBALL
      ? resolve(process.env.VANILLASKY_PACKED_TARBALL)
      : undefined,
    expectedIntegrity: process.env.VANILLASKY_EXPECTED_INTEGRITY,
    expectedSha256: process.env.VANILLASKY_EXPECTED_SHA256,
    packArtifact: () => {
      const [packed] = parseNpmPackJson(execFileSync("npm", [
        "pack", "--silent", "--json", "--ignore-scripts", "--pack-destination", workspace,
      ], { cwd: root, encoding: "utf8" }));
      return { path: join(workspace, packed.filename), integrity: packed.integrity };
    },
  });
  const tarball = selectedArtifact.path;
  const candidateVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

  for (const example of ["react-vite", "server-integrations", "nextjs-quickstart"]) {
    const cwd = join(root, "examples", example);
    execFileSync("npm", [
      "install", "--package-lock=false", "--ignore-scripts", "--no-audit", "--no-fund", "--no-save", tarball,
    ], { cwd, stdio: "inherit" });
    const installedVersion = execFileSync(process.execPath, [
      "-p", "require('./node_modules/@vanillaskyai/video/package.json').version",
    ], { cwd, encoding: "utf8" }).trim();
    if (installedVersion !== candidateVersion) {
      throw new Error(`${example} installed ${installedVersion}, expected packed ${candidateVersion}`);
    }
  }
  console.log(`Examples installed current packed SDK ${candidateVersion}.`);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
