import type { TemplateJsonSchema, TemplateJsonSchemaProperty } from "./types.js";

export interface TemplateSchemaGates {
  requiresStat: boolean;
  requiresQuote: boolean;
  requiresScreenshot: boolean;
  allowsStockMedia: boolean;
  requiredAnyOf: readonly (readonly string[])[];
}

export interface TemplateVariableSummary {
  type: "string" | "string-array" | "number" | "boolean" | "enum" | "media" | "color" | "data-points";
  title?: string;
  description?: string;
  default?: unknown;
  examples?: readonly unknown[];
  options?: readonly string[];
  required: boolean;
  minItems?: number;
  maxItems?: number;
}

function cloneJson<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

export function getTemplateDefaults(schema: TemplateJsonSchema): Record<string, unknown> {
  return Object.fromEntries(Object.entries(schema.properties)
    .filter(([, property]) => property.default !== undefined)
    .map(([name, property]) => [name, cloneJson(property.default)]));
}

/** True when a conditional-presence field carries scene content rather than an empty sentinel. */
export function isMeaningfullyPresentTemplateValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function schemaProperties(schema: TemplateJsonSchemaProperty): TemplateJsonSchemaProperty[] {
  return [
    schema,
    ...Object.values(schema.properties ?? {}).flatMap(schemaProperties),
    ...(schema.items ? schemaProperties(schema.items) : []),
  ];
}

export function getTemplateSchemaGates(schema: TemplateJsonSchema): TemplateSchemaGates {
  const requiredAnyOf = schema["x-vanillasky"]?.requiredAnyOf ?? [];
  for (const [groupIndex, group] of requiredAnyOf.entries()) {
    if (!Array.isArray(group) || group.length === 0) {
      throw new Error(`Template schema x-vanillasky.requiredAnyOf[${groupIndex}] must name at least one field`);
    }
    for (const field of group) {
      if (typeof field !== "string" || !Object.hasOwn(schema.properties, field)) {
        throw new Error(`Template schema x-vanillasky.requiredAnyOf[${groupIndex}] field ${String(field)} is not declared`);
      }
    }
  }
  const properties = Object.values(schema.properties).flatMap(schemaProperties);
  return {
    requiresStat: schema["x-vanillasky"]?.requiresStat === true || properties.some(({ format }) => format === "grounded-stat"),
    requiresQuote: properties.some(({ format }) => format === "grounded-quote"),
    requiresScreenshot: properties.some(({ format }) => format === "supplied-image"),
    allowsStockMedia: schema["x-vanillasky"]?.allowsStockMedia === true || properties.some(({ format }) => format === "stock-media-keyword"),
    requiredAnyOf,
  };
}

function summaryType(property: TemplateJsonSchemaProperty): TemplateVariableSummary["type"] {
  if (property.format === "uri" || property.format === "supplied-image") return "media";
  if (property.enum) return "enum";
  if (property.type === "number" || property.type === "integer") return "number";
  if (property.type === "boolean") return "boolean";
  if (property.type === "array" && property.items?.type === "object") return "data-points";
  if (property.type === "array") return "string-array";
  return "string";
}

export function summarizeTemplateVariables(
  schema: TemplateJsonSchema,
): Record<string, TemplateVariableSummary> {
  const required = new Set(schema.required ?? []);
  return Object.fromEntries(Object.entries(schema.properties).map(([name, property]) => [name, {
    type: summaryType(property),
    ...(property.title == null ? {} : { title: property.title }),
    ...(property.description == null ? {} : { description: property.description }),
    ...(property.default === undefined ? {} : { default: cloneJson(property.default) }),
    ...(property.examples == null ? {} : { examples: cloneJson(property.examples) }),
    ...(property.enum == null ? {} : { options: [...property.enum] }),
    required: required.has(name),
    ...(property.minItems == null ? {} : { minItems: property.minItems }),
    ...(property.maxItems == null ? {} : { maxItems: property.maxItems }),
  }]));
}

export function templateVariableNotation(
  property: TemplateJsonSchemaProperty,
  required: boolean,
): string {
  const type = summaryType(property);
  const options = property.enum?.length ? `(${property.enum.join("|")})` : "";
  const itemCount = property.minItems === property.maxItems && property.minItems != null
    ? `[${property.minItems}]`
    : property.minItems != null || property.maxItems != null
      ? `[${property.minItems ?? 0}..${property.maxItems ?? "∞"}]`
      : "";
  const textProperty = property.type === "array" ? property.items : property;
  const characterCount = textProperty?.type === "string" &&
    (textProperty.minLength != null || textProperty.maxLength != null)
    ? `{${textProperty.minLength ?? 0}..${textProperty.maxLength ?? "∞"}}`
    : "";
  return `${type}${itemCount}${characterCount}${options}${required ? "!" : ""}`;
}
