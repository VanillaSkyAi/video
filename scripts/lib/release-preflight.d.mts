export interface ReleasePreflightInput {
  currentBranch: string;
  expectedRepository: string;
  head: string;
  localTagExists: boolean;
  originMain: string;
  packageName: string;
  packageRepository: string;
  pendingChangesets: string[];
  remoteTagExists: boolean;
  remoteUrl: string;
  status: string;
  version: string;
}

export function assertReleasePreflight(input: ReleasePreflightInput): {
  repository: string;
  tag: string;
  commit: string;
};
