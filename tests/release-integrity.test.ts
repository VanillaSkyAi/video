import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertFileIntegrity,
  calculateFileIntegrity,
  selectPackedArtifact,
  waitForRegistryIntegrity,
} from "../scripts/lib/release-integrity.mjs";
import * as releaseIntegrity from "../scripts/lib/release-integrity.mjs";

describe("release artifact integrity", () => {
  it("accepts the exact candidate bytes and rejects changed bytes", () => {
    const workspace = mkdtempSync(join(tmpdir(), "vanillasky-release-integrity-"));
    const tarball = join(workspace, "candidate.tgz");
    try {
      writeFileSync(tarball, "candidate bytes");
      const expected = calculateFileIntegrity(tarball);
      expect(assertFileIntegrity(tarball, expected)).toBe(expected);

      writeFileSync(tarball, "changed bytes");
      expect(() => assertFileIntegrity(tarball, expected)).toThrow("does not match the recorded candidate integrity");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("uses a supplied release artifact without packing another candidate", () => {
    const workspace = mkdtempSync(join(tmpdir(), "vanillasky-release-candidate-"));
    const tarball = join(workspace, "candidate.tgz");
    try {
      writeFileSync(tarball, "one immutable artifact");
      const expected = calculateFileIntegrity(tarball);
      const expectedSha256 = createHash("sha256").update(readFileSync(tarball)).digest("hex");
      let packCalls = 0;
      const selected = selectPackedArtifact({
        providedPath: tarball,
        expectedIntegrity: expected,
        expectedSha256,
        packArtifact: () => {
          packCalls += 1;
          throw new Error("must not repack");
        },
      });

      expect(selected).toEqual({ path: tarball, integrity: expected, sha256: expectedSha256 });
      expect(packCalls).toBe(0);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("requires both SHA-512 and SHA-256 for a supplied immutable artifact", () => {
    expect(releaseIntegrity.calculateFileSha256).toBeTypeOf("function");
    expect(releaseIntegrity.assertFileHashes).toBeTypeOf("function");
    if (typeof releaseIntegrity.calculateFileSha256 !== "function"
      || typeof releaseIntegrity.assertFileHashes !== "function") return;

    const workspace = mkdtempSync(join(tmpdir(), "vanillasky-release-hashes-"));
    const tarball = join(workspace, "candidate.tgz");
    try {
      writeFileSync(tarball, "immutable candidate bytes");
      const sha512 = calculateFileIntegrity(tarball);
      const sha256 = releaseIntegrity.calculateFileSha256(tarball);
      expect(releaseIntegrity.assertFileHashes(tarball, { sha512, sha256 })).toEqual({ sha512, sha256 });
      expect(() => releaseIntegrity.assertFileHashes(tarball, {
        sha512,
        sha256: "0".repeat(64),
      })).toThrow("SHA-256");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("builds byte-stable release manifests without timestamps or absolute paths", () => {
    expect(releaseIntegrity.createDeterministicReleaseManifest).toBeTypeOf("function");
    if (typeof releaseIntegrity.createDeterministicReleaseManifest !== "function") return;

    const input = {
      packageIdentity: { name: "@vanillaskyai/video", version: "0.1.0" },
      sourceIdentity: { commit: "a".repeat(40), tag: "v0.1.0", tagType: "pending-annotated" },
      artifact: { filename: "vanillaskyai-video-0.1.0.tgz", sha512: "sha512-candidate", sha256: "b".repeat(64) },
      coherence: { packageLock: true, changelog: true },
      consumers: { packedPackage: "passed", nextjs: "passed", vite: "passed" },
    };
    const first = releaseIntegrity.createDeterministicReleaseManifest(input);
    const second = releaseIntegrity.createDeterministicReleaseManifest(input);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toMatch(/timestamp|createdAt|\/Users\//);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("requires the candidate to own its stable or prerelease dist-tag", () => {
    expect(releaseIntegrity.assertDistTagsCoherent).toBeTypeOf("function");
    if (typeof releaseIntegrity.assertDistTagsCoherent !== "function") return;

    expect(() => releaseIntegrity.assertDistTagsCoherent(
      { latest: "0.1.0" },
      { candidateVersion: "0.1.0", candidateTag: "latest" },
    )).not.toThrow();
    expect(() => releaseIntegrity.assertDistTagsCoherent(
      { latest: "0.1.0", beta: "0.2.0-beta.1" },
      { candidateVersion: "0.2.0-beta.1", candidateTag: "beta" },
    )).not.toThrow();
    expect(() => releaseIntegrity.assertDistTagsCoherent(
      { latest: "0.0.9" },
      { candidateVersion: "0.1.0", candidateTag: "latest" },
    )).toThrow("latest");
    expect(() => releaseIntegrity.assertDistTagsCoherent(
      { latest: "0.1.0" },
      { candidateVersion: "0.2.0-beta.1", candidateTag: "beta" },
    )).toThrow("beta");
    expect(() => releaseIntegrity.assertDistTagsCoherent(
      { latest: "0.1.0", beta: "0.2.0-beta.1" },
      { candidateVersion: "0.2.0-beta.1", candidateTag: "latest" },
    )).toThrow("prerelease candidate");
    expect(() => releaseIntegrity.assertDistTagsCoherent(
      { latest: "0.1.0", beta: "0.2.0" },
      { candidateVersion: "0.2.0", candidateTag: "beta" },
    )).toThrow("stable candidate");
  });

  it("rejects a publish transition that would make beta older than latest", () => {
    expect(releaseIntegrity.assertDistTagTransitionCoherent).toBeTypeOf("function");
    if (typeof releaseIntegrity.assertDistTagTransitionCoherent !== "function") return;

    expect(() => releaseIntegrity.assertDistTagTransitionCoherent(
      {},
      { candidateVersion: "0.1.0", candidateTag: "latest" },
    )).not.toThrow();
    expect(() => releaseIntegrity.assertDistTagTransitionCoherent(
      { latest: "1.0.0", beta: "1.1.0-beta.1" },
      { candidateVersion: "1.2.0", candidateTag: "latest" },
    )).not.toThrow();
    expect(() => releaseIntegrity.assertDistTagTransitionCoherent(
      { latest: "1.0.0" },
      { candidateVersion: "0.9.0-beta.1", candidateTag: "beta" },
    )).toThrow("newer than latest");
    expect(() => releaseIntegrity.assertDistTagTransitionCoherent(
      {},
      { candidateVersion: "0.2.0-beta.1", candidateTag: "beta" },
    )).toThrow("latest must exist");
  });

  it("requires an unpublished candidate to advance its target dist-tag", () => {
    const transition = releaseIntegrity.assertDistTagTransitionCoherent;
    expect(transition).toBeTypeOf("function");
    if (typeof transition !== "function") return;

    for (const [tags, candidate] of [
      [{ latest: "1.2.0" }, { candidateVersion: "1.1.0", candidateTag: "latest" }],
      [{ latest: "1.2.0" }, { candidateVersion: "1.2.0", candidateTag: "latest" }],
      [{ latest: "1.0.0", beta: "1.1.0-beta.10" }, { candidateVersion: "1.1.0-beta.2", candidateTag: "beta" }],
      [{ latest: "1.0.0", beta: "1.1.0-beta.2" }, { candidateVersion: "1.1.0-beta.2+new-build", candidateTag: "beta" }],
      [{ latest: "1.0.0", beta: "1.1.0-a" }, { candidateVersion: "1.1.0-A", candidateTag: "beta" }],
    ] as const) {
      expect(() => transition(tags, candidate)).toThrow("strictly newer");
    }

    for (const [tags, candidate] of [
      [{}, { candidateVersion: "0.1.0", candidateTag: "latest" }],
      [{ latest: "1.0.0" }, { candidateVersion: "1.1.0-beta.1", candidateTag: "beta" }],
      [{ latest: "1.0.0", beta: "1.1.0-beta.2" }, { candidateVersion: "1.1.0-beta.10", candidateTag: "beta" }],
      [{ latest: "1.0.0", beta: "1.1.0-beta.2" }, { candidateVersion: "1.1.0-beta.alpha", candidateTag: "beta" }],
      [{ latest: "1.0.0", beta: "1.1.0-A" }, { candidateVersion: "1.1.0-a", candidateTag: "beta" }],
      [{ latest: "1.0.0", beta: "2.0.0-beta.1" }, { candidateVersion: "1.1.0", candidateTag: "latest" }],
    ] as const) {
      expect(() => transition(tags, candidate)).not.toThrow();
    }
    expect(() => transition(
      { latest: "" },
      { candidateVersion: "0.1.0", candidateTag: "latest" },
    )).toThrow("Invalid semantic version");
  });

  it("uses SemVer ASCII and numeric prerelease ordering", () => {
    expect(releaseIntegrity.assertDistTagsCoherent).toBeTypeOf("function");
    if (typeof releaseIntegrity.assertDistTagsCoherent !== "function") return;

    expect(() => releaseIntegrity.assertDistTagsCoherent(
      { latest: "1.0.0-a", beta: "1.0.0-A" },
      { candidateVersion: "1.0.0-A", candidateTag: "beta" },
    )).toThrow("newer than latest");
    expect(() => releaseIntegrity.assertDistTagsCoherent(
      { latest: "1.0.0-beta.2", beta: "1.0.0-beta.10" },
      { candidateVersion: "1.0.0-beta.10", candidateTag: "beta" },
    )).not.toThrow();
    expect(() => releaseIntegrity.assertDistTagsCoherent(
      { latest: "1.0.0", beta: "1.1.0-beta.01" },
      { candidateVersion: "1.1.0-beta.01", candidateTag: "beta" },
    )).toThrow("Invalid semantic version");
    expect(() => releaseIntegrity.assertValidSemver("1.0.0+build..1"))
      .toThrow("Invalid semantic version");
  });

  it("classifies prereleases independently of build metadata", () => {
    expect(releaseIntegrity.isPrereleaseSemver).toBeTypeOf("function");
    if (typeof releaseIntegrity.isPrereleaseSemver !== "function") return;

    expect(releaseIntegrity.isPrereleaseSemver("1.0.0+build-beta")).toBe(false);
    expect(releaseIntegrity.isPrereleaseSemver("1.0.0-beta.1+build-7")).toBe(true);
  });

  it("waits for a first publish and then requires the registry bytes to match", async () => {
    const observed: Array<string | undefined> = [undefined, undefined, "sha512-candidate"];
    const result = await waitForRegistryIntegrity({
      expectedIntegrity: "sha512-candidate",
      attempts: 3,
      delayMs: 0,
      fetchIntegrity: async () => observed.shift(),
    });

    expect(result).toBe("sha512-candidate");
    expect(observed).toHaveLength(0);
  });

  it("rejects an immutable registry collision before a GitHub upload", async () => {
    let calls = 0;
    await expect(waitForRegistryIntegrity({
      expectedIntegrity: "sha512-candidate",
      attempts: 3,
      delayMs: 0,
      fetchIntegrity: async () => {
        calls += 1;
        return "sha512-other";
      },
    })).rejects.toThrow("does not match the recorded candidate integrity");
    expect(calls).toBe(1);
  });
});
