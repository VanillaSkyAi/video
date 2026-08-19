import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getBuiltinTemplateMetadata } from "../visual-system/catalog/catalog.js";
import type { SceneTemplateMetadata, TemplateJsonSchema } from "../visual-system/catalog/types.js";
import { safeProjectPath } from "./safe-path.js";
import type { TemplateSyncPreview } from "./sync.js";

interface RegistryFile {
  path: string;
  target?: string;
  content: string;
}

interface RegistryItem {
  name: string;
  title?: string;
  description?: string;
  registryDependencies?: string[];
  files?: RegistryFile[];
  meta?: {
    vanillasky?: Record<string, unknown>;
  };
}

export interface RegistryTemplateSummary {
  id: string;
  title: string;
  description: string;
}

export interface RegistryTemplateDescription extends RegistryTemplateSummary {
  schema?: TemplateJsonSchema;
}

export interface AddRegistryTemplatesOptions {
  cwd: string;
  names: string[];
  registryDir?: string;
  dryRun?: boolean;
  overwrite?: boolean;
}

export interface AddRegistryTemplatesResult {
  added: string[];
  updated: string[];
  files: string[];
  changes: RegistryFileChange[];
  previewTemplates: TemplateSyncPreview[];
}

export interface RegistryFileChange {
  path: string;
  action: "create" | "update";
  before?: string;
  after: string;
}

function defaultRegistryDir(): string {
  const sourceCandidate = fileURLToPath(new URL("../../registry/items/", import.meta.url));
  const distributionCandidate = fileURLToPath(new URL("../registry/items/", import.meta.url));
  return existsSync(sourceCandidate) ? sourceCandidate : distributionCandidate;
}

function readItem(registryDir: string, name: string): RegistryItem {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) throw new Error(`Invalid registry item: ${name}`);
  const path = join(registryDir, `${name}.json`);
  if (!existsSync(path)) throw new Error(`Unknown template or registry item: ${name}`);
  return JSON.parse(readFileSync(path, "utf8")) as RegistryItem;
}

function readTemplateItem(registryDir: string, name: string): RegistryItem {
  let item: RegistryItem;
  try {
    item = readItem(registryDir, name);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unknown template or registry item:")) {
      throw new Error(`Unknown template: ${name}`);
    }
    if (error instanceof Error && error.message.startsWith("Invalid registry item:")) {
      throw new Error(`Invalid template: ${name}`);
    }
    throw error;
  }
  if (item.meta?.vanillasky?.layer !== "template") throw new Error(`${item.name} is not a template`);
  return item;
}

function dependencyName(value: string): string {
  return value.startsWith("@vanillasky/") ? value.slice("@vanillasky/".length) : value;
}

function safeDestination(cwd: string, target: string): string {
  return safeProjectPath(cwd, target);
}

function planCustomerFile(planned: Map<string, string>, target: string, content: string): void {
  const existing = planned.get(target);
  if (existing != null && existing !== content) {
    throw new Error(`Registry items provide conflicting content for ${target}`);
  }
  planned.set(target, content);
}

