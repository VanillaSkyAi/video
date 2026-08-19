import { createElement } from "react";
import {
  GENERATED_BUILTIN_TEMPLATE_LOADERS,
  type BuiltinTemplateModule,
} from "./builtin-loaders.generated.js";
import {
  BUILTIN_TEMPLATE_CAPABILITIES,
  BUILTIN_TEMPLATE_CATALOG,
  getBuiltinTemplateMetadata,
} from "./builtin-metadata.js";
import type { TemplateRegistry } from "./kit.js";
import type { SceneTemplate } from "./types.js";

interface PreloadableBuiltinTemplate {
  component: SceneTemplate["component"];
  preload(): Promise<void>;
}

function createPreloadableBuiltinTemplate(
  loader: () => Promise<BuiltinTemplateModule>,
): PreloadableBuiltinTemplate {
  let loaded: BuiltinTemplateModule | undefined;
  let failure: unknown;
  let pending: Promise<void> | undefined;

  const preload = (): Promise<void> => {
    if (loaded) return Promise.resolve();
    if (failure) return Promise.reject(failure);
    pending ??= loader().then(
      (module) => {
        loaded = module;
      },
      (cause: unknown) => {
        failure = cause;
        throw cause;
      },
    );
    return pending;
  };

  const component: SceneTemplate["component"] = (props) => {
    if (loaded) return createElement(loaded.default, props);
    if (failure) throw failure;
    throw preload();
  };

  return { component, preload };
}

function freezeTemplate<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) freezeTemplate(nested);
    Object.freeze(value);
  }
  return value;
}

const preloadableById = new Map(
  BUILTIN_TEMPLATE_CATALOG.map((metadata) => {
    const id = metadata.id as keyof typeof GENERATED_BUILTIN_TEMPLATE_LOADERS;
    return [id, createPreloadableBuiltinTemplate(GENERATED_BUILTIN_TEMPLATE_LOADERS[id])] as const;
  }),
);

export const BUILTIN_TEMPLATES: readonly SceneTemplate[] = Object.freeze(
  BUILTIN_TEMPLATE_CATALOG.map((metadata) => Object.freeze({
    ...freezeTemplate({ ...metadata }),
    component: preloadableById.get(
      metadata.id as keyof typeof GENERATED_BUILTIN_TEMPLATE_LOADERS,
    )!.component,
  })),
);

const templateById = new Map(BUILTIN_TEMPLATES.map((template) => [template.id, template]));

export const BUILTIN_TEMPLATE_KIT: TemplateRegistry = Object.freeze({
  templates: BUILTIN_TEMPLATES,
  capabilities: BUILTIN_TEMPLATE_CAPABILITIES,
  getTemplate: (id: string) => templateById.get(id),
  getTemplateMetadata: getBuiltinTemplateMetadata,
  listTemplateMetadata: () => BUILTIN_TEMPLATES.map(({ component: _component, ...metadata }) => metadata),
});

export function getBuiltinTemplate(id: string): SceneTemplate | undefined {
  return templateById.get(id);
}

/** Load the exact renderer state used by the player before its first frame. */
export function preloadBuiltinTemplate(id: string): Promise<void> | undefined {
  return preloadableById.get(id as keyof typeof GENERATED_BUILTIN_TEMPLATE_LOADERS)?.preload();
}

export { createRenderTemplateRegistry, defineTemplate } from "./kit.js";
export type { TemplateRegistry, MotionTemplateDefinition } from "./kit.js";
export type {
  SceneTemplate,
  SceneTemplateMetadata,
  SceneTemplateProps,
  TemplateTransitionTiming,
  TemplateJob,
  TemplateRegister,
  TemplateSafeZone,
} from "./types.js";
