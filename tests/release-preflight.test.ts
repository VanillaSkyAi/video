import { describe, expect, it } from "vitest";
import { assertFirstReleasePreflight } from "../scripts/lib/release-preflight.mjs";

const valid = {
  currentBranch: "main",
  expectedRepository: "VanillaSkyAi/video",
  head: "a".repeat(40),
  localTagExists: false,
  originMain: "a".repeat(40),
  packageName: "@vanillaskyai/video",
  packageRepository: "git+https://github.com/VanillaSkyAi/video.git",
  remoteTagExists: false,
  remoteUrl: "git@github.com:VanillaSkyAi/video.git",
  status: "",
  version: "0.1.0",
};

describe("first release preflight", () => {
  it("accepts only a clean approved main in the fresh repository before the first tag", () => {
    expect(assertFirstReleasePreflight(valid)).toEqual({
      repository: "VanillaSkyAi/video",
      tag: "v0.1.0",
      commit: valid.head,
    });
  });

  it.each([
    ["wrong remote", { remoteUrl: "https://github.com/VanillaSkyAi/vanillasky-sdk.git" }, /repository/i],
    ["wrong package repository", { packageRepository: "git+https://github.com/VanillaSkyAi/vanillasky-sdk.git" }, /package repository/i],
    ["feature branch", { currentBranch: "reset/final-feedback" }, /main/i],
    ["unapproved commit", { originMain: "b".repeat(40) }, /origin\/main/i],
    ["dirty tree", { status: " M package.json" }, /clean/i],
    ["local old tag", { localTagExists: true }, /local tag/i],
    ["remote old tag", { remoteTagExists: true }, /remote tag/i],
  ])("rejects %s", (_name, change, expected) => {
    expect(() => assertFirstReleasePreflight({ ...valid, ...change })).toThrow(expected);
  });
});
