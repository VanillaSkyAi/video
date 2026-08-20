export interface ChangesetGovernanceResult {
  changesets: string[];
  packageAffecting: boolean;
  releaseType: "patch" | "minor" | "major" | null;
}

export function verifyChangesetGovernance(options?: {
  root?: string;
  baseRef?: string;
}): ChangesetGovernanceResult;
