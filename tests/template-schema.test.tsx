import { createElement } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  createRenderTemplateRegistry,
  createServerTemplateRegistry,
  createTemplateSceneValidator,
  defineTemplate,
} from "../src/visual-system/catalog/internal";
import { defineTemplate as definePublicTemplate } from "../src/templates";

const chartSchema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, description: "Grounded chart title" },
    value: { type: "number", minimum: 0, default: 0 },
    note: { type: "string" },
  },
  required: ["title", "value"],
  additionalProperties: false,
} as const;

describe("schema-driven templates", () => {
  it("infers arrays and nested objects through the small public definition", () => {
    definePublicTemplate({
      id: "list",
      useWhen: "Show a labeled list.",
      schema: {
        type: "object",
        properties: {
          tags: { type: "array", items: { type: "string" } },
          owner: {
            type: "object",
            properties: { name: { type: "string" }, score: { type: "number" } },
            required: ["name"],
          },
        },
        required: ["tags", "owner"],
        additionalProperties: false,
      } as const,
      component: ({ variables }) => {
        expectTypeOf(variables.tags).toEqualTypeOf<string[]>();
        expectTypeOf(variables.owner.name).toEqualTypeOf<string>();
        expectTypeOf(variables.owner.score).toEqualTypeOf<number | undefined>();
        return null;
      },
    });

    const unsupportedCompileFixture = () => {
      definePublicTemplate({
        id: "unsupported-shape",
        useWhen: "Compile-time rejection only.",
        // @ts-expect-error The public API requires one schema instead of variableSchema plumbing.
        variableSchema: {},
        component: () => null,
      });
    };
    expectTypeOf(unsupportedCompileFixture).toEqualTypeOf<() => void>();
  });

  it("keeps one serializable schema as the template and server metadata contract", () => {
    const chart = defineTemplate({
      id: "chart",
      useWhen: "Show one grounded value with a concise title.",
      schema: chartSchema,
      component: ({ variables }) => {
        expectTypeOf(variables.title).toEqualTypeOf<string>();
        expectTypeOf(variables.value).toEqualTypeOf<number>();
        expectTypeOf(variables.note).toEqualTypeOf<string | undefined>();
        return createElement("strong", null, variables.title, variables.value);
      },
    });

    const metadata = createRenderTemplateRegistry({ templates: [chart] }).listTemplateMetadata()[0];
    expect(metadata.schema).toEqual(chartSchema);
    expect(metadata.useWhen).toBe("Show one grounded value with a concise title.");
  });

  it("does not guess planner semantics from property names or types", () => {
    const template = defineTemplate({
      id: "facts",
      useWhen: "Show grounded facts.",
      schema: {
        type: "object",
        properties: {
          quote: { type: "string" },
          score: { type: "number" },
          media: { type: "string" },
        },
      } as const,
      component: () => null,
    });

    expect(template).not.toHaveProperty("requiresQuote");
    expect(template).not.toHaveProperty("requiresStat");
  });

  it("validates generated server metadata with the complete JSON schema", () => {
    const renderTemplate = defineTemplate({
      id: "chart",
      useWhen: "Show a grounded chart.",
      schema: chartSchema,
      component: () => null,
    });
    const metadata = createRenderTemplateRegistry({ templates: [renderTemplate] }).listTemplateMetadata();
    const validate = createTemplateSceneValidator({
      kit: createServerTemplateRegistry({ templates: metadata }),
    });
    const context = { input: { input: "Revenue is 42." }, previousScenes: [] };
    const scene = (variables: Record<string, unknown>) => ({
      id: "one",
      templateId: "chart",
      variables,
      timing: { fixedDuration: 3 },
    });

    expect(() => validate(scene({ title: "Revenue", value: 42 }), context)).not.toThrow();
    expect(() => validate(scene({ title: "", value: 42 }), context)).toThrow(/title/i);
    expect(() => validate(scene({ title: "Revenue", value: -1 }), context)).toThrow(/value/i);
  });

  it("rejects opaque schemas that cannot cross the server boundary", () => {
    expect(() => defineTemplate({
      id: "opaque",
      useWhen: "Never used.",
      schema: {
        "~standard": {
          version: 1 as const,
          vendor: "opaque-test",
          validate: (value: unknown) => ({ value }),
        },
      },
      component: () => null,
    })).toThrow(/Standard JSON Schema/);
  });

  it("uses serializable JSON Schema as the authoritative validator", () => {
    const flexible = defineTemplate({
      id: "flexible",
      useWhen: "Show a string or numeric grounded value.",
      schema: {
        "~standard": {
          version: 1 as const,
          vendor: "complex-test",
          validate: (value: unknown) => ({ value }),
          jsonSchema: {
            input: () => ({
              type: "object",
              properties: { value: { anyOf: [{ type: "string" }, { type: "number" }] } },
              required: ["value"],
              additionalProperties: false,
            }),
            output: () => ({}),
          },
        },
      },
      component: () => null,
    });
    const validate = createTemplateSceneValidator({
      kit: createServerTemplateRegistry({
        templates: createRenderTemplateRegistry({ templates: [flexible] }).listTemplateMetadata(),
      }),
    });
    expect(() => validate({
      id: "one",
      templateId: "flexible",
      variables: { value: 42 },
      timing: { fixedDuration: 3 },
    }, { input: { input: "42" }, previousScenes: [] })).not.toThrow();
  });

  it("applies the media allowlist to schema URI fields", () => {
    const image = defineTemplate({
      id: "image",
      useWhen: "Show an authorized supplied image.",
      schema: {
        type: "object",
        properties: { imageUrl: { type: "string", format: "uri" } },
        required: ["imageUrl"],
      } as const,
      component: () => null,
    });
    const validate = createTemplateSceneValidator({ kit: createRenderTemplateRegistry({ templates: [image] }) });
    const scene = { id: "image", templateId: "image", variables: { imageUrl: "https://evil.example/image.png" }, timing: { fixedDuration: 3 } };
    expect(() => validate(scene, { input: { input: "No media supplied" }, previousScenes: [] })).toThrow(/authorized|media|url/i);
  });

  it("accepts the built-in empty sentinel only for optional media fields", () => {
    const optionalMedia = defineTemplate({
      id: "optional-media",
      useWhen: "Show optional supplied media.",
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          mediaUrl: { type: "string", format: "uri", default: "" },
        },
        required: ["title"],
        additionalProperties: false,
      } as const,
      component: () => null,
    });
    const validate = createTemplateSceneValidator({
      kit: createRenderTemplateRegistry({ templates: [optionalMedia] }),
    });
    const context = { input: { input: "Grounded title" }, previousScenes: [] };

    expect(() => validate({
      id: "optional-empty",
      templateId: "optional-media",
      variables: { title: "Grounded title", mediaUrl: "" },
      timing: { fixedDuration: 3 },
    }, context)).not.toThrow();

    const requiredMedia = defineTemplate({
      id: "required-media",
      useWhen: "Show required supplied media.",
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          mediaUrl: { type: "string", format: "uri", default: "" },
        },
        required: ["title", "mediaUrl"],
        additionalProperties: false,
      } as const,
      component: () => null,
    });
    const validateRequired = createTemplateSceneValidator({
      kit: createRenderTemplateRegistry({ templates: [requiredMedia] }),
    });
    expect(() => validateRequired({
      id: "required-empty",
      templateId: "required-media",
      variables: { title: "Grounded title", mediaUrl: "" },
      timing: { fixedDuration: 3 },
    }, context)).toThrow(/valid URL/);
  });
});
