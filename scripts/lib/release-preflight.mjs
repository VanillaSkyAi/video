function normalizeGithubRepository(value) {
  const source = String(value ?? "").trim().replace(/^git\+/, "");
  const match = /^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/.exec(source);
  return match?.[1];
}

export function assertReleasePreflight(input) {
  const expectedRepository = String(input.expectedRepository ?? "");
  if (normalizeGithubRepository(input.remoteUrl) !== expectedRepository) {
    throw new Error(`Release remote must be the ${expectedRepository} repository`);
  }
  if (normalizeGithubRepository(input.packageRepository) !== expectedRepository) {
    throw new Error(`Package repository must be ${expectedRepository}`);
  }
  if (input.packageName !== "@vanillaskyai/video") {
    throw new Error("Release package must be @vanillaskyai/video");
  }
  const version = String(input.version ?? "");
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)) {
    throw new Error("Release package version must be valid SemVer");
  }
  if (input.currentBranch !== "main") {
    throw new Error("Release candidate must be checked out on main");
  }
  if (!/^[a-f0-9]{40}$/.test(input.head ?? "") || input.head !== input.originMain) {
    throw new Error("Release HEAD must exactly match the approved origin/main commit");
  }
  if (String(input.status ?? "").trim()) {
    throw new Error("Release working tree must be clean");
  }
  if (input.localTagExists) {
    throw new Error(`Release local tag v${version} must be absent before tag creation`);
  }
  if (input.remoteTagExists) {
    throw new Error(`Release remote tag v${version} must be absent before tag creation`);
  }
  return { repository: expectedRepository, tag: `v${version}`, commit: input.head };
}
