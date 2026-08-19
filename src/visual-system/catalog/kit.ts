import type { VideoCapabilities } from "../../protocol/types.js";
import type {
  SceneTemplate,
  SceneTemplateMetadata,
  StandardSchemaV1,
  StandardJSONSchemaV1,
  TemplateJsonSchema,
  InferTemplateJsonSchema,
} from "./types.js";
import { assertTemplateTransitionMetadata } from "./transition-contract.js";

type TemplateDefinitionBase = Omit<
  SceneTemplate,
  "schema" | "usesGlobalTextEffect" | "usesGlobalTransition" | "usesGlobalBackgroundEffect"
> & Partial<Pick<
  SceneTemplate,
  "usesGlobalTextEffect" | "usesGlobalTransition" | "usesGlobalBackgroundEffect"
>>;

export type MotionTemplateDefinition = TemplateDefinitionBase & {
  schema: TemplateJsonSchema | StandardSchemaV1 | StandardJSONSchemaV1;
};

type JsonSchemaDefinition<Schema extends TemplateJsonSchema> = Omit<
  MotionTemplateDefinition,
  "schema" | "component"
> & {
  schema: Schema;
  component: SceneTemplate<InferTemplateJsonSchema<Schema>>["component"];
};
export type { JsonSchemaDefinition };

export interface TemplateRegistry {
  readonly templates: readonly SceneTemplate<any>[];
  readonly capabilities: VideoCapabilities;
  getTemplate(id: string): SceneTemplate | undefined;
  getTemplateMetadata(id: string): SceneTemplateMetadata | undefined;
  listTemplateMetadata(): SceneTemplateMetadata[];
}

function toMetadata(template: SceneTemplate): SceneTemplateMetadata {
  return {
    id: template.id,
    label: template.label,
    description: template.description,
    category: template.category,
    family: template.family,
    usesGlobalTextEffect: template.usesGlobalTextEffect,
    usesGlobalTransition: template.usesGlobalTransition,
    transitionTiming: template.transitionTiming,
    usesGlobalBackgroundEffect: template.usesGlobalBackgroundEffect,
    textCanvas: template.textCanvas,
    jobs: template.jobs,
    register: template.register,
    useWhen: template.useWhen,
    avoidWhen: template.avoidWhen,
    schema: template.schema,
    minDuration: template.minDuration,
    preferredDuration: template.preferredDuration,
    timing: template.timing,
  };
}

/** Internal CLI boundary: remove runtime functions before writing customer source. */
export function serializeTemplate(template: SceneTemplate): SceneTemplateMetadata {
  const rawMetadata = toMetadata(template);
  const metadata = Object.fromEntries(
    Object.entries(rawMetadata).filter(([, value]) => value !== undefined),
  ) as unknown as SceneTemplateMetadata;
  assertJsonValue(metadata, "template metadata");
  return JSON.parse(JSON.stringify(metadata)) as SceneTemplateMetadata;
}

