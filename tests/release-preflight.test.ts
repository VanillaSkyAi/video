import { describe, expect, it } from "vitest";
import { assertReleasePreflight } from "../scripts/lib/release-preflight.mjs";

const valid = {
  currentBranch: "main",
  expectedRepository: "VanillaSkyAi/video",
  head: "a".repeat(40),
  localTagExists: false,
  originMain: "a".repeat(40),
  packageName: "@vanillaskyai/video",
  packageRepository: "git+https://github.com/VanillaSkyAi/video.git",
  pendingChangesets: [],
  remoteTagExists: false,
  remoteUrl: "git@github.com:VanillaSkyAi/video.git",
  status: "",
  version: "0.1.1",
};

describe("release preflight", () => {
  it("accepts a clean approved main before creating the next version tag", () => {
    expect(assertReleasePreflight(valid)).toEqual({
      repository: "VanillaSkyAi/video",
      tag: "v0.1.1",
      commit: valid.head,
    });
  });

  it.each([
    ["wrong remote", { remoteUrl: "https://github.com/VanillaSkyAi/vanillasky-sdk.git" }, /repository/i],
    ["wrong package repository", { packageRepository: "git+https://github.com/VanillaSkyAi/vanillasky-sdk.git" }, /package repository/i],
    ["feature branch", { currentBranch: "reset/final-feedback" }, /main/i],
    ["unapproved commit", { originMain: "b".repeat(40) }, /origin\/main/i],
    ["dirty tree", { status: " M package.json" }, /clean/i],
    ["invalid version", { version: "next" }, /version/i],
    ["local existing tag", { localTagExists: true }, /local tag/i],
    ["remote existing tag", { remoteTagExists: true }, /remote tag/i],
    ["pending Changesets", { pendingChangesets: [".changeset/pending-release.md"] }, /pending changeset/i],
  ])("rejects %s", (_name, change, expected) => {
    expect(() => assertReleasePreflight({ ...valid, ...change })).toThrow(expected);
  });
});
