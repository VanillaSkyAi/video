export interface ChangesetGovernanceResult {
  changesets: string[];
  generated?: boolean;
  packageAffecting: boolean;
  releaseType: "patch" | "minor" | "major" | null;
  version?: string;
}

export function verifyChangesetGovernance(options?: {
  root?: string;
  baseRef?: string;
  headRef?: string;
  baseBranch?: string;
  baseRepository?: string;
  headBranch?: string;
  headRepository?: string;
  changesetsCliPath?: string;
}): ChangesetGovernanceResult;
