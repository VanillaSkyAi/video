import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const CHANGESET_RECORD = /^\.changeset\/[^/]+\.md$/;

export function listPendingChangesetPaths({ root }) {
  const repositoryRoot = resolve(root);
  const directory = join(repositoryRoot, ".changeset");
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .map((entry) => `.changeset/${entry.name}`)
    .filter((path) => path !== ".changeset/README.md" && CHANGESET_RECORD.test(path))
    .sort();
}

export function listPendingPackageChangesetPaths({ root }) {
  const repositoryRoot = resolve(root);
  return listPendingChangesetPaths({ root: repositoryRoot }).filter((path) => {
    const contents = readFileSync(join(repositoryRoot, path), "utf8").replaceAll("\r\n", "\n");
    const lines = contents.split("\n");
    const end = lines.indexOf("---", 1);
    if (lines[0] !== "---" || end < 1) throw new Error(`Changeset ${path} has malformed frontmatter`);
    return lines.slice(1, end).join("\n").trim().length > 0;
  });
}

export function assertCommittedRegularFile({ root, path, ref = "HEAD", label = "File" }) {
  const repositoryRoot = resolve(root);
  const absolutePath = resolve(repositoryRoot, path);
  const stat = lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} ${path} must be a regular file, not a symlink or another file type`);
  }
  const treeEntry = execFileSync("git", ["ls-tree", "-z", ref, "--", path], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  const match = /^(\d+) (\S+) ([0-9a-f]+)\t([^\0]+)\0$/.exec(treeEntry);
  if (!match || match[1] !== "100644" || match[2] !== "blob" || match[4] !== path) {
    throw new Error(`${label} ${path} must be a committed 100644 regular file at ${ref}`);
  }
}

export function assertChangesetRecordFile({ root, path, ref = "HEAD" }) {
  if (path === ".changeset/README.md" || !CHANGESET_RECORD.test(path)) {
    throw new Error(`Changeset record path is invalid: ${path}`);
  }
  assertCommittedRegularFile({ root, path, ref, label: "Changeset" });
}

export function assertNoPendingPackageChangesets({ root }) {
  const pendingChangesets = listPendingPackageChangesetPaths({ root });
  if (pendingChangesets.length > 0) {
    throw new Error(`Release is blocked while pending package Changesets exist: ${pendingChangesets.join(", ")}`);
  }
}
