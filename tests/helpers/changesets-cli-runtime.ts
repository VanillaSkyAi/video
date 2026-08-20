export const CHANGESETS_CLI_NODE_RANGE = "^22.11 || ^24 || >=26";

export function changesetsCliSupportsNode(version: string): boolean {
  const match = /^(\d+)\.(\d+)(?:\.\d+)?/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return (major === 22 && minor >= 11) || major === 24 || major >= 26;
}
