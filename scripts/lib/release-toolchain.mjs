export const RELEASE_NODE_VERSION = "22.23.1";
export const RELEASE_NPM_VERSION = "11.17.0";

export function assertReleaseToolchain({ nodeVersion, npmVersion }) {
  if (nodeVersion !== RELEASE_NODE_VERSION) {
    throw new Error(`Release commands require Node ${RELEASE_NODE_VERSION}; received ${nodeVersion}`);
  }
  if (npmVersion !== RELEASE_NPM_VERSION) {
    throw new Error(`Release commands require npm ${RELEASE_NPM_VERSION}; received ${npmVersion}`);
  }
  return { node: nodeVersion, npm: npmVersion };
}
