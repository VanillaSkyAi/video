#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertGitHubReleaseCoherent } from "./lib/github-release-integrity.mjs";

const [tag, notesPath, prereleaseValue, expectedCommit, expectedTargetCommitish] = process.argv.slice(2);
if (!tag || !notesPath || !["true", "false"].includes(prereleaseValue) || !/^[a-f0-9]{40}$/.test(expectedCommit ?? "") || !expectedTargetCommitish) {
  throw new Error("Usage: verify-github-release.mjs <tag> <notes-path> <true|false> <commit> <target-commitish>");
}
const peeledTagCommit = execFileSync("git", ["rev-parse", `refs/tags/${tag}^{commit}`], { encoding: "utf8" }).trim();
if (peeledTagCommit !== expectedCommit) {
  throw new Error(`Annotated tag ${tag} resolves to ${peeledTagCommit}, expected ${expectedCommit}`);
}
const release = JSON.parse(execFileSync("gh", [
  "release",
  "view",
  tag,
  "--json",
  "body,isDraft,isPrerelease,tagName,targetCommitish",
], { encoding: "utf8" }));
assertGitHubReleaseCoherent(release, {
  body: readFileSync(resolve(notesPath), "utf8"),
  commit: expectedCommit,
  prerelease: prereleaseValue === "true",
  tag,
  targetCommitish: expectedTargetCommitish,
});
console.log(`GitHub release ${tag} metadata matches the immutable candidate.`);
