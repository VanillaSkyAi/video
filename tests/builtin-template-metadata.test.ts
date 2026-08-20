import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BUILTIN_TEMPLATE_CATALOG,
  createBuiltinTemplateSystemPrompt,
} from "../src/visual-system/catalog/catalog";

const STABLE_TEMPLATE_IDS = [
  "media", "reaction", "confetti", "emojiBurst", "bigNumber", "barChart",
  "progressRing", "phoneMockup", "webMockup", "codeEditor", "terminal", "tweet",
  "notification", "chatMessenger", "chatWhatsapp", "milestone", "reviewStack",
  "testimonial", "incomingCall", "brandMessage", "promptInput", "beforeAfter",
  "tripleStats", "problemSolution", "cardList", "steps", "ctaLogo", "ctaMedia",
] as const;

const BROWSE_FAMILIES = new Set([
  "Media & motion",
  "Data & metrics",
  "Product showcase",
  "Social & messaging",
  "Explainers",
  "Calls to action",
]);

function expectValidDefault(
  templateId: string,
  fieldName: string,
  property: (typeof BUILTIN_TEMPLATE_CATALOG)[number]["schema"]["properties"][string],
): void {
  if (property.default === undefined) return;
  const value = property.default;
  const context = `${templateId}.${fieldName}`;
  if (property.type === "string") expect(typeof value, context).toBe("string");
  if (property.type === "number" || property.type === "integer") {
    expect(typeof value, context).toBe("number");
    expect(Number.isFinite(value), context).toBe(true);
    if (property.type === "integer") expect(Number.isInteger(value), context).toBe(true);
    if (property.minimum != null) expect(value as number, context).toBeGreaterThanOrEqual(property.minimum);
    if (property.maximum != null) expect(value as number, context).toBeLessThanOrEqual(property.maximum);
  }
  if (property.type === "boolean") expect(typeof value, context).toBe("boolean");
  if (property.type === "array") {
    expect(Array.isArray(value), context).toBe(true);
    if (property.minItems != null) expect((value as unknown[]).length, context).toBeGreaterThanOrEqual(property.minItems);
    if (property.maxItems != null) expect((value as unknown[]).length, context).toBeLessThanOrEqual(property.maxItems);
  }
  if (property.enum) expect(property.enum, context).toContain(value);
}

