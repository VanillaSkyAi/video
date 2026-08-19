import { realpathSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { SceneTemplateMetadata } from "../visual-system/catalog/types.js";
import { safeProjectPath } from "./safe-path.js";
import { runTrustedSourceProcess, TrustedSourceProcessError } from "./trusted-source-process.js";

export interface DiscoveredTemplate {
  exportName: string;
  filePath: string;
  importPath: string;
  metadata: SceneTemplateMetadata;
  examples?: unknown;
}

export interface DiscoverProjectTemplatesOptions {
  timeoutMs?: number;
  maxOutputBytes?: number;
  /** @internal Sources replaced by a dry-run plan and therefore not executed. */
  excludeSourcePaths?: readonly string[];
}

export interface ProjectTsxRuntime {
  dependencyRoot: string;
  loader: string;
}

const nodeModulesMarker = `${sep}node_modules${sep}`;
const MAX_TEMPLATE_SOURCES = 128;
const LOADER_CONCURRENCY = 4;
const TEMPLATE_LOADER = String.raw`
const sourceUrl = process.argv[1];
const { writeSync } = await import("node:fs");
const writeProtocol = (value) => writeSync(3, value);
for (const method of ["log", "info", "warn", "error", "debug", "dir", "trace"]) console[method] = () => undefined;
const loaded = await import(sourceUrl + "?vanillasky=loader");
const isTemplate = (value) =>
  typeof value === "object" && value != null &&
  typeof value.id === "string" && typeof value.component === "function" &&
  typeof value.schema === "object" && value.schema != null &&
  value.schema.type === "object" && typeof value.schema.properties === "object";
const entries = Object.entries(loaded);
if (loaded.default && typeof loaded.default === "object" && !isTemplate(loaded.default)) {
  for (const entry of Object.entries(loaded.default)) {
    if (!entries.some(([name]) => name === entry[0])) entries.push(entry);
  }
}
const templates = entries.filter(([, value]) => isTemplate(value));
if (templates.length !== 1) {
  throw new Error("must export exactly one template created with defineTemplate (found " + templates.length + ")");
}
const [exportName, template] = templates[0];
const { component, examples, ...rawMetadata } = template;
const metadata = Object.fromEntries(Object.entries(rawMetadata).filter(([, value]) => value !== undefined));
const seen = new Set();
function assertJson(value, path) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new Error(path + " must contain only finite JSON numbers");
  }
  if (typeof value !== "object") throw new Error(path + " contains a non-serializable " + typeof value);
  if (seen.has(value)) throw new Error(path + " contains a circular value");
  seen.add(value);
  if (Array.isArray(value)) value.forEach((entry, index) => assertJson(entry, path + "[" + index + "]"));
  else {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error(path + " contains a non-serializable object");
    }
    for (const [key, entry] of Object.entries(value)) assertJson(entry, path + "." + key);
  }
  seen.delete(value);
}
assertJson(metadata, "template metadata");
if (examples !== undefined) assertJson(examples, "template examples");
writeProtocol(JSON.stringify({ exportName, metadata, examples }));
`;

async function sourceFiles(templatesDirectory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(templatesDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const linkedSource = entries.find((entry) => entry.isSymbolicLink() && /\.(?:ts|tsx)$/.test(entry.name));
  if (linkedSource) throw new Error(`Template source cannot be a symbolic link: ${linkedSource.name}`);
  const files = entries
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
    .map((entry) => join(templatesDirectory, entry.name))
    .sort((left, right) => left.localeCompare(right));
  if (files.length > MAX_TEMPLATE_SOURCES) {
    throw new Error(`A project may contain at most ${MAX_TEMPLATE_SOURCES} template source files (found ${files.length}).`);
  }
  return files;
}

export function resolveProjectTsxRuntime(
  resolveModule: (specifier: string) => string = (specifier) => createRequire(import.meta.url).resolve(specifier),
): ProjectTsxRuntime {
  let resolvedLoader: string;
  try {
    resolvedLoader = resolveModule("tsx");
  } catch {
    throw new Error(
      "Source-owned template commands require the optional TSX compiler. Install it in your project with: npm install --save-dev tsx",
    );
  }
  const nodeModulesIndex = resolvedLoader.lastIndexOf(nodeModulesMarker);
  const dependencyRoot = nodeModulesIndex < 0
    ? resolve(resolvedLoader, "..")
    : resolvedLoader.slice(0, nodeModulesIndex + nodeModulesMarker.length - 1);
  return { dependencyRoot, loader: pathToFileURL(resolvedLoader).href };
}

export function sanitizeTrustedSourceDiagnostic(value: string, cwd: string, dependencyRoot?: string): string {
  const roots = [...new Set([resolve(cwd), realpathSync(cwd), dependencyRoot].filter((root): root is string => Boolean(root)))]
    .sort((left, right) => right.length - left.length);
  let safe = value;
  for (const root of roots) {
    const replacement = root === dependencyRoot ? "<dependency>" : ".";
    safe = safe.split(root).join(replacement).split(pathToFileURL(root).href).join(replacement);
  }
  return safe;
}

export async function mapWithConcurrency<Input, Output>(
  values: readonly Input[],
  concurrency: number,
  transform: (value: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Loader concurrency must be a positive integer");
  const results = new Array<Output>(values.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await transform(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

async function loadTemplate(
  filePath: string,
  cwd: string,
  options: DiscoverProjectTemplatesOptions,
  runtime: ProjectTsxRuntime,
): Promise<DiscoveredTemplate> {
  const displayPath = relative(cwd, filePath);
  let serialized: {
    exportName: string;
    metadata: SceneTemplateMetadata;
    examples?: unknown;
  };
  try {
    const sourceUrl = pathToFileURL(filePath).href;
    const stdout = await runTrustedSourceProcess([
      "--import", runtime.loader,
      "--input-type=module",
      "--eval", TEMPLATE_LOADER,
      sourceUrl,
    ], { cwd, timeoutMs: options.timeoutMs, maxOutputBytes: options.maxOutputBytes });
    serialized = JSON.parse(stdout) as typeof serialized;
  } catch (error) {
    const detail = error instanceof TrustedSourceProcessError || error instanceof Error
      ? error.message
      : String(error);
    throw new Error(`Could not load ${displayPath}: ${sanitizeTrustedSourceDiagnostic(detail, cwd, runtime.dependencyRoot)}`);
  }
  return {
    exportName: serialized.exportName,
    filePath,
    importPath: `./templates/${basename(filePath).replace(/\.(?:ts|tsx)$/, "")}`,
    metadata: serialized.metadata,
    ...(Object.hasOwn(serialized, "examples") ? { examples: serialized.examples } : {}),
  };
}

export async function discoverProjectTemplates(
  cwd: string,
  options: DiscoverProjectTemplatesOptions = {},
): Promise<DiscoveredTemplate[]> {
  const root = resolve(cwd);
  const templatesDirectory = safeProjectPath(root, "vanillasky/templates");
  const excluded = new Set((options.excludeSourcePaths ?? []).map((path) => resolve(path)));
  const files = (await sourceFiles(templatesDirectory)).filter((file) => !excluded.has(resolve(file)));
  for (const file of files) safeProjectPath(root, file);
  if (files.length === 0) return [];
  const runtime = resolveProjectTsxRuntime();
  const discovered = await mapWithConcurrency(
    files,
    LOADER_CONCURRENCY,
    (file) => loadTemplate(file, root, options, runtime),
  );
  const byId = new Map<string, DiscoveredTemplate>();
  for (const template of discovered) {
    const duplicate = byId.get(template.metadata.id);
    if (duplicate) {
      throw new Error(
        `Duplicate template id ${JSON.stringify(template.metadata.id)} in ${relative(cwd, duplicate.filePath)} and ${relative(cwd, template.filePath)}`,
      );
    }
    byId.set(template.metadata.id, template);
  }
  return discovered;
}
