import { describe, expect, it } from "vitest";

import { BUILTIN_TEMPLATE_KIT } from "../src/visual-system/catalog/builtin";
import { BUILTIN_TEMPLATE_CATALOG } from "../src/visual-system/catalog/catalog";

describe("default template registries", () => {
  it("keeps the browser renderers and React-free server metadata in exact parity", () => {
    expect(BUILTIN_TEMPLATE_KIT.templates.map(({ id }) => id)).toEqual(
      BUILTIN_TEMPLATE_CATALOG.map(({ id }) => id),
    );
    expect(BUILTIN_TEMPLATE_KIT.listTemplateMetadata()).toEqual(BUILTIN_TEMPLATE_CATALOG);
    expect(BUILTIN_TEMPLATE_KIT.templates.every(({ component }) => !Object.isFrozen(component))).toBe(true);
  });
});