describe("built-in template metadata", () => {
  it("keeps stable IDs and complete human and adaptive-timing metadata", () => {
    expect(BUILTIN_TEMPLATE_CATALOG.map(({ id }) => id)).toEqual(STABLE_TEMPLATE_IDS);
    expect(new Set(BUILTIN_TEMPLATE_CATALOG.map(({ label }) => label)).size).toBe(28);

    for (const template of BUILTIN_TEMPLATE_CATALOG) {
      expect(template.label?.trim(), `${template.id}.label`).toBeTruthy();
      expect(template.description?.trim(), `${template.id}.description`).toBeTruthy();
      expect(BROWSE_FAMILIES.has(template.family ?? ""), `${template.id}.family`).toBe(true);
      expect(template.jobs?.length, `${template.id}.jobs`).toBeGreaterThan(0);
      expect(template.register, `${template.id}.register`).toBeTruthy();
      expect(template.useWhen?.trim(), `${template.id}.useWhen`).toBeTruthy();
      expect(template.avoidWhen?.trim(), `${template.id}.avoidWhen`).toBeTruthy();
      expect(template.useWhen, `${template.id}.useWhen`).not.toMatch(/\bavoid\b/i);
      expect(template.minDuration, `${template.id}.minDuration`).toBeGreaterThan(0);
      expect(template.preferredDuration, `${template.id}.preferredDuration`).toBeGreaterThanOrEqual(template.minDuration!);
      expect(template.timing?.contentFields.length, `${template.id}.timing.contentFields`).toBeGreaterThan(0);
      expect(["words", "characters", "items"], `${template.id}.timing.contentUnit`).toContain(template.timing?.contentUnit);
      for (const field of template.timing?.contentFields ?? []) {
        expect(template.schema.properties, `${template.id}.timing field ${field}`).toHaveProperty(field);
      }
      expect(JSON.parse(JSON.stringify(template)), `${template.id} serializability`).toEqual(template);
    }
  });

  it("keeps schema-owned property defaults type-valid for editor and render smoke fixtures", () => {
    for (const template of BUILTIN_TEMPLATE_CATALOG) {
      expect(template, template.id).not.toHaveProperty("defaults");
      expect(template, template.id).not.toHaveProperty("defaultVariables");
      for (const required of template.schema.required ?? []) {
        expect(template.schema.properties[required]?.default, `${template.id}.${required}`).not.toBeUndefined();
      }
      for (const [fieldName, property] of Object.entries(template.schema.properties)) {
        expectValidDefault(template.id, fieldName, property);
      }
    }
  });

  it("uses precise closer and payoff jobs", () => {
    const byId = new Map(BUILTIN_TEMPLATE_CATALOG.map((template) => [template.id, template]));
    expect(byId.get("ctaLogo")?.jobs).toEqual(["ask"]);
    expect(byId.get("ctaMedia")?.jobs).toEqual(["ask"]);
    expect(byId.get("ctaLogo")?.minDuration).toBe(3);
    expect(byId.get("ctaMedia")?.minDuration).toBe(3);
    expect(byId.get("confetti")?.jobs).toEqual(["payoff", "punctuation"]);
    expect(byId.get("emojiBurst")?.jobs).toEqual(["payoff", "punctuation"]);
    expect(byId.get("reaction")?.jobs).toEqual(["payoff", "punctuation"]);
    expect(byId.get("brandMessage")?.jobs).toEqual(["claim"]);
  });

  it("requires resolved media and grounded actions for media-dependent payoff and closer templates", () => {
    const byId = new Map(BUILTIN_TEMPLATE_CATALOG.map((template) => [template.id, template]));
    expect(byId.get("reaction")?.schema["x-vanillasky"]?.requiredAnyOf).toEqual([["mediaUrl"]]);
    expect(byId.get("ctaLogo")?.schema["x-vanillasky"]?.requiredAnyOf).toEqual([["cta", "url"]]);
    expect(byId.get("ctaMedia")?.schema["x-vanillasky"]?.requiredAnyOf).toEqual([
      ["cta", "url"],
      ["mediaUrl"],
    ]);
  });

  it("ships real three-message exchanges and the verified review reading duration", () => {
    const byId = new Map(BUILTIN_TEMPLATE_CATALOG.map((template) => [template.id, template]));
    for (const id of ["chatMessenger", "chatWhatsapp"] as const) {
      const schema = byId.get(id)?.schema;
      expect(schema?.properties.msg1.default).not.toMatch(/\|out$/);
      expect(schema?.properties.msg2.default).toMatch(/\|out$/);
      expect(schema?.properties.msg3.default).not.toMatch(/\|out$/);
      expect(schema?.properties.msg2.title).toMatch(/sent/i);
      expect(schema?.properties.msg2.description).toMatch(/right\/sent by default/i);
    }
    expect(byId.get("reviewStack")?.minDuration).toBe(4);
    expect(byId.get("reviewStack")?.preferredDuration).toBe(6);
    expect(byId.get("reviewStack")?.timing).toEqual({
      contentFields: [
        "review1Title", "review1Body", "review2Title", "review2Body", "review3Title", "review3Body",
      ],
      contentUnit: "words",
    });
    expect(byId.get("reviewStack")?.useWhen).toMatch(/three grounded review excerpts/i);
    expect(byId.get("reviewStack")?.avoidWhen).toMatch(/fewer than three/i);
    expect(byId.get("reviewStack")?.avoidWhen).not.toMatch(/attribution/i);
  });

  it("describes tweet, emoji burst, and bar chart as they render", () => {
    const byId = new Map(BUILTIN_TEMPLATE_CATALOG.map((template) => [template.id, template]));
    expect(`${byId.get("tweet")?.description} ${byId.get("tweet")?.useWhen}`).not.toMatch(/image grid|tweetImage/i);
    expect(byId.get("emojiBurst")?.description).toMatch(/fixed|hearts|rockets/i);
    expect(byId.get("barChart")?.description).toMatch(/labeled bars/i);
    expect(byId.get("barChart")?.avoidWhen).toMatch(/labels|exact values/i);
  });

  it("keeps generated catalog and source registry metadata in parity", () => {
    for (const template of BUILTIN_TEMPLATE_CATALOG) {
      const registry = JSON.parse(readFileSync(
        join(process.cwd(), `registry/items/${template.id}.json`),
        "utf8",
      ));
      const { layer: _layer, tier: _tier, ...registryMetadata } = registry.meta.vanillasky;
      expect(registry.title, template.id).toBe(template.label);
      expect(registry.description, template.id).toBe(template.description);
      expect({ id: registry.name, ...registryMetadata }, template.id).toEqual(template);
    }
  });

  it("covers every built-in in the model-facing catalog with selection guidance", () => {
    const prompt = createBuiltinTemplateSystemPrompt();
    const plannerCatalog = JSON.parse(prompt.trim().split("\n").at(-1) ?? "[]");
    expect(plannerCatalog.map(({ id }: { id: string }) => id)).toEqual(STABLE_TEMPLATE_IDS);
    for (const template of plannerCatalog) {
      expect(template.jobs?.length, `${template.id}.jobs`).toBeGreaterThan(0);
      expect(template.use, `${template.id}.use`).toBeTruthy();
      expect(template, `${template.id}.avoid`).not.toHaveProperty("avoid");
    }
  });
});
