export interface NpmPackArtifact {
  filename: string;
  version?: string;
  size?: number;
  unpackedSize?: number;
  [key: string]: unknown;
}

export function parseNpmPackJson(output: string): NpmPackArtifact[];
