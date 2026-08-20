export function prepareRelease(options: {
  root: string;
  targetVersion: string;
}): {
  previousVersion: string;
  version: string;
};
