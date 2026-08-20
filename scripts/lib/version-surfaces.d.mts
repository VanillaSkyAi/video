export const TEXT_VERSION_SURFACES: readonly string[];
export const DEPENDENCY_MANIFESTS: readonly string[];
export const UNRELEASED_PLACEHOLDER: string;

export function restoreEmptyUnreleasedChangelog(options: {
  previousChangelog: string;
  root: string;
}): void;

export function synchronizeVersionSurfaces(options: {
  root: string;
  packageName: string;
  previousVersion: string;
  version: string;
}): void;
