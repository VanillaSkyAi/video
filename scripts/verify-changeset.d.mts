export interface ChangesetGovernanceResult {
  changesets: string[];
  packageAffecting: boolean;
  releaseType: "patch" | "minor" | "major" | null;
}

export interface ChangesetGovernanceExemption {
  exempt: true;
  reason: "version-packages-branch";
}

export function verifyChangesetGovernance(options?: {
  root?: string;
  baseRef?: string;
  headBranch?: string;
}): ChangesetGovernanceResult | ChangesetGovernanceExemption;
