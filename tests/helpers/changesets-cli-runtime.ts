export const CHANGESETS_CLI_NODE_RANGE = "^22.11 || ^24 || >=26";

export function changesetsCliSupportsNode(version: string): boolean {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) return false;
  return (major === 22 && minor >= 11) || major === 24 || major >= 26;
}
