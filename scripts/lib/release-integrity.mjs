import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function calculateFileIntegrity(path) {
  const digest = createHash("sha512").update(readFileSync(path)).digest("base64");
  return `sha512-${digest}`;
}

export function calculateFileSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function assertFileIntegrity(path, expectedIntegrity) {
  if (!expectedIntegrity?.startsWith("sha512-")) {
    throw new Error("A recorded sha512 candidate integrity is required");
  }
  const actualIntegrity = calculateFileIntegrity(path);
  if (actualIntegrity !== expectedIntegrity) {
    throw new Error(`Release artifact ${path} does not match the recorded candidate integrity`);
  }
  return actualIntegrity;
}

export function assertFileHashes(path, { sha512, sha256 }) {
  const actualSha512 = assertFileIntegrity(path, sha512);
  if (!/^[a-f0-9]{64}$/.test(sha256 ?? "")) {
    throw new Error("A recorded lowercase SHA-256 candidate hash is required");
  }
  const actualSha256 = calculateFileSha256(path);
  if (actualSha256 !== sha256) {
    throw new Error(`Release artifact ${path} does not match the recorded SHA-256 candidate hash`);
  }
  return { sha512: actualSha512, sha256: actualSha256 };
}

export function selectPackedArtifact({ providedPath, expectedIntegrity, expectedSha256, packArtifact }) {
  if (providedPath) {
    const hashes = assertFileHashes(providedPath, {
      sha512: expectedIntegrity,
      sha256: expectedSha256,
    });
    return {
      path: providedPath,
      integrity: hashes.sha512,
      sha256: hashes.sha256,
    };
  }

  const packed = packArtifact();
  const actualIntegrity = calculateFileIntegrity(packed.path);
  if (packed.integrity !== actualIntegrity) {
    throw new Error(`Newly packed artifact ${packed.path} does not match npm's recorded integrity`);
  }
  return {
    path: packed.path,
    integrity: actualIntegrity,
    sha256: calculateFileSha256(packed.path),
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

export function createDeterministicReleaseManifest(value) {
  return deepFreeze(canonicalize(value));
}

export function parseSemver(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(version ?? "");
  if (!match) throw new Error(`Invalid semantic version: ${version}`);
  const prerelease = match[4]?.split(".") ?? [];
  const build = match[5]?.split(".") ?? [];
  if (prerelease.some((identifier) => !identifier || (/^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith("0")))) {
    throw new Error(`Invalid semantic version: ${version}`);
  }
  if (build.some((identifier) => !identifier)) throw new Error(`Invalid semantic version: ${version}`);
  return {
    build,
    core: match.slice(1, 4),
    prerelease,
  };
}

function compareNumericIdentifier(left, right) {
  if (left.length !== right.length) return left.length - right.length;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function compareSemver(leftVersion, rightVersion) {
  const left = parseSemver(leftVersion);
  const right = parseSemver(rightVersion);
  for (let index = 0; index < 3; index += 1) {
    const comparison = compareNumericIdentifier(left.core[index], right.core[index]);
    if (comparison !== 0) return comparison;
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return right.prerelease.length - left.prerelease.length;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return compareNumericIdentifier(leftPart, rightPart);
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

export function assertValidSemver(version) {
  parseSemver(version);
  return version;
}

export function isPrereleaseSemver(version) {
  return parseSemver(version).prerelease.length > 0;
}

export function assertDistTagsCoherent(distTags, candidate = {}) {
  if (!distTags?.latest) throw new Error("npm latest must exist before dist-tag coherence can be verified");
  parseSemver(distTags.latest);
  if (distTags.beta) parseSemver(distTags.beta);
  const { candidateVersion, candidateTag } = candidate;
  if (candidateVersion || candidateTag) {
    if (!candidateVersion || !["latest", "beta"].includes(candidateTag)) {
      throw new Error("Candidate version and latest/beta tag are required for npm dist-tag verification");
    }
    const candidatePrerelease = parseSemver(candidateVersion).prerelease.length > 0;
    if (candidatePrerelease && candidateTag !== "beta") {
      throw new Error(`npm prerelease candidate ${candidateVersion} must own beta, not ${candidateTag}`);
    }
    if (candidatePrerelease && compareSemver(candidateVersion, distTags.latest) <= 0) {
      throw new Error(`npm beta candidate ${candidateVersion} must be newer than latest ${distTags.latest}`);
    }
    if (!candidatePrerelease && candidateTag !== "latest") {
      throw new Error(`npm stable candidate ${candidateVersion} must own latest, not ${candidateTag}`);
    }
    if (distTags[candidateTag] !== candidateVersion) {
      throw new Error(`npm ${candidateTag} ${distTags[candidateTag] ?? "is missing"}, expected candidate ${candidateVersion}`);
    }
  }
  return { latest: distTags.latest, ...(distTags.beta ? { beta: distTags.beta } : {}) };
}

export function assertDistTagTransitionCoherent(distTags, candidate) {
  if (!candidate?.candidateVersion || !["latest", "beta"].includes(candidate.candidateTag)) {
    throw new Error("Candidate version and latest/beta tag are required for npm dist-tag transition verification");
  }
  const currentTarget = distTags?.[candidate.candidateTag];
  if (currentTarget !== undefined && compareSemver(candidate.candidateVersion, currentTarget) <= 0) {
    throw new Error(`npm candidate ${candidate.candidateVersion} must be strictly newer than current ${candidate.candidateTag} ${currentTarget}`);
  }
  const prospectiveTags = { ...distTags, [candidate.candidateTag]: candidate.candidateVersion };
  return assertDistTagsCoherent(prospectiveTags, candidate);
}

export async function waitForRegistryIntegrity({
  expectedIntegrity,
  fetchIntegrity,
  attempts = 6,
  delayMs = 5_000,
}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const publishedIntegrity = await fetchIntegrity();
      if (publishedIntegrity) {
        if (publishedIntegrity !== expectedIntegrity) {
          throw new Error("Published npm artifact does not match the recorded candidate integrity");
        }
        return publishedIntegrity;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("does not match the recorded candidate integrity")) {
        throw error;
      }
      lastError = error;
    }

    if (attempt < attempts && delayMs > 0) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * delayMs));
    }
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`Published npm artifact integrity did not become available${detail}`);
}
