import type { VideoCapabilities } from "../../protocol/types.js";
import { GENERATED_BUILTIN_TEMPLATE_CATALOG } from "./catalog.generated.js";
import type { SceneTemplateMetadata } from "./catalog-types.js";
import type { InferTemplateJsonSchema, TemplateJsonSchema } from "./types.js";

type GeneratedTemplate = (typeof GENERATED_BUILTIN_TEMPLATE_CATALOG)[number];
export type BuiltinTemplateId = GeneratedTemplate["id"];
type GeneratedTemplateById<Id extends BuiltinTemplateId> = Extract<GeneratedTemplate, { id: Id }>;
type GeneratedSchema<Id extends BuiltinTemplateId> = GeneratedTemplateById<Id>["schema"];

/** Variables accepted by a bundled template, derived from its canonical schema. */
export type TemplateVariables<Id extends BuiltinTemplateId> = GeneratedSchema<Id> extends TemplateJsonSchema
  ? InferTemplateJsonSchema<GeneratedSchema<Id>>
  : never;

function freezeValue<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) freezeValue(nested);
    Object.freeze(value);
  }
  return value;
}

export const BUILTIN_TEMPLATE_CATALOG: readonly SceneTemplateMetadata[] = freezeValue(
  [...GENERATED_BUILTIN_TEMPLATE_CATALOG] as SceneTemplateMetadata[],
);

const metadataById = new Map(BUILTIN_TEMPLATE_CATALOG.map((template) => [template.id, template]));

export const BUILTIN_TEMPLATE_CAPABILITIES: Readonly<VideoCapabilities> = freezeValue({
  templates: BUILTIN_TEMPLATE_CATALOG.map(({ id }) => id).sort(),
});

export function listBuiltinTemplateMetadata(): readonly SceneTemplateMetadata[] {
  return BUILTIN_TEMPLATE_CATALOG;
}

export function getBuiltinTemplateMetadata(id: string): SceneTemplateMetadata | undefined {
  return metadataById.get(id);
}
