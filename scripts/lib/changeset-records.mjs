import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync } from "node:fs";
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

export function assertChangesetRecordFile({ root, path, ref = "HEAD" }) {
  if (path === ".changeset/README.md" || !CHANGESET_RECORD.test(path)) {
    throw new Error(`Changeset record path is invalid: ${path}`);
  }
  const repositoryRoot = resolve(root);
  const absolutePath = resolve(repositoryRoot, path);
  const stat = lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Changeset ${path} must be a regular file, not a symlink or another file type`);
  }
  const treeEntry = execFileSync("git", ["ls-tree", "-z", ref, "--", path], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  const match = /^(\d+) (\S+) ([0-9a-f]+)\t([^\0]+)\0$/.exec(treeEntry);
  if (!match || match[1] !== "100644" || match[2] !== "blob" || match[4] !== path) {
    throw new Error(`Changeset ${path} must be a committed 100644 regular file at ${ref}`);
  }
}

export function assertNoPendingChangesets({ root }) {
  const pendingChangesets = listPendingChangesetPaths({ root });
  if (pendingChangesets.length > 0) {
    throw new Error(`Release is blocked while pending Changesets exist: ${pendingChangesets.join(", ")}`);
  }
}