function assertJsonValue(value: unknown, path: string, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new Error(`${path} must contain only finite JSON numbers`);
  }
  if (typeof value !== "object") throw new Error(`${path} contains a non-serializable ${typeof value}`);
  if (seen.has(value)) throw new Error(`${path} contains a circular value`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonValue(entry, `${path}[${index}]`, seen));
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error(`${path} contains a non-serializable object`);
    }
    for (const [key, entry] of Object.entries(value)) assertJsonValue(entry, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

function isTemplateJsonSchema(value: unknown): value is TemplateJsonSchema {
  if (typeof value !== "object" || value == null) return false;
  const schema = value as { type?: unknown; properties?: unknown };
  return schema.type === "object" && typeof schema.properties === "object" && schema.properties != null;
}

export function defineTemplate<const Schema extends TemplateJsonSchema>(definition: JsonSchemaDefinition<Schema>): SceneTemplate<InferTemplateJsonSchema<Schema>>;
export function defineTemplate(definition: MotionTemplateDefinition): SceneTemplate;
export function defineTemplate(definition: MotionTemplateDefinition): SceneTemplate {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(definition.id)) {
    throw new Error(`Invalid template id: ${definition.id}`);
  }
  const suppliedSchema = "schema" in definition ? definition.schema : undefined;
  const standard = suppliedSchema && "~standard" in suppliedSchema
    ? suppliedSchema["~standard"] as {
      validate?: StandardSchemaV1["~standard"]["validate"];
      jsonSchema?: StandardJSONSchemaV1["~standard"]["jsonSchema"];
    }
    : undefined;
  const convertedSchema = standard?.jsonSchema
    ? standard.jsonSchema.input({ target: "draft-07" })
    : suppliedSchema && !("~standard" in suppliedSchema) ? suppliedSchema : undefined;
  if (standard && !standard.jsonSchema) {
    throw new Error("Template schemas must expose Standard JSON Schema so the server registry can be generated safely");
  }
  if (!convertedSchema || !isTemplateJsonSchema(convertedSchema)) {
    throw new Error("Template schema must describe a JSON object");
  }
  const schema = { ...convertedSchema, additionalProperties: convertedSchema.additionalProperties ?? false };
  const transitionMetadata = {
    id: definition.id,
    usesGlobalTransition: definition.usesGlobalTransition ?? false,
    transitionTiming: definition.transitionTiming,
  };
  assertTemplateTransitionMetadata(transitionMetadata);
  const { schema: _runtimeSchema, duration, ...definitionWithoutSchema } = definition as MotionTemplateDefinition & { duration?: number };
  return Object.freeze({
    label: definition.id,
    description: "",
    usesGlobalTextEffect: false,
    usesGlobalTransition: false,
    usesGlobalBackgroundEffect: false,
    ...definitionWithoutSchema,
    schema,
    ...(duration == null ? {} : { preferredDuration: duration }),
  });
}

export function createRenderTemplateRegistry(options: {
  templates: readonly SceneTemplate<any>[];
  metadata?: readonly SceneTemplateMetadata[];
}): TemplateRegistry {
  const byId = new Map<string, SceneTemplate>();
  for (const template of options.templates) {
    assertTemplateTransitionMetadata(template);
    if (byId.has(template.id)) throw new Error(`Duplicate template id: ${template.id}`);
    byId.set(template.id, template);
  }
  const templates = Object.freeze([...options.templates]);
  if (options.metadata && options.metadata.map(({ id }) => id).join("\0") !== templates.map(({ id }) => id).join("\0")) {
    throw new Error("Template metadata does not match render templates");
  }
  const metadata = new Map((options.metadata ?? templates.map(toMetadata)).map((template) => [template.id, template]));
  const capabilities: VideoCapabilities = { templates: templates.map(({ id }) => id) };

  return Object.freeze({
    templates,
    capabilities,
    getTemplate: (id: string) => byId.get(id),
    getTemplateMetadata: (id: string) => metadata.get(id),
    listTemplateMetadata: () => [...metadata.values()],
  });
}

/** Internal runtime composition: customer templates replace matching defaults and add new IDs. */
export function overlayTemplateRegistry(
  defaults: TemplateRegistry,
  customer: TemplateRegistry,
): TemplateRegistry {
  const customerTemplates = new Map(customer.templates.map((template) => [template.id, template]));
  const defaultIds = new Set(defaults.templates.map(({ id }) => id));
  const templates = [
    ...defaults.templates.map((template) => customerTemplates.get(template.id) ?? template),
    ...customer.templates.filter(({ id }) => !defaultIds.has(id)),
  ];
  const customerMetadataList = customer.listTemplateMetadata();
  const customerMetadata = new Map(customerMetadataList.map((template) => [template.id, template]));
  const metadata = [
    ...defaults.listTemplateMetadata().map((template) => customerMetadata.get(template.id) ?? template),
    ...customerMetadataList.filter(({ id }) => !defaultIds.has(id)),
  ];
  return createRenderTemplateRegistry({ templates, metadata });
}

/** Build the browser renderer registry from customer-owned template definitions. */
export function createTemplateRegistry(options: {
  definitions: readonly SceneTemplate<any>[];
}): TemplateRegistry {
  return createRenderTemplateRegistry({ templates: options.definitions });
}
