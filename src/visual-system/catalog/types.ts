import type { ComponentType } from "react";
import type { VideoStyle } from "../../protocol/types.js";
import type {
  SceneTemplateMetadata,
  TemplateJsonSchema,
  TemplateJsonSchemaProperty,
} from "./catalog-types.js";

export type {
  SceneTemplateMetadata,
  TemplateJob,
  TemplateMetadataCatalog,
  TemplateRegister,
  TemplateJsonSchema,
  TemplateJsonSchemaProperty,
  TemplateFamily,
  TemplateTimingMetadata,
  TemplateTransitionTiming,
} from "./catalog-types.js";

export interface TemplateSafeZone {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SceneTemplateProps<Variables extends Record<string, unknown> = Record<string, unknown>> {
  variables: Variables;
  style: VideoStyle;
  progress: number;
  /**
   * Optional transition-safe visual progress. Keep grounded values, media,
   * and semantic state on `progress`; use this only for entrance/exit motion.
   * Older renderers may omit it, so templates must fall back to `progress`.
   */
  motionProgress?: number;
  beatIntensity: number;
  width: number;
  height: number;
  textArchetype?: string;
  backgroundEffect?: string;
  safeZone: TemplateSafeZone;
  sceneDuration?: number;
  isPlaying?: boolean;
}

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) =>
      | { value: Output; issues?: undefined }
      | { issues: readonly { message: string }[] }
      | Promise<{ value: Output; issues?: undefined } | { issues: readonly { message: string }[] }>;
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}

export interface StandardJSONSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly jsonSchema: {
      readonly input: (options: { target: string }) => Record<string, unknown>;
      readonly output: (options: { target: string }) => Record<string, unknown>;
    };
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}

type JsonObjectRequiredKeys<Property> = Property extends { readonly required: readonly (infer Required)[] }
  ? Required : never;

type JsonObjectValue<Property extends { readonly properties: Readonly<Record<string, TemplateJsonSchemaProperty>> }> = {
  [Key in Extract<JsonObjectRequiredKeys<Property>, keyof Property["properties"]>]: JsonPropertyValue<Property["properties"][Key]>;
} & {
  [Key in Exclude<keyof Property["properties"], JsonObjectRequiredKeys<Property>>]?: JsonPropertyValue<Property["properties"][Key]>;
};

type JsonPropertyValue<Property> = Property extends { readonly enum: readonly (infer Value)[] }
  ? Value
  : Property extends { readonly type: "number" | "integer" } ? number
    : Property extends { readonly type: "boolean" } ? boolean
      : Property extends { readonly type: "array"; readonly items: infer Item } ? JsonPropertyValue<Item>[]
        : Property extends { readonly type: "array" } ? unknown[]
          : Property extends { readonly type: "object"; readonly properties: Readonly<Record<string, TemplateJsonSchemaProperty>> } ? JsonObjectValue<Property>
            : Property extends { readonly type: "object" } ? Record<string, unknown>
          : string;

type RequiredJsonSchemaKeys<Schema extends TemplateJsonSchema> =
  Schema["required"] extends readonly (infer Key)[]
    ? Extract<Key, keyof Schema["properties"]>
    : never;

export type InferTemplateJsonSchema<Schema extends TemplateJsonSchema> = {
  [Key in RequiredJsonSchemaKeys<Schema>]: JsonPropertyValue<Schema["properties"][Key]>;
} & {
  [Key in Exclude<keyof Schema["properties"], RequiredJsonSchemaKeys<Schema>>]?:
    JsonPropertyValue<Schema["properties"][Key]>;
};

export interface SceneTemplate<Variables extends Record<string, unknown> = Record<string, unknown>> extends SceneTemplateMetadata {
  component: ComponentType<SceneTemplateProps<Variables>>;
}
