import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { listBuiltinTemplateMetadata } from "../visual-system/catalog/catalog.js";
import { summarizeTemplateVariables, type TemplateVariableSummary } from "../visual-system/catalog/schema.js";
import type { SceneTemplateMetadata } from "../visual-system/catalog/types.js";
import { discoverProjectTemplates } from "./project-templates.js";
import { inspectGeneratedTemplateStatus } from "./sync.js";

export type TemplateOrigin = "built-in" | "project";
export type TemplateStatus = "available" | "current" | "stale";

export interface TemplateCatalogItem {
  id: string;
  title: string;
  origin: TemplateOrigin;
  status: TemplateStatus;
  useWhen: string;
  /** Human-facing summary of what the template renders. */
  summary: string;
  planner: { useWhen: string; avoidWhen?: string };
  schema: SceneTemplateMetadata["schema"];
  schemaSummary: Record<string, TemplateVariableSummary>;
  family?: SceneTemplateMetadata["family"];
  jobs?: SceneTemplateMetadata["jobs"];
  register?: SceneTemplateMetadata["register"];
  duration: { min?: number; preferred?: number };
  generated: {
    browser: { path: "vanillasky/index.ts"; current: boolean | null };
    server: { path: "vanillasky/server.ts"; current: boolean | null };
    current: boolean | null;
  };
  wiring: { applicationImportsInspected: false; verified: false };
}

function item(
  metadata: SceneTemplateMetadata,
  origin: TemplateOrigin,
  generated: { browser: boolean; server: boolean } | null,
): TemplateCatalogItem {
  const useWhen = metadata.useWhen ?? metadata.description ?? "";
  const current = generated == null ? null : generated.browser && generated.server;
  return {
    id: metadata.id,
    title: metadata.label ?? metadata.id,
    origin,
    status: origin === "built-in" ? "available" : current ? "current" : "stale",
    useWhen,
    summary: metadata.description ?? "",
    planner: {
      useWhen,
      ...(metadata.avoidWhen == null ? {} : { avoidWhen: metadata.avoidWhen }),
    },
    schema: metadata.schema,
    schemaSummary: summarizeTemplateVariables(metadata.schema),
    ...(metadata.family == null ? {} : { family: metadata.family }),
    ...(metadata.jobs == null ? {} : { jobs: metadata.jobs }),
    ...(metadata.register == null ? {} : { register: metadata.register }),
    duration: {
      ...(metadata.minDuration == null ? {} : { min: metadata.minDuration }),
      ...(metadata.preferredDuration == null ? {} : { preferred: metadata.preferredDuration }),
    },
    generated: {
      browser: { path: "vanillasky/index.ts", current: generated?.browser ?? null },
      server: { path: "vanillasky/server.ts", current: generated?.server ?? null },
      current,
    },
    wiring: { applicationImportsInspected: false, verified: false },
  };
}

export function builtinTemplateCatalog(): TemplateCatalogItem[] {
  return listBuiltinTemplateMetadata()
    .map((metadata) => item(metadata, "built-in", null))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function hasProjectTemplateSources(cwd: string): boolean {
  const directory = join(cwd, "vanillasky/templates");
  if (!existsSync(directory)) return false;
  return readdirSync(directory, { withFileTypes: true })
    .some((entry) => (entry.isFile() || entry.isSymbolicLink()) && /\.(?:ts|tsx)$/.test(entry.name));
}

export async function effectiveTemplateCatalog(cwd: string): Promise<TemplateCatalogItem[]> {
  const builtins = builtinTemplateCatalog();
  const discovered = await discoverProjectTemplates(cwd);
  if (discovered.length === 0) return builtins;
  const generated = await inspectGeneratedTemplateStatus(cwd, discovered);
  const byId = new Map(builtins.map((entry) => [entry.id, entry]));
  for (const template of discovered) {
    byId.set(template.metadata.id, item(template.metadata, "project", {
      browser: generated.browser.current,
      server: generated.server.current,
    }));
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function findBuiltinTemplate(id: string): TemplateCatalogItem | undefined {
  return builtinTemplateCatalog().find((entry) => entry.id === id);
}

export async function findEffectiveTemplate(cwd: string, id: string): Promise<TemplateCatalogItem | undefined> {
  return (await effectiveTemplateCatalog(cwd)).find((entry) => entry.id === id);
}
