import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const TEXT_VERSION_SURFACES = [
  "README.md",
  "PUBLIC-API.md",
  "docs/getting-started.md",
  "docs/integrate-nextjs.md",
  "skills/vanillasky/SKILL.md",
];

export const DEPENDENCY_MANIFESTS = [
  "examples/react-vite/package.json",
  "examples/server-integrations/package.json",
  "examples/nextjs-quickstart/package.json",
  "tests/fixtures/nextjs-provider-app/package.json",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function synchronizeVersionSurfaces({ root, packageName, previousVersion, version }) {
  const repositoryRoot = resolve(root);
  const packageLockPath = join(repositoryRoot, "package-lock.json");
  const packageLock = readJson(packageLockPath);
  packageLock.version = version;
  if (packageLock.packages?.[""]) packageLock.packages[""].version = version;

  const updates = new Map([[packageLockPath, formatJson(packageLock)]]);
  for (const relativePath of TEXT_VERSION_SURFACES) {
    const path = join(repositoryRoot, relativePath);
    const source = readFileSync(path, "utf8");
    if (!source.includes(previousVersion)) {
      throw new Error(`${relativePath} does not contain current version ${previousVersion}`);
    }
    updates.set(path, previousVersion === version ? source : source.replaceAll(previousVersion, version));
  }
  for (const relativePath of DEPENDENCY_MANIFESTS) {
    const path = join(repositoryRoot, relativePath);
    const dependencyManifest = readJson(path);
    if (dependencyManifest.dependencies?.[packageName] !== previousVersion && previousVersion !== version) {
      throw new Error(`${relativePath} does not pin ${packageName}@${previousVersion}`);
    }
    dependencyManifest.dependencies[packageName] = version;
    updates.set(path, formatJson(dependencyManifest));
  }

  for (const [path, contents] of updates) writeFileSync(path, contents);
}
