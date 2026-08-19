export interface PackedArtifactSelection {
  path: string;
  integrity: string;
  sha256: string;
}

export function calculateFileIntegrity(path: string): string;
export function calculateFileSha256(path: string): string;
export function assertFileIntegrity(path: string, expectedIntegrity: string): string;
export function assertFileHashes(path: string, hashes: { sha512: string; sha256: string }): { sha512: string; sha256: string };
export function selectPackedArtifact(options: {
  providedPath?: string;
  expectedIntegrity?: string;
  expectedSha256?: string;
  packArtifact: () => { path: string; integrity: string };
}): PackedArtifactSelection;
export function createDeterministicReleaseManifest<T>(value: T): Readonly<T>;
export function assertValidSemver(version: string): string;
export function isPrereleaseSemver(version: string): boolean;
export function assertDistTagsCoherent(
  distTags: { latest?: string; next?: string },
  candidate?: { candidateVersion?: string; candidateTag?: "latest" | "next" },
): { latest: string; next?: string };
export function assertDistTagTransitionCoherent(
  distTags: { latest?: string; next?: string },
  candidate: { candidateVersion: string; candidateTag: "latest" | "next" },
): { latest: string; next?: string };
export function canonicalizeCompatibilityLockGraph(lock: unknown, sdkPackageName?: string): unknown;
export function calculateJsonSha256(value: unknown): string;
export function waitForRegistryIntegrity(options: {
  expectedIntegrity: string;
  attempts?: number;
  delayMs?: number;
  fetchIntegrity: () => Promise<string | undefined>;
}): Promise<string>;
