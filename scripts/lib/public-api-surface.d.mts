export interface PublicApiSurfaceReportEntry {
  runtimeExports: string[];
  typeExports: string[];
  environment: string;
  files: string[];
  external: string[];
  declarationFiles: string[];
  declarationExternal: string[];
}

export function verifyPublicApiSurface(options: {
  packageRoot: string;
  manifestPath: string;
  signaturePath?: string;
}): Promise<Record<string, PublicApiSurfaceReportEntry>>;

export function createPublicApiSignatureReport(options: {
  packageRoot: string;
  manifestPath: string;
}): Record<string, {
  exports: Record<string, {
    kinds: string[];
    declaration: string[];
  }>;
  support: string[];
}>;
