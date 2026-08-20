export const TEXT_VERSION_SURFACES: readonly string[];
export const DEPENDENCY_MANIFESTS: readonly string[];

export function synchronizeVersionSurfaces(options: {
  root: string;
  packageName: string;
  previousVersion: string;
  version: string;
}): void;
