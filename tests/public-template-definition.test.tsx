import { describe, expect, it } from "vitest";
import { defineTemplate, type TemplateDefinition } from "../src/templates";

const EMPTY_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const;

describe("public template definition", () => {
  it("uses preferredDuration as the only authoring duration name", () => {
    const template = defineTemplate({
      id: "preferredDuration",
      useWhen: "Test the canonical duration field.",
      schema: EMPTY_SCHEMA,
      preferredDuration: 4,
      component: () => null,
    });

    expect(template.preferredDuration).toBe(4);
    expect(template).not.toHaveProperty("duration");
  });

  it("does not accept an undocumented duration alias", () => {
    const conflictingDefinition: TemplateDefinition<typeof EMPTY_SCHEMA> = {
      id: "unsupportedDuration",
      useWhen: "Never select this invalid definition.",
      schema: EMPTY_SCHEMA,
      // @ts-expect-error duration is not part of the clean 0.1 authoring contract.
      duration: 3,
      component: () => null,
    };

    expect(() => defineTemplate(conflictingDefinition)).toThrow(
      "Template duration is not supported; use preferredDuration",
    );
  });

  it("keeps typed named examples on the browser authoring definition", () => {
    const template = defineTemplate({
      id: "withExamples",
      useWhen: "Show a supplied title.",
      schema: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
      } as const,
      examples: [{ name: "Launch", variables: { title: "Now shipping" } }],
      component: ({ variables }) => variables.title,
    });

    expect(template.examples).toEqual([
      { name: "Launch", variables: { title: "Now shipping" } },
    ]);
  });

  it("allows a named example to inherit required schema defaults", () => {
    const template = defineTemplate({
      id: "defaultedExample",
      useWhen: "Show a title with a complete default.",
      schema: {
        type: "object",
        properties: { title: { type: "string", default: "Ready" } },
        required: ["title"],
      } as const,
      examples: [{ name: "Default", variables: {} }],
      component: ({ variables }) => variables.title,
    });

    expect(template.examples?.[0]?.variables).toEqual({});
  });
});
