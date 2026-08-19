export function assertGitHubReleaseCoherent(release, expected) {
  const checks = [
    ["tag", release?.tagName, expected.tag],
    ["body", release?.body, expected.body],
    ["draft state", release?.isDraft, false],
    ["prerelease state", release?.isPrerelease, expected.prerelease],
    ["target commitish", release?.targetCommitish, expected.targetCommitish],
  ];
  for (const [label, actual, wanted] of checks) {
    if (actual !== wanted) {
      throw new Error(`GitHub release ${label} is ${JSON.stringify(actual)}, expected ${JSON.stringify(wanted)}`);
    }
  }
  return release;
}
