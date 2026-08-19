export { createTemplateRegistry } from "./visual-system/catalog/kit.js";
export type { TemplateRegistry } from "./visual-system/catalog/kit.js";
export type {
  SceneTemplate,
  SceneTemplateMetadata,
  SceneTemplateProps,
  TemplateTransitionTiming,
  TemplateFamily,
  TemplateJsonSchema,
  TemplateTimingMetadata,
} from "./visual-system/catalog/types.js";
import type { ComponentType } from "react";
import type {
  InferTemplateJsonSchema,
  SceneTemplateMetadata,
  SceneTemplateProps,
  TemplateJsonSchema,
} from "./visual-system/catalog/types.js";
import type { SceneTemplate } from "./visual-system/catalog/types.js";
import { defineTemplate as defineInternalTemplate } from "./visual-system/catalog/kit.js";

export interface TemplateExample<Variables extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  variables: Partial<Variables>;
}

type OptionalGlobalDefaults = Partial<Pick<
  SceneTemplateMetadata,
  "usesGlobalTextEffect" | "usesGlobalTransition" | "usesGlobalBackgroundEffect"
>>;

type TemplateDefinitionMetadata = Omit<
  SceneTemplateMetadata,
  "id" | "useWhen" | "schema" | keyof OptionalGlobalDefaults
> & OptionalGlobalDefaults;

export type TemplateDefinition<Schema extends TemplateJsonSchema = TemplateJsonSchema> = TemplateDefinitionMetadata & {
  id: string;
  useWhen: string;
  schema: Schema;
  examples?: readonly TemplateExample<InferTemplateJsonSchema<Schema>>[];
  component: ComponentType<SceneTemplateProps<InferTemplateJsonSchema<Schema>>>;
};

export function defineTemplate<const Schema extends TemplateJsonSchema>(
  definition: TemplateDefinition<Schema>,
): SceneTemplate<InferTemplateJsonSchema<Schema>> & {
  examples?: readonly TemplateExample<InferTemplateJsonSchema<Schema>>[];
} {
  if (Object.hasOwn(definition, "duration")) {
    throw new Error("Template duration is not supported; use preferredDuration");
  }
  return defineInternalTemplate(
    definition as Parameters<typeof defineInternalTemplate>[0],
  ) as SceneTemplate<InferTemplateJsonSchema<Schema>> & {
    examples?: readonly TemplateExample<InferTemplateJsonSchema<Schema>>[];
  };
}
