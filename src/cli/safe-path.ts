import { lstatSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

function lstatIfPresent(path: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

/** Resolve a customer-owned write target and reject escapes or symbolic-link traversal. */
export function safeProjectPath(cwd: string, target: string): string {
  const root = resolve(cwd);
  const destination = resolve(root, target);
  const pathFromRoot = relative(root, destination);
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`)) {
    throw new Error(`Write target escapes the project: ${target}`);
  }

  const rootStat = lstatIfPresent(root);
  if (!rootStat) throw new Error(`Project directory does not exist: ${root}`);
  if (rootStat.isSymbolicLink()) throw new Error("Project writes cannot use a symbolic-link project root");
  if (!rootStat.isDirectory()) throw new Error(`Project path is not a directory: ${root}`);

  const realRoot = realpathSync(root);
  const segments = pathFromRoot.split(sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    const stat = lstatIfPresent(current);
    if (!stat) return destination;
    if (stat.isSymbolicLink()) {
      throw new Error(`Write target contains a symbolic link: ${relative(root, current)}`);
    }
    const realCurrent = realpathSync(current);
    const realPathFromRoot = relative(realRoot, realCurrent);
    if (realPathFromRoot === ".." || realPathFromRoot.startsWith(`..${sep}`)) {
      throw new Error(`Write target escapes the project: ${relative(root, current)}`);
    }
  }
  return destination;
}
