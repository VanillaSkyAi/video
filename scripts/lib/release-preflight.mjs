function normalizeGithubRepository(value) {
  const source = String(value ?? "").trim().replace(/^git\+/, "");
  const match = /^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/.exec(source);
  return match?.[1];
}

export function assertFirstReleasePreflight(input) {
  const expectedRepository = String(input.expectedRepository ?? "");
  if (normalizeGithubRepository(input.remoteUrl) !== expectedRepository) {
    throw new Error(`Release remote must be the fresh ${expectedRepository} repository`);
  }
  if (normalizeGithubRepository(input.packageRepository) !== expectedRepository) {
    throw new Error(`Package repository must be ${expectedRepository}`);
  }
  if (input.packageName !== "@vanillaskyai/video") {
    throw new Error("Release package must be @vanillaskyai/video");
  }
  if (!/^0\.1\.0$/.test(input.version ?? "")) {
    throw new Error("First release preflight requires package version 0.1.0");
  }
  if (input.currentBranch !== "main") {
    throw new Error("First release candidate must be checked out on main");
  }
  if (!/^[a-f0-9]{40}$/.test(input.head ?? "") || input.head !== input.originMain) {
    throw new Error("First release HEAD must exactly match the approved origin/main commit");
  }
  if (String(input.status ?? "").trim()) {
    throw new Error("First release working tree must be clean");
  }
  if (input.localTagExists) {
    throw new Error("First release local tag v0.1.0 must be absent before tag creation");
  }
  if (input.remoteTagExists) {
    throw new Error("First release remote tag v0.1.0 must be absent before tag creation");
  }
  return { repository: expectedRepository, tag: "v0.1.0", commit: input.head };
}
