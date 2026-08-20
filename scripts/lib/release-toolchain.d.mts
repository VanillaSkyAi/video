export const RELEASE_NODE_VERSION: "22.23.1";
export const RELEASE_NPM_VERSION: "11.17.0";

export function assertReleaseToolchain(options: {
  nodeVersion: string;
  npmVersion: string;
}): {
  node: string;
  npm: string;
};
