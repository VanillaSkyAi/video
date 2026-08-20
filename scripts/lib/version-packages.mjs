import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { synchronizeVersionSurfaces } from "./version-surfaces.mjs";

export const VERSION_PACKAGES_BRANCH = "changeset-release/main";
export const CANONICAL_REPOSITORY = "VanillaSkyAi/video";
export const VERSION_PACKAGES_COMMIT = "chore: version packages";
export const VERSION_PACKAGES_BOT = {
  email: "41898282+github-actions[bot]@users.noreply.github.com",
  name: "github-actions[bot]",
};

const PACKAGE_NAME = "@vanillaskyai/video";

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function defaultChangesetsCliPath() {
  return resolve(fileURLToPath(new URL("../..", import.meta.url)), "node_modules/@changesets/cli/bin.js");
}

function runChangesets(root, cliPath, args) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
  });
}

function readReleaseStatus(root, cliPath) {
  const outputRoot = mkdtempSync(join(tmpdir(), "vanillasky-changeset-status-"));
  const outputPath = join(outputRoot, "status.json");
  try {
    runChangesets(root, cliPath, ["status", "--output", outputPath]);
    return readJson(outputPath);
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
}

function assertBetaMode(root) {
  const path = join(root, ".changeset/pre.json");
  if (!existsSync(path)) return false;
  const state = readJson(path);
  if (state.mode !== "pre" || state.tag !== "beta") {
    throw new Error(`Version Packages requires Changesets beta prerelease mode; found ${state.mode ?? "unknown"}/${state.tag ?? "unknown"}`);
  }
  return true;
}

export function generateVersionPackages({ root, changesetsCliPath = defaultChangesetsCliPath() }) {
  const repositoryRoot = resolve(root);
  const manifestPath = join(repositoryRoot, "package.json");
  const previousVersion = readJson(manifestPath).version;
  const pendingRecords = readdirSync(join(repositoryRoot, ".changeset"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md");
  if (pendingRecords.length === 0) {
    return { changed: false, previousVersion, version: previousVersion };
  }
  const status = readReleaseStatus(repositoryRoot, changesetsCliPath);
  const packageRelease = status.releases.find((release) => release.name === PACKAGE_NAME);
  const unsupported = status.releases.filter((release) => release.name !== PACKAGE_NAME);
  if (unsupported.length > 0) {
    throw new Error(`Version Packages found unsupported release package(s): ${unsupported.map((release) => release.name).join(", ")}`);
  }
  if (!packageRelease) {
    return { changed: false, previousVersion, version: previousVersion };
  }

  const alreadyInBeta = assertBetaMode(repositoryRoot);
  if (!alreadyInBeta) runChangesets(repositoryRoot, changesetsCliPath, ["pre", "enter", "beta"]);
  runChangesets(repositoryRoot, changesetsCliPath, ["version"]);

  const manifest = readJson(manifestPath);
  const version = manifest.version;
  if (version === previousVersion) {
    throw new Error(`Changesets did not advance ${PACKAGE_NAME} from ${previousVersion}`);
  }
  synchronizeVersionSurfaces({
    root: repositoryRoot,
    packageName: PACKAGE_NAME,
    previousVersion,
    version,
  });
  return { changed: true, previousVersion, version };
}

function assertCanonicalMetadata({ baseBranch, baseRepository, headBranch, headRepository }) {
  if (
    headBranch !== VERSION_PACKAGES_BRANCH
    || baseBranch !== "main"
    || headRepository !== CANONICAL_REPOSITORY
    || baseRepository !== CANONICAL_REPOSITORY
  ) {
    throw new Error("Version Packages verification requires the exact canonical same-repository branch targeting main");
  }
}

function assertBotCommit(root, headRef) {
  const fields = git(root, ["show", "-s", "--format=%an%x00%ae%x00%cn%x00%ce%x00%s", headRef]).split("\0");
  const [authorName, authorEmail, committerName, committerEmail, subject] = fields;
  if (
    authorName !== VERSION_PACKAGES_BOT.name
    || authorEmail !== VERSION_PACKAGES_BOT.email
    || committerName !== VERSION_PACKAGES_BOT.name
    || committerEmail !== VERSION_PACKAGES_BOT.email
    || subject !== VERSION_PACKAGES_COMMIT
  ) {
    throw new Error("Version Packages commit lacks exact github-actions[bot] provenance");
  }
}

export function verifyVersionPackagesPullRequest({
  root,
  baseRef,
  headRef = "HEAD",
  baseBranch,
  baseRepository,
  headBranch,
  headRepository,
  changesetsCliPath = defaultChangesetsCliPath(),
}) {
  assertCanonicalMetadata({ baseBranch, baseRepository, headBranch, headRepository });
  const repositoryRoot = resolve(root);
  const resolvedBase = git(repositoryRoot, ["rev-parse", `${baseRef}^{commit}`]);
  const resolvedHead = git(repositoryRoot, ["rev-parse", `${headRef}^{commit}`]);
  const ancestry = git(repositoryRoot, ["rev-list", "--parents", "-n", "1", resolvedHead]).split(/\s+/);
  if (ancestry.length !== 2 || ancestry[1] !== resolvedBase) {
    throw new Error("Version Packages must be one generated commit whose only parent is the exact pull request base");
  }
  assertBotCommit(repositoryRoot, resolvedHead);

  const reproductionRoot = mkdtempSync(join(tmpdir(), "vanillasky-version-packages-reproduction-"));
  try {
    execFileSync("git", ["clone", "--quiet", "--no-hardlinks", "--no-checkout", repositoryRoot, reproductionRoot], {
      encoding: "utf8",
    });
    git(reproductionRoot, ["checkout", "--quiet", "--detach", resolvedBase]);
    const generated = generateVersionPackages({ root: reproductionRoot, changesetsCliPath });
    if (!generated.changed) throw new Error("Version Packages base has no package release Changeset to generate");
    git(reproductionRoot, ["add", "--all"]);
    const expectedTree = git(reproductionRoot, ["write-tree"]);
    const actualTree = git(repositoryRoot, ["rev-parse", `${resolvedHead}^{tree}`]);
    if (actualTree !== expectedTree) {
      throw new Error(`Version Packages tree is not reproducible from ${resolvedBase}`);
    }
    return { baseRef: resolvedBase, headRef: resolvedHead, version: generated.version };
  } finally {
    rmSync(reproductionRoot, { recursive: true, force: true });
  }
}
