#!/usr/bin/env node

import { resolve } from "node:path";
import { verifyVersionPackagesPullRequest } from "./lib/version-packages.mjs";

try {
  const result = verifyVersionPackagesPullRequest({
    root: resolve(process.env.VERSION_PACKAGES_REPOSITORY_ROOT ?? process.cwd()),
    baseRef: process.env.CHANGESET_BASE_REF,
    headRef: process.env.CHANGESET_HEAD_REF ?? "HEAD",
    baseBranch: process.env.CHANGESET_BASE_BRANCH,
    baseRepository: process.env.CHANGESET_BASE_REPOSITORY,
    headBranch: process.env.CHANGESET_HEAD_BRANCH,
    headRepository: process.env.CHANGESET_HEAD_REPOSITORY,
    changesetsCliPath: process.env.CHANGESETS_CLI_PATH,
  });
  console.log(`Version Packages ${result.version} is reproducible at ${result.headRef}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
