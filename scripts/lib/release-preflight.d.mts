export interface FirstReleasePreflightInput {
  currentBranch: string;
  expectedRepository: string;
  head: string;
  localTagExists: boolean;
  originMain: string;
  packageName: string;
  packageRepository: string;
  remoteTagExists: boolean;
  remoteUrl: string;
  status: string;
  version: string;
}

export function assertFirstReleasePreflight(input: FirstReleasePreflightInput): {
  repository: string;
  tag: string;
  commit: string;
};
