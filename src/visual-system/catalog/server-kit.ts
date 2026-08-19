import type { VideoCapabilities } from "../../protocol/types.js";
import type { SceneTemplateMetadata } from "./catalog-types.js";
import { assertTemplateTransitionMetadata } from "./transition-contract.js";

export interface ServerTemplateRegistry {
  readonly capabilities: VideoCapabilities;
  getTemplateMetadata(id: string): SceneTemplateMetadata | undefined;
  listTemplateMetadata(): SceneTemplateMetadata[];
}

export function createServerTemplateRegistry(options: {
  templates: readonly SceneTemplateMetadata[];
}): ServerTemplateRegistry {
  const byId = new Map<string, SceneTemplateMetadata>();
  for (const template of options.templates) {
    assertTemplateTransitionMetadata(template);
    if (byId.has(template.id)) throw new Error(`Duplicate template id: ${template.id}`);
    byId.set(template.id, template);
  }
  const templates = Object.freeze([...options.templates]);
  const capabilities: VideoCapabilities = { templates: templates.map(({ id }) => id) };
  return Object.freeze({
    capabilities,
    getTemplateMetadata: (id: string) => byId.get(id),
    listTemplateMetadata: () => [...templates],
  });
}

/** Internal runtime composition: customer metadata replaces matching defaults and adds new IDs. */
export function overlayServerTemplateRegistry(
  defaults: ServerTemplateRegistry,
  customer: ServerTemplateRegistry,
): ServerTemplateRegistry {
  const defaultTemplates = defaults.listTemplateMetadata();
  const customerTemplates = customer.listTemplateMetadata();
  const customerMetadata = new Map(customerTemplates.map((template) => [template.id, template]));
  const defaultIds = new Set(defaultTemplates.map(({ id }) => id));
  return createServerTemplateRegistry({
    templates: [
      ...defaultTemplates.map((template) => customerMetadata.get(template.id) ?? template),
      ...customerTemplates.filter(({ id }) => !defaultIds.has(id)),
    ],
  });
}
