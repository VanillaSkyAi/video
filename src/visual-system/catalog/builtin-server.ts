import { BUILTIN_TEMPLATE_CATALOG } from "./builtin-metadata.js";
import { createServerTemplateRegistry } from "./server-kit.js";

/** Internal React-free default for the public server facade. */
export const BUILTIN_SERVER_TEMPLATE_KIT = createServerTemplateRegistry({
  templates: BUILTIN_TEMPLATE_CATALOG,
});