function registryTarget(file: RegistryFile): string {
  if (file.target) return file.target;
  return file.path.replace(/^src\/lib\//, "vanillasky/");
}

function primaryTemplateFile(item: RegistryItem): RegistryFile | undefined {
  return item.files?.find((file) => /scene-templates\/.*\.tsx$/.test(file.path));
}

function templateDefinition(item: RegistryItem): SceneTemplateMetadata {
  const templateFile = primaryTemplateFile(item);
  if (!templateFile) throw new Error(`Template ${item.name} has no render component`);
  const metadata = item.meta?.vanillasky ?? {};
  const canonical = getBuiltinTemplateMetadata(item.name);
  const schema = (canonical?.schema ?? metadata.schema) as TemplateJsonSchema | undefined;
  if (!schema) throw new Error(`Template ${item.name} has no JSON Schema contract`);
  return canonical ?? {
    id: item.name,
    label: item.title ?? item.name,
    description: item.description ?? "",
    useWhen: String(metadata.useWhen ?? item.description ?? ""),
    usesGlobalTextEffect: false,
    usesGlobalTransition: false,
    usesGlobalBackgroundEffect: false,
    schema,
    ...(metadata.jobs == null ? {} : { jobs: metadata.jobs }),
    ...(metadata.register == null ? {} : { register: metadata.register }),
    ...(metadata.textCanvas == null ? {} : { textCanvas: metadata.textCanvas }),
    ...(metadata.minDuration == null ? {} : { minDuration: metadata.minDuration }),
    ...(metadata.preferredDuration == null ? {} : { preferredDuration: metadata.preferredDuration }),
  } as SceneTemplateMetadata;
}

function materializedTemplateMetadata(item: RegistryItem): SceneTemplateMetadata {
  const definition = templateDefinition(item);
  const {
    schema,
    label = definition.id,
    description = "",
    usesGlobalTextEffect = false,
    usesGlobalTransition = false,
    usesGlobalBackgroundEffect = false,
    ...definitionWithoutDefaults
  } = definition;
  return {
    label,
    description,
    usesGlobalTextEffect,
    usesGlobalTransition,
    usesGlobalBackgroundEffect,
    ...definitionWithoutDefaults,
    schema: {
      ...schema,
      additionalProperties: schema.additionalProperties ?? false,
    },
  };
}

function templateSource(item: RegistryItem): string {
  const templateFile = primaryTemplateFile(item);
  if (!templateFile) throw new Error(`Template ${item.name} has no render component`);
  const component = templateFile.content.match(/export const (\w+Template)\b/)?.[1];
  if (!component) throw new Error(`Cannot identify the component exported by ${item.name}`);
  const definition = templateDefinition(item);
  const definitionLines = JSON.stringify(definition, null, 2)
    .split("\n")
    .slice(1, -1);
  definitionLines[definitionLines.length - 1] += ",";

  let componentSource = templateFile.content
    .replace(/(from\s+["'])\.\//g, "$1../scene-templates/")
    .replace(/(import\(\s*["'])\.\//g, "$1../scene-templates/")
    .replace(
      new RegExp(`export const ${component}: React\\.FC<SceneTemplateProps> = \\(\\{([\\s\\S]*?)\\n\\}\\) => \\{`),
      `export const ${component} = ({$1\n}: SceneTemplateProps) => {`,
    );
  if (!componentSource.includes("React.")) {
    componentSource = componentSource.replace(/^import (?:\* as )?React from ["']react["'];\n/m, "");
  }

  return [
    `import { defineTemplate } from "@vanillaskyai/video/templates";`,
    "",
    componentSource.trim(),
    "",
    `export const ${item.name}Template = defineTemplate({`,
    ...definitionLines,
    `  component: ${component},`,
    "});",
    "",
  ].join("\n");
}

export function listRegistryTemplates(registryDir = defaultRegistryDir()): RegistryTemplateSummary[] {
  return readdirSync(registryDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readItem(registryDir, name.slice(0, -5)))
    .filter((item) => item.meta?.vanillasky?.layer === "template")
    .map((item) => {
      const canonical = getBuiltinTemplateMetadata(item.name);
      return {
        id: item.name,
        title: item.title ?? item.name,
        description: canonical?.useWhen ?? item.description ?? "",
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function describeRegistryTemplate(
  name: string,
  registryDir = defaultRegistryDir(),
): RegistryTemplateDescription | undefined {
  try {
    const item = readItem(registryDir, name);
    const metadata = item.meta?.vanillasky ?? {};
    if (metadata.layer !== "template") return undefined;
    const canonical = getBuiltinTemplateMetadata(item.name);
    const schema = (canonical?.schema ?? metadata.schema) as TemplateJsonSchema | undefined;
    return {
      id: item.name,
      title: item.title ?? item.name,
      description: canonical?.useWhen ?? item.description ?? "",
      ...(schema ? { schema } : {}),
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unknown template or registry item:")) return undefined;
    throw error;
  }
}

export function listInstalledTemplates(cwd: string): string[] {
  const templatesDirectory = join(resolve(cwd), "vanillasky/templates");
  if (!existsSync(templatesDirectory)) return [];
  return [...new Set(readdirSync(templatesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^[A-Za-z][A-Za-z0-9_-]*\.(?:ts|tsx)$/.test(entry.name))
    .map((entry) => entry.name.replace(/\.(?:ts|tsx)$/, "")))]
    .sort((left, right) => left.localeCompare(right));
}

function plannedChanges(cwd: string, planned: ReadonlyMap<string, string>): RegistryFileChange[] {
  const changes: RegistryFileChange[] = [];
  for (const [path, after] of planned) {
    const destination = safeDestination(cwd, path);
    if (!existsSync(destination)) {
      changes.push({ path, action: "create", after });
      continue;
    }
    const before = readFileSync(destination, "utf8");
    if (before !== after) changes.push({ path, action: "update", before, after });
  }
  return changes;
}

function applyChanges(cwd: string, changes: readonly RegistryFileChange[]): void {
  for (const change of changes) {
    const destination = safeDestination(cwd, change.path);
    mkdirSync(dirname(destination), { recursive: true });
    safeProjectPath(cwd, destination);
    const temporary = join(
      dirname(destination),
      `.${basename(destination)}.vanillasky-tmp-${randomUUID()}`,
    );
    try {
      writeFileSync(temporary, change.after, { encoding: "utf8", flag: "wx" });
      safeProjectPath(cwd, destination);
      renameSync(temporary, destination);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
}

export function addRegistryTemplates(
  options: AddRegistryTemplatesOptions,
): AddRegistryTemplatesResult {
  const cwd = resolve(options.cwd);
  const registryDir = options.registryDir ?? defaultRegistryDir();
  const requested = [...new Set(options.names)];
  const requestedItems = requested.map((name) => readTemplateItem(registryDir, name));
  const installed = new Set(listInstalledTemplates(cwd));
  const planned = new Map<string, string>();
  const visited = new Set<string>();

  const installItem = (name: string): void => {
    if (visited.has(name)) return;
    visited.add(name);
    const item = readItem(registryDir, name);
    const primary = item.meta?.vanillasky?.layer === "template"
      ? primaryTemplateFile(item)
      : undefined;
    for (const dependency of item.registryDependencies ?? []) {
      installItem(dependencyName(dependency));
    }
    for (const file of item.files ?? []) {
      if (file === primary) continue;
      const target = registryTarget(file);
      planCustomerFile(planned, target, file.content);
    }
  };

  for (const item of requestedItems) {
    installItem(item.name);
    planCustomerFile(
      planned,
      `vanillasky/templates/${item.name}.tsx`,
      templateSource(item),
    );
  }

  const changes = plannedChanges(cwd, planned);
  const updates = changes.filter((change) => change.action === "update");
  if (!options.dryRun && !options.overwrite && updates.length > 0) {
    throw new Error(`Refusing to overwrite customer-owned file: ${updates[0]?.path}`);
  }
  if (!options.dryRun) applyChanges(cwd, changes);

  const templateChanges = new Set(changes
    .filter((change) => /^vanillasky\/templates\/.*\.tsx$/.test(change.path))
    .map((change) => change.path.slice("vanillasky/templates/".length, -".tsx".length)));
  const added = requested.filter((name) => !installed.has(name) && templateChanges.has(name));
  const updated = requested.filter((name) => installed.has(name) && templateChanges.has(name));
  return {
    added,
    updated,
    files: changes.map(({ path }) => path),
    changes,
    previewTemplates: requestedItems.map((item) => ({
      sourcePath: `vanillasky/templates/${item.name}.tsx`,
      exportName: `${item.name}Template`,
      importPath: `./templates/${item.name}`,
      metadata: materializedTemplateMetadata(item),
    })),
  };
}
