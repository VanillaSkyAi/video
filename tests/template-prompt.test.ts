import { describe, expect, it } from "vitest";
import { createElement } from "react";

describe("template-aware open prompt", () => {
  it("describes exactly the customer-owned kit without exposing renderer source", async () => {
    const api = await import("../src/visual-system/catalog/internal");
    expect(api.createTemplateSystemPrompt).toBeTypeOf("function");

    const customerMetric = api.defineTemplate({
      id: "customerMetric",
      useWhen: "A grounded customer metric is the proof point.",
      schema: {
        type: "object",
        properties: { value: { type: "number", default: 0 } },
        required: ["value"],
        additionalProperties: false,
      },
      component: ({ variables }) => createElement("span", null, String(variables.value)),
    });
    const kit = api.createRenderTemplateRegistry({ templates: [customerMetric] });

    let prompt: string | undefined;
    let cause: unknown;
    try {
      prompt = api.createTemplateSystemPrompt({ kit, basePrompt: "BASE MOTION RULES" });
    } catch (error) {
      cause = error;
    }

    expect(cause, "the prompt helper should accept the same kit as the player").toBeUndefined();
    if (!prompt) return;
    expect(prompt).toContain("BASE MOTION RULES");
    expect(prompt).toContain("Wire format: newline-delimited JSON");
    expect(prompt).toContain("End explicitly with plan.complete");
    expect(prompt).toContain('"id":"customerMetric"');
    expect(prompt).toContain('"value"');
    expect(prompt).toContain("Only use template IDs from this catalog");
    expect(prompt).not.toContain('"id":"notification"');
    expect(prompt).not.toContain('"id":"bigNumber"');
    expect(prompt).not.toContain('"id":"cardList"');
    expect(prompt).not.toContain('"id":"steps"');
    expect(prompt).not.toContain('"id":"tripleStats"');
    expect(prompt).not.toContain('"id":"ctaMedia"');
    expect(prompt).not.toContain('"id":"reaction"');
    expect(prompt).not.toContain("React.FC");
    expect(prompt).not.toContain("componentSource");
  });

  it("only emits specialized prose for capabilities installed in the kit", async () => {
    const { createTemplateSystemPrompt } = await import("../src/visual-system/catalog/internal");
    const { loadAcceptanceKit } = await import("../scripts/acceptance/catalog");
    const prompt = createTemplateSystemPrompt({ kit: loadAcceptanceKit(["steps"]) });

    expect(prompt).toContain("steps");
    expect(prompt).not.toContain("cardList");
    expect(prompt).not.toContain("tripleStats");
    expect(prompt).not.toContain("ctaMedia");
    expect(prompt).not.toContain("reaction");
  });

  it("preserves planner-relevant schema constraints without editor metadata", async () => {
    const api = await import("../src/visual-system/catalog/internal");
    const template = api.defineTemplate({
      id: "score",
      useWhen: "Show one bounded score.",
      schema: {
        type: "object",
        properties: { value: { type: "number", minimum: 0, maximum: 100 } },
        required: ["value"],
        additionalProperties: false,
      } as const,
      component: () => null,
    });
    const prompt = api.createTemplateSystemPrompt({
      kit: api.createRenderTemplateRegistry({ templates: [template] }),
    });

    expect(prompt).toContain('"schema":{"type":"object"');
    expect(prompt).toContain('"minimum":0');
    expect(prompt).toContain('"maximum":100');
    expect(prompt).not.toContain('"description"');
    expect(prompt).not.toContain('"default"');
    expect(prompt).not.toContain('"examples"');
  });

  it("serializes conditional presence gates with supplied media only", async () => {
    const api = await import("../src/visual-system/catalog/internal");
    const template = api.defineTemplate({
      id: "mediaCloser",
      useWhen: "Close with a resolved visual and grounded action.",
      schema: {
        type: "object",
        properties: {
          cta: { type: "string" },
          url: { type: "string" },
          mediaKeyword: { type: "string", format: "stock-media-keyword" },
          mediaUrl: { type: "string", format: "uri" },
        },
        "x-vanillasky": {
          requiredAnyOf: [["cta", "url"], ["mediaUrl"]],
        },
      } as const,
      component: () => null,
    });
    const prompt = api.createTemplateSystemPrompt({
      kit: api.createRenderTemplateRegistry({ templates: [template] }),
    });
    const catalog = JSON.parse(prompt.trim().split("\n").at(-1) ?? "[]");

    expect(prompt).toContain("requiredAnyOf");
    expect(catalog[0].requiredAnyOf).toEqual([["cta", "url"], ["mediaUrl"]]);
    expect(catalog[0].variables).not.toHaveProperty("mediaKeyword");
    expect(catalog[0].variables).toHaveProperty("mediaUrl");
  });

  it("keeps the complete bundled catalog compact enough for low-latency planning", async () => {
    const { createTemplateSystemPrompt } = await import("../src/visual-system/catalog/internal");
    const { loadAcceptanceKit } = await import("../scripts/acceptance/catalog");
    const prompt = createTemplateSystemPrompt({ kit: loadAcceptanceKit() });

    expect(prompt.length).toBeLessThan(18_000);
    expect(prompt).toContain('"id":"bigNumber"');
    expect(prompt).toContain('"value":"number!"');
    expect(prompt).toContain("mediaTreatment:enum(");
    expect(prompt).not.toContain('"mediaKeyword"');
    expect(prompt).toContain("Never invent peer values");
    expect(prompt).toContain("Do not repeat the same list, metric, or claim");
    expect(prompt).toContain("once a fact is visible, treat it as unavailable");
    expect(prompt).toContain("Keep related entries adjacent");
    expect(prompt).toContain("Ordering never permits merging or omitting entries");
    expect(prompt).toContain("Do not infer that something is scheduled, ready, triggered");
    expect(prompt).toContain("cardList and steps each need two or three unused facts");
    expect(prompt).toContain("Never invent a fact to fill a collection");
    expect(prompt).toContain('"items":"string-array[2..3]!"');
    expect(prompt).toContain('"steps":"string-array[2..3]!"');
    expect(prompt).toContain('"itemEmojis":"string-array[0..3]"');
    expect(prompt).toContain("Never turn a role, relationship, or summary into speech");
    expect(prompt).toContain("mediaType=gradient");
    expect(prompt).toContain("emit actual JSON arrays");
    expect(prompt).toContain("Do not use pipes or newlines as list delimiters");
    expect(prompt).toContain("Keep list labels to 1–3 words");
    expect(prompt).toContain("Keep step labels to 1–2 words and at most 18 characters");
    expect(prompt).toContain("media, ctaMedia, and reaction are forbidden as the first generated body template");

    const catalog = JSON.parse(prompt.trim().split("\n").at(-1) ?? "[]");
    for (const template of catalog) {
      expect(template.variables).not.toHaveProperty("mediaKeyword");
      if (template.schema?.properties) {
        expect(template.schema.properties).not.toHaveProperty("mediaKeyword");
      }
    }
    const reaction = catalog.find(({ id }: { id: string }) => id === "reaction");
    expect(reaction?.variables).toHaveProperty("reactionTag");
    expect(reaction?.variables).toHaveProperty("mediaUrl");
    expect(reaction?.requiredAnyOf).toEqual([["mediaUrl"]]);
    const bigNumber = catalog.find(({ id }: { id: string }) => id === "bigNumber");
    expect(bigNumber?.media).toBe(true);
    expect(bigNumber?.variables).not.toHaveProperty("mediaUrl");
  });

  it("exposes bounded media intent only when the host configures a resolver", async () => {
    const { createTemplateSystemPrompt } = await import("../src/visual-system/catalog/internal");
    const { loadAcceptanceKit } = await import("../scripts/acceptance/catalog");
    const kit = loadAcceptanceKit(["bigNumber", "media", "confetti", "emojiBurst"]);

    const withoutResolver = createTemplateSystemPrompt({ kit });
    const withResolver = createTemplateSystemPrompt({ kit, mediaResolverAvailable: true });
    const catalog = JSON.parse(withResolver.trim().split("\n").at(-1) ?? "[]");

    expect(withoutResolver).not.toContain('"mediaKeyword"');
    expect(withResolver).toContain('"mediaKeyword":"string{2..80}"');
    expect(withResolver).toContain("Prefer a relevant resolved image or video background on later media-capable scenes");
    expect(withResolver).not.toContain("Never expose a loading placeholder or unresolved media keyword");
    expect(withResolver).toContain("The host removes mediaKeyword before the scene reaches the browser");
    expect(withResolver).not.toContain('{"type":"asset.patch","sceneId":"stable-id"');
    expect(withResolver).toContain("End with a grounded payoff using media, emojiBurst, or confetti");
    expect(withResolver).toContain('"placement":"closer"');
    expect(withResolver).toContain("Emit exactly one closer immediately after the first playable body scene");
    expect(withResolver).toContain("answer the story's so-what");
    expect(withResolver).toContain("6–12 words");
    expect(withResolver).toContain("The runtime holds that closer and appends it last");
    expect(catalog.find(({ id }: { id: string }) => id === "media")?.jobs).toContain("payoff");
  });

  it("keeps structured facts and the closer in content-fit scenes", async () => {
    const { createTemplateSystemPrompt } = await import("../src/visual-system/catalog/internal");
    const { loadAcceptanceKit } = await import("../scripts/acceptance/catalog");
    const prompt = createTemplateSystemPrompt({
      kit: loadAcceptanceKit(["brandMessage", "steps", "ctaLogo"]),
    });

    expect(prompt).toContain(
      "Do not compress a list, sequence, metric set, or comparison into a general-purpose prose field",
    );
    expect(prompt).toContain(
      "keep that concise action closer as its own final scene",
    );
    expect(prompt).toContain(
      "When a grounded CTA or URL is supplied and the catalog contains jobs:[ask], emit that final closer",
    );
    expect(prompt).not.toContain("brand stamp may stand alone");
    expect(prompt).toContain("A brand name may accompany the action but never qualifies as an ask by itself");
  });
});
