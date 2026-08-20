export const VERSION_PACKAGES_BRANCH: "changeset-release/main";
export const CANONICAL_REPOSITORY: "VanillaSkyAi/video";
export const VERSION_PACKAGES_COMMIT: "chore: version packages";
export const VERSION_PACKAGES_BOT: Readonly<{ email: string; name: string }>;

export function generateVersionPackages(options: {
  root: string;
  changesetsCliPath?: string;
  changesetsParsePath?: string;
}): { changed: boolean; previousVersion: string; version: string };

export function verifyVersionPackagesPullRequest(options: {
  root: string;
  baseRef: string;
  headRef?: string;
  baseBranch?: string;
  baseRepository?: string;
  headBranch?: string;
  headRepository?: string;
  changesetsCliPath?: string;
  changesetsParsePath?: string;
}): { baseRef: string; headRef: string; version: string };
