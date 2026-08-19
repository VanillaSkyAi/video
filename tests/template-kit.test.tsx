import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { getTemplateDefaults, summarizeTemplateVariables } from "../src/visual-system/catalog/schema";

const EMPTY_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const;

describe("customer-owned template kit", () => {
  it("requires explicit valid transition timing only for templates that opt in", async () => {
    const { defineTemplate } = await import("../src/visual-system/catalog/internal");
    const definition = {
      id: "transitionProbe",
      schema: EMPTY_SCHEMA,
      component: () => null,
    };
    expect(() => defineTemplate({ ...definition, usesGlobalTransition: true }))
      .toThrow(/transitionTiming is required/);
    expect(() => defineTemplate({
      ...definition,
      usesGlobalTransition: true,
      transitionTiming: { entryReadyProgress: 0.8, holdProgress: 0.7 },
    })).toThrow(/entryReadyProgress < holdProgress/);
    expect(() => defineTemplate({
      ...definition,
      transitionTiming: { entryReadyProgress: 0.2, holdProgress: 0.7 },
    })).toThrow(/requires usesGlobalTransition/);
    expect(defineTemplate({
      ...definition,
      usesGlobalTransition: true,
      transitionTiming: { entryReadyProgress: 0.2, holdProgress: 0.7 },
    })).toMatchObject({
      usesGlobalTransition: true,
      transitionTiming: { entryReadyProgress: 0.2, holdProgress: 0.7 },
    });
    expect(defineTemplate(definition)).toMatchObject({ usesGlobalTransition: false });
  });

  it("derives editor summaries and runtime defaults from a Standard JSON Schema", async () => {
    const { defineTemplate } = await import("../src/visual-system/catalog/internal");
    const template = defineTemplate({
      id: "schemaMetric",
      schema: {
        type: "object",
        properties: {
          score: { type: "number", description: "Grounded score", default: 72 },
          label: { type: "string", default: "Health" },
          tone: { type: "string", enum: ["good", "bad"] as const },
        },
        required: ["score"] as const,
      },
      component: ({ variables }) => {
        const optionalLabel: string | undefined = variables.label;
        return createElement("b", null, variables.score, optionalLabel);
      },
    });

    expect(summarizeTemplateVariables(template.schema)).toEqual({
      score: { type: "number", description: "Grounded score", default: 72, required: true },
      label: { type: "string", default: "Health", required: false },
      tone: { type: "enum", options: ["good", "bad"], required: false },
    });
    expect(getTemplateDefaults(template.schema)).toEqual({ score: 72, label: "Health" });
    expect(template).toMatchObject({
      label: "schemaMetric",
      usesGlobalTextEffect: false,
    });
  });

  it("uses a Standard Schema validator without requiring Zod", async () => {
    const { defineTemplate, createRenderTemplateRegistry, createTemplateSceneValidator } = await import("../src/visual-system/catalog/internal");
    const template = defineTemplate({
      id: "standardMetric",
      schema: {
        "~standard": {
          version: 1 as const,
          vendor: "test",
          validate: (value: unknown) => typeof (value as { score?: unknown })?.score === "number"
            ? { value: value as { score: number } }
            : { issues: [{ message: "score must be a number" }] },
          jsonSchema: {
            input: () => ({
              type: "object",
              properties: { score: { type: "number" } },
              required: ["score"],
              additionalProperties: false,
            }),
            output: () => ({
              type: "object",
              properties: { score: { type: "number" } },
              required: ["score"],
              additionalProperties: false,
            }),
          },
        },
      },
      component: () => null,
    });
    const validate = createTemplateSceneValidator({ kit: createRenderTemplateRegistry({ templates: [template] }) });
    const context = { input: { input: "Score 72" }, previousScenes: [] };
    expect(() => validate({ id: "one", templateId: "standardMetric", variables: { score: "72" }, timing: { fixedDuration: 3 } }, context))
      .toThrow(/score must be a number/);
  });

  it("creates a server-only kit from metadata without React components", async () => {
    const api = await import("../src/visual-system/catalog/internal");
    expect(api.createRenderTemplateRegistry).toBeTypeOf("function");
    const metadata = {
      id: "customerMetric",
      label: "Customer Metric",
      usesGlobalTextEffect: false,
      usesGlobalTransition: false,
      usesGlobalBackgroundEffect: false,
      schema: {
        type: "object" as const,
        properties: { value: { type: "number" as const, default: 42 } },
        required: ["value"],
        additionalProperties: false,
      },
    };
    const kit = api.createServerTemplateRegistry({ templates: [metadata] });
    expect(kit.capabilities).toEqual({ templates: ["customerMetric"] });
    expect(kit.getTemplateMetadata("customerMetric")).toEqual(metadata);
    expect(kit.listTemplateMetadata()).toEqual([metadata]);
  });

  it("registers a customer template once and exposes matching planner capabilities", async () => {
    const api = await import("../src/visual-system/catalog/internal");

    expect(api.defineTemplate, "the public template-definition helper should exist").toBeTypeOf("function");
    expect(api.createRenderTemplateRegistry, "the shared player/planner kit should exist").toBeTypeOf("function");
    if (!api.defineTemplate || !api.createRenderTemplateRegistry) return;

    const customerMetric = api.defineTemplate({
      id: "customerMetric",
      label: "Customer Metric",
      description: "A metric template owned by the customer application.",
      jobs: ["proof"],
      register: "typography-led",
      useWhen: "A customer-owned metric is the central proof point.",
      schema: {
        type: "object",
        properties: { value: { type: "number", default: 42 } },
        required: ["value"],
        additionalProperties: false,
      },
      preferredDuration: 4,
      component: ({ variables }) => createElement("strong", null, String(variables.value)),
    });
    const kit = api.createRenderTemplateRegistry({ templates: [customerMetric] });

    expect(kit.getTemplate("customerMetric")).toBe(customerMetric);
    expect(kit.getTemplateMetadata("customerMetric")).toMatchObject({
      label: "Customer Metric",
      description: "A metric template owned by the customer application.",
    });
    expect(kit.templates).toEqual([customerMetric]);
    expect(kit.capabilities).toEqual({ templates: ["customerMetric"] });
    expect(() => api.createRenderTemplateRegistry({ templates: [customerMetric, customerMetric] }))
      .toThrow(/duplicate template id/i);
  });

  it("overlays customer render templates on defaults by id and appends new templates", async () => {
    const api = await import("../src/visual-system/catalog/internal");
    const template = (id: string, label: string) => api.defineTemplate({
      id,
      label,
      schema: EMPTY_SCHEMA,
      component: () => null,
    });
    const defaultAlpha = template("alpha", "Default alpha");
    const defaultBeta = template("beta", "Default beta");
    const customerAlpha = template("alpha", "Customer alpha");
    const customerGamma = template("gamma", "Customer gamma");
    const defaults = api.createRenderTemplateRegistry({ templates: [defaultAlpha, defaultBeta] });
    const customer = api.createRenderTemplateRegistry({ templates: [customerAlpha, customerGamma] });

    const overlaid = api.overlayTemplateRegistry(defaults, customer);

    expect(overlaid.templates).toEqual([customerAlpha, defaultBeta, customerGamma]);
    expect(overlaid.capabilities.templates).toEqual(["alpha", "beta", "gamma"]);
    expect(overlaid.getTemplate("alpha")).toBe(customerAlpha);
    expect(overlaid.getTemplateMetadata("alpha")?.label).toBe("Customer alpha");
  });

  it("overlays customer server metadata on defaults with the same ordering", async () => {
    const api = await import("../src/visual-system/catalog/internal");
    const metadata = (id: string, label: string) => ({
      id,
      label,
      usesGlobalTextEffect: false,
      usesGlobalTransition: false,
      usesGlobalBackgroundEffect: false,
      schema: EMPTY_SCHEMA,
    });
    const defaultAlpha = metadata("alpha", "Default alpha");
    const defaultBeta = metadata("beta", "Default beta");
    const customerAlpha = metadata("alpha", "Customer alpha");
    const customerGamma = metadata("gamma", "Customer gamma");
    const defaults = api.createServerTemplateRegistry({ templates: [defaultAlpha, defaultBeta] });
    const customer = api.createServerTemplateRegistry({ templates: [customerAlpha, customerGamma] });

    const overlaid = api.overlayServerTemplateRegistry(defaults, customer);

    expect(overlaid.listTemplateMetadata()).toEqual([customerAlpha, defaultBeta, customerGamma]);
    expect(overlaid.capabilities.templates).toEqual(["alpha", "beta", "gamma"]);
    expect(overlaid.getTemplateMetadata("alpha")).toBe(customerAlpha);
  });
});
