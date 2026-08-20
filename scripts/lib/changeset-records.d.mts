export function listPendingChangesetPaths(options: { root: string }): string[];
export function listPendingPackageChangesetPaths(options: { root: string }): string[];

export function assertChangesetRecordFile(options: {
  root: string;
  path: string;
  ref?: string;
}): void;

export function assertCommittedRegularFile(options: {
  root: string;
  path: string;
  ref?: string;
  label?: string;
}): void;

export function assertNoPendingPackageChangesets(options: { root: string }): void;
