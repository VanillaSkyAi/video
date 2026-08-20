export interface CompatibilityEvidence {
  source: string;
  body: string;
}

export interface CompatibilityReleaseIntent {
  releaseType: "patch" | "minor" | "major";
  evidence: CompatibilityEvidence[];
}

export function findBreakingChangeEvidence(
  releaseIntent: CompatibilityReleaseIntent | undefined,
): string | undefined;

export function readCompatibilityReleaseIntent(options: {
  root: string;
  packageName: string;
  baselineVersion: string;
  candidateVersion: string;
}): CompatibilityReleaseIntent | undefined;
