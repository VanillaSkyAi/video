import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assertValidSemver, compareSemver } from "./release-integrity.mjs";
import { synchronizeVersionSurfaces, UNRELEASED_PLACEHOLDER } from "./version-surfaces.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function promoteUnreleased(changelog, targetVersion) {
  const escapedTarget = targetVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^## ${escapedTarget}\\s*$`, "m").test(changelog)) {
    throw new Error(`CHANGELOG.md already contains release ${targetVersion} while package.json has another version`);
  }
  const heading = /^## Unreleased\s*$/m.exec(changelog);
  if (!heading) throw new Error("CHANGELOG.md must contain an Unreleased section");
  const contentStart = heading.index + heading[0].length;
  const tail = changelog.slice(contentStart);
  const nextHeadingOffset = tail.search(/^## /m);
  const contentEnd = nextHeadingOffset >= 0 ? contentStart + nextHeadingOffset : changelog.length;
  const releaseNotes = changelog
    .slice(contentStart, contentEnd)
    .replaceAll(UNRELEASED_PLACEHOLDER, "")
    .trim();
  if (releaseNotes.length < 120) {
    throw new Error("CHANGELOG.md must contain substantive Unreleased release notes");
  }
  const before = changelog.slice(0, heading.index);
  const after = changelog.slice(contentEnd).replace(/^\s+/, "");
  return `${before}## Unreleased\n\n${UNRELEASED_PLACEHOLDER}\n\n## ${targetVersion}\n\n${releaseNotes}\n\n${after}`;
}

export function prepareRelease({ root, targetVersion }) {
  const repositoryRoot = resolve(root);
  assertValidSemver(targetVersion);

  const packagePath = join(repositoryRoot, "package.json");
  const manifest = readJson(packagePath);
  const currentVersion = manifest.version;
  assertValidSemver(currentVersion);
  if (targetVersion !== currentVersion && compareSemver(targetVersion, currentVersion) <= 0) {
    throw new Error(`Release target ${targetVersion} must be newer than current version ${currentVersion}`);
  }

  manifest.version = targetVersion;
  const updates = new Map([[packagePath, formatJson(manifest)]]);
  const changelogPath = join(repositoryRoot, "CHANGELOG.md");
  updates.set(
    changelogPath,
    currentVersion === targetVersion
      ? readFileSync(changelogPath, "utf8")
      : promoteUnreleased(readFileSync(changelogPath, "utf8"), targetVersion),
  );

  synchronizeVersionSurfaces({
    root: repositoryRoot,
    packageName: manifest.name,
    previousVersion: currentVersion,
    version: targetVersion,
  });
  for (const [path, contents] of updates) writeFileSync(path, contents);
  return { previousVersion: currentVersion, version: targetVersion };
}
