import { describe, expect, it, vi } from "vitest";

import { decodeVideoSse } from "../src/protocol/sse";
import { createRenderTemplateRegistry, createServerTemplateRegistry, defineTemplate } from "../src/visual-system/catalog/internal";

const kit = createServerTemplateRegistry({
  templates: [{
    id: "metric",
    label: "Metric",
    schema: {
      type: "object",
      properties: { value: { type: "number", default: 1 } },
      required: ["value"],
      additionalProperties: false,
    },
    usesGlobalTextEffect: false,
    usesGlobalTransition: false,
    usesGlobalBackgroundEffect: false,
  }],
});

const mediaKit = createServerTemplateRegistry({
  templates: [{
    id: "image",
    label: "Image",
    schema: {
      type: "object",
      properties: { imageUrl: { type: "string", format: "uri" } },
      required: ["imageUrl"],
      additionalProperties: false,
    },
    usesGlobalTextEffect: false,
    usesGlobalTransition: false,
    usesGlobalBackgroundEffect: false,
  }],
});

const incompatibleResolverKit = createServerTemplateRegistry({
  templates: [{
    id: "incompatibleMedia",
    jobs: ["claim"],
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        mediaKeyword: { type: "string", format: "stock-media-keyword" },
        mediaUrl: { type: "string", format: "uri", default: "" },
        mediaType: { type: "string", enum: ["auto"] },
      },
      required: ["title"],
      additionalProperties: false,
      "x-vanillasky": { allowsStockMedia: true },
    },
    usesGlobalTextEffect: false,
    usesGlobalTransition: false,
    usesGlobalBackgroundEffect: false,
  }],
});

const quoteKit = createServerTemplateRegistry({
  templates: createRenderTemplateRegistry({ templates: [defineTemplate({
    id: "quote",
    useWhen: "Show an exact grounded quote.",
    schema: {
      type: "object",
      properties: {
        quote: { type: "string", format: "grounded-quote" },
        secondQuote: { type: "string", format: "grounded-quote" },
      },
      required: ["quote"],
      additionalProperties: false,
    } as const,
    component: () => null,
  })] }).listTemplateMetadata(),
});

const screenshotKit = createServerTemplateRegistry({
  templates: createRenderTemplateRegistry({ templates: [defineTemplate({
    id: "screenshot",
    useWhen: "Show a supplied product screenshot.",
    schema: {
      type: "object",
      properties: { imageUrl: { type: "string", format: "supplied-image" } },
      additionalProperties: false,
    } as const,
    component: () => null,
  })] }).listTemplateMetadata(),
});

const pacingKit = createServerTemplateRegistry({
  templates: [
    {
      id: "body",
      jobs: ["claim"],
      schema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
        additionalProperties: false,
      },
      minDuration: 2,
      preferredDuration: 5,
      timing: { contentFields: ["message"], contentUnit: "words" },
      usesGlobalTextEffect: false,
      usesGlobalTransition: false,
      usesGlobalBackgroundEffect: false,
    },
    {
      id: "close",
      jobs: ["ask"],
      schema: {
        type: "object",
        properties: { cta: { type: "string" } },
        required: ["cta"],
        additionalProperties: false,
      },
      minDuration: 3,
      preferredDuration: 4,
      timing: { contentFields: ["cta"], contentUnit: "words" },
      usesGlobalTextEffect: false,
      usesGlobalTransition: false,
      usesGlobalBackgroundEffect: false,
    },
    {
      id: "payoff",
      jobs: ["payoff"],
      schema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
        additionalProperties: false,
      },
      minDuration: 2,
      preferredDuration: 3,
      timing: { contentFields: ["message"], contentUnit: "words" },
      usesGlobalTextEffect: false,
      usesGlobalTransition: false,
      usesGlobalBackgroundEffect: false,
    },
  ],
});

describe("createVideoHandler", () => {
  it("requires an explicit authorization policy before constructing a public handler", async () => {
    const { createVideoHandler } = await import("../src/server");
    expect(() => createVideoHandler({
      heartbeatMs: false,
      streamText: async function* () { yield '{"type":"plan.complete"}\n'; },
    } as never)).toThrow("createVideoHandler requires authorize or authorize: \"none\"");
  });

  it("keeps the required built-in nine-word CTA readable after a 29-second body request", async () => {
    const { createVideoHandler } = await import("../src/server");
    const handler = createVideoHandler({
      authorize: "none",
      heartbeatMs: false,
      streamText: async function* () {
        yield '{"type":"scene.add","scene":{"id":"body-1","templateId":"bigNumber","variables":{"texts":"Revenue","value":42,"label":"million"},"timing":{"fixedDuration":29}}}\n';
        yield '{"type":"scene.add","scene":{"id":"close-1","templateId":"ctaLogo","variables":{"url":"openai.com/releases","cta":"Read every new OpenAI release note with your team"},"timing":{"fixedDuration":4}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-built-in-readable-closer",
        input: {
          input: "Revenue reached 42 million. Acme: Read every new OpenAI release note with your team at openai.com/releases.",
          brand: { name: "Acme" },
          maxDurationSec: 30,
        },
        capabilities: { templates: ["bigNumber", "ctaLogo"] },
      }),
    }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);

    expect(events.filter(({ type }) => type === "scene.add")).toMatchObject([
      { data: { scene: { id: "supplied-opening", timing: { startTime: 0, endTime: 3, fixedDuration: 3 } } } },
      { data: { scene: { id: "body-1", timing: { startTime: 3, endTime: 26.5, fixedDuration: 23.5 } } } },
      { data: { scene: { id: "close-1", timing: { startTime: 26.5, endTime: 30, fixedDuration: 3.5 } } } },
    ]);
    expect(events.filter(({ type }) => type === "response.warning")).toMatchObject([
      { data: { warning: { code: "scene_duration_adjusted", sceneId: "body-1" } } },
      { data: { warning: { code: "scene_duration_adjusted", sceneId: "close-1" } } },
    ]);
    expect(events.at(-1)).toMatchObject({ type: "response.complete" });
  });

  it("reserves a readable final ask instead of clipping it below its minimum", async () => {
    const { createVideoHandler } = await import("../src/server");
    let systemPrompt = "";
    const handler = createVideoHandler({
      authorize: "none",
      templates: pacingKit,
      heartbeatMs: false,
      streamText: async function* (context) {
        systemPrompt = context.systemPrompt;
        yield '{"type":"scene.add","scene":{"id":"body-1","templateId":"body","variables":{"message":"A detailed release summary"},"timing":{"fixedDuration":29}}}\n';
        yield '{"type":"scene.add","scene":{"id":"close-1","templateId":"close","variables":{"cta":"Read all of the release notes today"},"timing":{"fixedDuration":4}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-readable-closer",
        input: { input: "A grounded release summary with a final action.", maxDurationSec: 30 },
        capabilities: { templates: ["body", "close"] },
      }),
    }));
    expect(response.status).toBe(200);
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);

    expect(events.map(({ type }) => type)).toEqual([
      "response.start",
      "scene.add",
      "response.warning",
      "scene.add",
      "scene.add",
      "response.complete",
    ]);
    expect(events[2]).toMatchObject({
      type: "response.warning",
      data: {
        warning: {
          code: "scene_duration_adjusted",
          category: "readability",
          sceneId: "body-1",
          recoverable: true,
        },
      },
    });
    expect(events.filter(({ type }) => type === "scene.add")).toMatchObject([
      { data: { scene: { id: "supplied-opening", timing: { startTime: 0, endTime: 3, fixedDuration: 3 } } } },
      { data: { scene: { id: "body-1", timing: { startTime: 3, endTime: 26, fixedDuration: 23 } } } },
      { data: { scene: { id: "close-1", timing: { startTime: 26, endTime: 30, fixedDuration: 4 } } } },
    ]);
    expect(systemPrompt).toContain('"variables":{"message":"string!"}');
    expect(systemPrompt).not.toContain('"contentFields"');
    expect(systemPrompt).toContain("Reserve at least 3 seconds for the final closer");
  });

  it("allocates a supplied opening within the same deterministic closer budget", async () => {
    const { createVideoHandler } = await import("../src/server");
    const handler = createVideoHandler({
      authorize: "none",
      templates: pacingKit,
      heartbeatMs: false,
      streamText: async function* () {
        yield '{"type":"scene.add","scene":{"id":"close-1","templateId":"close","variables":{"cta":"Read the release notes"},"timing":{"fixedDuration":4}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-opening-allocation",
        input: {
          input: "A grounded update.",
          opening: "Your update",
          maxDurationSec: 5,
          brand: { name: "Acme" },
        },
        capabilities: { templates: ["media", "close"] },
      }),
    }));
    expect(response.status).toBe(200);
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);

    expect(events.filter(({ type }) => type === "scene.add")).toMatchObject([
      { data: { scene: { id: "supplied-opening", timing: { startTime: 0, endTime: 1.5, fixedDuration: 1.5 } } } },
      { data: { scene: { id: "close-1", timing: { startTime: 1.5, endTime: 5, fixedDuration: 3.5 } } } },
    ]);
    expect(events.filter(({ type }) => type === "response.warning")).toHaveLength(2);
  });

  it("continues consuming after an over-budget body scene so a later ask can land", async () => {
    const { createVideoHandler } = await import("../src/server");
    const handler = createVideoHandler({
      authorize: "none",
      templates: pacingKit,
      heartbeatMs: false,
      streamText: async function* () {
        yield '{"type":"scene.add","scene":{"id":"body-1","templateId":"body","variables":{"message":"Primary grounded point"},"timing":{"fixedDuration":7}}}\n';
        yield '{"type":"scene.add","scene":{"id":"body-2","templateId":"body","variables":{"message":"Secondary grounded point"},"timing":{"fixedDuration":2}}}\n';
        yield '{"type":"scene.add","scene":{"id":"close-1","templateId":"close","variables":{"cta":"Read release notes"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"scene.add","scene":{"id":"body-late","templateId":"body","variables":{"message":"This must not follow the ask"},"timing":{"fixedDuration":2}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-continue-to-ask",
        input: { input: "Two grounded points and an action.", maxDurationSec: 10 },
        capabilities: { templates: ["body", "close"] },
      }),
    }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);

    expect(events.filter(({ type }) => type === "scene.add").map((event) =>
      event.type === "scene.add" ? event.data.scene.id : ""
    )).toEqual(["supplied-opening", "body-1", "close-1"]);
    expect(events.filter(({ type }) => type === "response.warning")).toMatchObject([
      { data: { warning: { code: "scene_duration_adjusted", sceneId: "body-1" } } },
      { data: { warning: { code: "scene_omitted_for_closer", sceneId: "body-2" } } },
      { data: { warning: { code: "scene_omitted_for_closer", sceneId: "body-late" } } },
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "response.complete",
      data: {
        finishReason: "length",
        snapshot: { scenes: [{ id: "supplied-opening" }, { id: "body-1" }, { id: "close-1" }] },
      },
    });
  });

  it("holds an explicitly placed payoff emitted early and appends it after every body scene", async () => {
    const { createVideoHandler } = await import("../src/server");
    const handler = createVideoHandler({
      authorize: "none",
      templates: pacingKit,
      heartbeatMs: false,
      streamText: async function* () {
        yield '{"type":"scene.add","scene":{"id":"body-1","templateId":"body","variables":{"message":"Primary grounded point"},"timing":{"fixedDuration":4}}}\n';
        yield '{"type":"scene.add","placement":"closer","scene":{"id":"payoff-1","templateId":"payoff","variables":{"message":"The work now moves faster everywhere"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"scene.add","scene":{"id":"body-2","templateId":"body","variables":{"message":"This detailed secondary grounded point contains enough words that it cannot displace the reserved final payoff"},"timing":{"fixedDuration":5}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-explicit-payoff-closer",
        input: { input: "Two grounded points whose payoff is that work now moves faster everywhere.", maxDurationSec: 10 },
        capabilities: { templates: ["body", "payoff"] },
      }),
    }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);

    expect(events.filter(({ type }) => type === "scene.add").map((event) =>
      event.type === "scene.add" ? event.data.scene.id : ""
    )).toEqual(["supplied-opening", "body-1", "payoff-1"]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "response.warning",
      data: { warning: expect.objectContaining({ code: "scene_omitted_unreadable", sceneId: "body-2" }) },
    }));
    expect(events.at(-1)).toMatchObject({
      type: "response.complete",
      data: {
        snapshot: {
          scenes: [{ id: "supplied-opening" }, { id: "body-1" }, { id: "payoff-1", templateId: "payoff" }],
        },
      },
    });
    expect(events.at(-1)?.data).not.toHaveProperty("placement");
  });

  it("appends a reserved payoff to the playable snapshot when the provider fails late", async () => {
    const { createVideoHandler } = await import("../src/server");
    const handler = createVideoHandler({
      authorize: "none",
      templates: pacingKit,
      heartbeatMs: false,
      streamText: async function* () {
        yield '{"type":"scene.add","scene":{"id":"body-1","templateId":"body","variables":{"message":"Primary grounded point"},"timing":{"fixedDuration":4}}}\n';
        yield '{"type":"scene.add","placement":"closer","scene":{"id":"payoff-1","templateId":"payoff","variables":{"message":"The work now moves faster everywhere"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"scene.add","scene":{"id":"body-2","templateId":"body","variables":{"message":"Secondary grounded point"},"timing":{"fixedDuration":4}}}\n';
        throw new Error("The model provider timed out");
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-late-provider-failure",
        input: { input: "Two grounded points whose payoff is that work now moves faster everywhere.", maxDurationSec: 15 },
        capabilities: { templates: ["body", "payoff"] },
      }),
    }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);

    expect(events.filter(({ type }) => type === "scene.add").map((event) =>
      event.type === "scene.add" ? event.data.scene.id : ""
    )).toEqual(["supplied-opening", "body-1", "body-2", "payoff-1"]);
    expect(events.at(-1)).toMatchObject({
      type: "response.error",
      data: {
        terminal: true,
        snapshot: {
          scenes: [
            { id: "supplied-opening" },
            { id: "body-1" },
            { id: "body-2" },
            { id: "payoff-1", templateId: "payoff" },
          ],
        },
      },
    });
  });

  it("marks a standard handler plan partial when it completes without a closer", async () => {
    const { createVideoHandler } = await import("../src/server");
    const handler = createVideoHandler({
      authorize: "none",
      templates: pacingKit,
      heartbeatMs: false,
      streamText: async function* () {
        yield '{"type":"scene.add","scene":{"id":"body-1","templateId":"body","variables":{"message":"Primary grounded point"},"timing":{"fixedDuration":4}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-missing-closer",
        input: { input: "One grounded point." },
        capabilities: { templates: ["body", "payoff"] },
      }),
    }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);

    expect(events).toContainEqual(expect.objectContaining({
      type: "response.warning",
      data: { warning: expect.objectContaining({ code: "plan_missing_closer", category: "provider" }) },
    }));
    expect(events.at(-1)).toMatchObject({
      type: "response.complete",
      data: { finishReason: "other" },
    });
  });

  it("rejects a body-only template explicitly placed as the closer", async () => {
    const { createVideoHandler } = await import("../src/server");
    const handler = createVideoHandler({
      authorize: "none",
      templates: pacingKit,
      heartbeatMs: false,
      streamText: async function* () {
        yield '{"type":"scene.add","scene":{"id":"body-1","templateId":"body","variables":{"message":"Primary grounded point"},"timing":{"fixedDuration":4}}}\n';
        yield '{"type":"scene.add","placement":"closer","scene":{"id":"bad-ending","templateId":"body","variables":{"message":"Another body point"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-body-as-closer",
        input: { input: "Two grounded body points." },
        capabilities: { templates: ["body", "payoff"] },
      }),
    }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);

    expect(events.filter(({ type }) => type === "scene.add").map((event) =>
      event.type === "scene.add" ? event.data.scene.id : ""
    )).toEqual(["supplied-opening", "body-1"]);
    expect(events).toContainEqual(expect.objectContaining({
      type: "response.error",
      data: expect.objectContaining({
        error: expect.objectContaining({ code: "invalid_generated_part", recoverable: true }),
      }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "response.warning",
      data: { warning: expect.objectContaining({ code: "plan_missing_closer" }) },
    }));
  });

  it("uses the trusted built-in metadata and validation when no registry is configured", async () => {
    const { createVideoHandler } = await import("../src/server");
    let systemPrompt = "";
    const handler = createVideoHandler({
      authorize: "none",
      heartbeatMs: false,
      streamText: async function* (context) {
        systemPrompt = context.systemPrompt;
        yield '{"type":"scene.add","scene":{"id":"proof","templateId":"bigNumber","variables":{"texts":"Revenue","value":42,"label":"million"},"timing":{"fixedDuration":4}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-defaults",
        input: { input: "Revenue reached 42 million." },
      }),
    }));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(systemPrompt).toContain('"id":"bigNumber"');
    expect(body).toContain('"templateId":"bigNumber"');
    expect(body).toContain('"type":"response.complete"');
  });

  it("warns when a bar chart mixes values on a misleading scale", async () => {
    const { createVideoHandler } = await import("../src/server");
    const handler = createVideoHandler({
      authorize: "none",
      heartbeatMs: false,
      streamText: async function* () {
        yield '{"type":"scene.add","scene":{"id":"mixed-scale","templateId":"barChart","variables":{"texts":"Mixed units","bars":[{"label":"Percent","value":4.1},{"label":"Milliseconds","value":200}]} ,"timing":{"fixedDuration":5}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-chart-scale",
        input: { input: "Percent is 4.1 and latency is 200 milliseconds." },
        capabilities: { templates: ["barChart"] },
      }),
    }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);
    expect(events).toContainEqual(expect.objectContaining({
      type: "response.warning",
      data: { warning: expect.objectContaining({ code: "chart_scale_imbalance", sceneId: "mixed-scale" }) },
    }));
    expect(events.at(-1)).toMatchObject({ type: "response.complete" });
  });

  it("composes the kit prompt, capabilities, validator, and app-owned text provider", async () => {
    const api = await import("../src/server");
    expect(api.createVideoHandler).toBeTypeOf("function");

    let providerContext: { systemPrompt: string; userPrompt: string; signal: AbortSignal } | undefined;
    const authorize = vi.fn(() => true);
    const handler = api.createVideoHandler!({
      templates: kit,
      authorize,
      heartbeatMs: false,
      streamText: async function* (context) {
        providerContext = context;
        yield '{"type":"scene.add","scene":{"id":"proof","templateId":"metric","variables":{"value":42},"timing":{"fixedDuration":4}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/motion", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-app",
        input: { input: "Revenue reached 42." },
        capabilities: { templates: ["metric", "unknown"] },
      }),
    }));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(authorize).toHaveBeenCalledOnce();
    expect(providerContext?.systemPrompt).toContain("TRUSTED TEMPLATE CATALOG");
    expect(providerContext?.systemPrompt).toContain('"id":"metric"');
    expect(providerContext?.userPrompt).toContain("Revenue reached 42.");
    expect(body).toContain('"templates":["media","metric"]');
    expect(body).toContain('"templateId":"metric"');
  });

  it("treats configured templates as overrides while keeping untouched built-ins", async () => {
    const { createVideoHandler } = await import("../src/server");
    let systemPrompt = "";
    const handler = createVideoHandler({
      authorize: "none",
      templates: kit,
      heartbeatMs: false,
      streamText: async function* (context) {
        systemPrompt = context.systemPrompt;
        yield '{"type":"scene.add","scene":{"id":"proof","templateId":"bigNumber","variables":{"texts":"Revenue","value":42,"label":"million"},"timing":{"fixedDuration":4}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-overlay",
        input: { input: "Revenue reached 42 million." },
      }),
    }));
    const body = await response.text();

    expect(systemPrompt).toContain('"id":"metric"');
    expect(systemPrompt).toContain('"id":"bigNumber"');
    expect(body).toContain('"templateId":"bigNumber"');
    expect(body).toContain('"type":"response.complete"');
  });

  it("rejects an automatic opening when a media override breaks its reserved input contract", async () => {
    const { createVideoHandler } = await import("../src/server");
    const streamText = vi.fn(async function* () { yield '{"type":"plan.complete"}\n'; });
    const templates = createServerTemplateRegistry({
      templates: [{
        id: "media",
        schema: {
          type: "object",
          properties: { title: { type: "string" } },
          required: ["title"],
          additionalProperties: false,
        },
        usesGlobalTextEffect: false,
        usesGlobalTransition: false,
        usesGlobalBackgroundEffect: false,
      }],
    });
    const handler = createVideoHandler({
      authorize: "none",
      templates,
      heartbeatMs: false,
      streamText,
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-opening-override",
        input: { input: "A grounded update.", opening: "Your update is ready." },
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_input", message: "Video input is invalid" },
    });
    expect(streamText).not.toHaveBeenCalled();
  });

  it("shows the provider only templates negotiated for this request", async () => {
    const { createVideoHandler } = await import("../src/server");
    let systemPrompt = "";
    const handler = createVideoHandler({
      authorize: "none",
      heartbeatMs: false,
      streamText: async function* (context) {
        systemPrompt = context.systemPrompt;
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-negotiated-catalog",
        input: { input: "Revenue grew." },
        capabilities: { templates: ["bigNumber"] },
      }),
    }));

    await response.text();
    expect(systemPrompt).toContain('"id":"bigNumber"');
    expect(systemPrompt).not.toContain('"id":"barChart"');
    expect(systemPrompt).not.toContain('"id":"beforeAfter"');
  });

  it("fails closed when a stale host-resolved media policy is configured", async () => {
    const { createVideoHandler } = await import("../src/server");

    expect(() => createVideoHandler({
      authorize: "none",
      heartbeatMs: false,
      streamText: async function* () {
        yield '{"type":"plan.complete"}\n';
      },
      // @ts-expect-error Removed 0.1 beta option must fail closed for stale JavaScript consumers too.
      mediaPolicy: "host-resolved",
    })).toThrow(/suppliedMedia/);
  });

  it("resolves bounded media intent on later scenes without leaking the query", async () => {
    const { createVideoHandler } = await import("../src/server");
    const resolveMedia = vi.fn(async () => ({
      url: "https://media.example.test/team.mp4",
      type: "video" as const,
      posterUrl: "https://media.example.test/team.jpg",
    }));
    let systemPrompt = "";
    const handler = createVideoHandler({
      authorize: "none",
      heartbeatMs: false,
      resolveMedia,
      streamText: async function* (context) {
        systemPrompt = context.systemPrompt;
        yield '{"type":"scene.add","scene":{"id":"first","templateId":"bigNumber","variables":{"texts":"Activation","value":58,"label":"percent","mediaKeyword":"product team"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"scene.add","scene":{"id":"payoff","templateId":"media","variables":{"texts":"Momentum unlocked","mediaKeyword":"product team celebrating","mediaType":"video"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-resolved-media",
        input: { input: "Activation reached 58 percent. The product team unlocked momentum." },
        capabilities: { templates: ["bigNumber", "media"] },
      }),
    }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);
    const scenes = events.flatMap((event) => event.type === "scene.add" ? [event.data.scene] : []);

    expect(resolveMedia).toHaveBeenCalledTimes(2);
    expect(resolveMedia).toHaveBeenNthCalledWith(1, "product team", expect.objectContaining({
      templateId: "bigNumber",
      preferredType: "any",
      signal: expect.any(AbortSignal),
    }));
    expect(resolveMedia).toHaveBeenNthCalledWith(2, "product team celebrating", expect.objectContaining({
      templateId: "media",
      preferredType: "video",
      signal: expect.any(AbortSignal),
    }));
    expect(systemPrompt).toContain('"mediaKeyword":"string{2..80}"');
    expect(scenes[0].variables).toMatchObject({ mediaType: "gradient" });
    expect(scenes[0].variables).not.toHaveProperty("mediaKeyword");
    expect(scenes[0].variables).not.toHaveProperty("mediaUrl");
    expect(scenes[1].variables).toMatchObject({
      mediaUrl: "https://media.example.test/team.mp4",
      mediaType: "video",
      mediaPoster: "https://media.example.test/team.jpg",
    });
    expect(scenes[2].variables).toMatchObject({
      mediaUrl: "https://media.example.test/team.mp4",
      mediaType: "video",
      mediaPoster: "https://media.example.test/team.jpg",
    });
    expect(JSON.stringify(events)).not.toContain("mediaKeyword");
    expect(events.at(-1)).toMatchObject({ type: "response.complete" });
  });

  it("falls back to a gradient when the configured resolver finds no safe asset", async () => {
    const { createVideoHandler } = await import("../src/server");
    const handler = createVideoHandler({
      authorize: "none",
      heartbeatMs: false,
      resolveMedia: async () => null,
      streamText: async function* () {
        yield '{"type":"scene.add","scene":{"id":"first","templateId":"bigNumber","variables":{"texts":"Activation","value":58,"label":"percent"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"scene.add","scene":{"id":"second","templateId":"bigNumber","variables":{"texts":"Retention","value":71,"label":"percent","mediaKeyword":"abstract unsafe concept"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-media-fallback",
        input: { input: "Activation reached 58 percent and retention reached 71 percent." },
        capabilities: { templates: ["bigNumber"] },
      }),
    }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);
    const second = events.flatMap((event) => event.type === "scene.add" ? [event.data.scene] : [])
      .find(({ id }) => id === "second")!;

    expect(second.variables).toMatchObject({ mediaType: "gradient" });
    expect(second.variables).not.toHaveProperty("mediaKeyword");
    expect(second.variables).not.toHaveProperty("mediaUrl");
    expect(events.at(-1)).toMatchObject({ type: "response.complete" });
  });

  it("uses the asset-free runtime opening before resolving a generated media scene", async () => {
    const { createVideoHandler } = await import("../src/server");
    const handler = createVideoHandler({
      authorize: "none",
      heartbeatMs: false,
      resolveMedia: async () => ({
        url: "https://media.example.test/premature.mp4",
        type: "video",
      }),
      streamText: async function* () {
        yield '{"type":"scene.add","scene":{"id":"invalid-first","templateId":"bigNumber","variables":{"texts":"Activation","value":58},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"scene.add","scene":{"id":"premature-media","templateId":"media","variables":{"texts":"Momentum unlocked","mediaKeyword":"product team celebrating"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"scene.add","scene":{"id":"first-accepted","templateId":"bigNumber","variables":{"texts":"Retention","value":71,"label":"percent"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-first-accepted-asset-free",
        input: { input: "Activation reached 58 percent and retention reached 71 percent." },
        capabilities: { templates: ["bigNumber", "media"] },
      }),
    }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);
    const scenes = events.flatMap((event) => event.type === "scene.add" ? [event.data.scene] : []);

    expect(scenes.map(({ id }) => id)).toEqual([
      "supplied-opening",
      "premature-media",
      "first-accepted",
    ]);
    expect(scenes[0].variables).toMatchObject({ mediaType: "gradient" });
    expect(scenes[0].variables).not.toHaveProperty("mediaUrl");
    expect(scenes[0].variables).not.toHaveProperty("mediaKeyword");
    expect(scenes[1].variables).toMatchObject({
      mediaType: "video",
      mediaUrl: "https://media.example.test/premature.mp4",
    });
    expect(scenes[1].variables).not.toHaveProperty("mediaKeyword");
    expect(events.at(-1)).toMatchObject({ type: "response.complete" });
  });

  it("resolves media intent in scene.patch without exposing mediaKeyword", async () => {
    const { createVideoHandler } = await import("../src/server");
    const resolveMedia = vi.fn(async () => ({
      url: "https://media.example.test/patched.jpg",
      type: "image" as const,
    }));
    const handler = createVideoHandler({
      authorize: "none",
      heartbeatMs: false,
      resolveMedia,
      streamText: async function* () {
        yield '{"type":"scene.add","scene":{"id":"opening","templateId":"bigNumber","variables":{"texts":"Activation","value":58,"label":"percent"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"scene.add","scene":{"id":"later","templateId":"bigNumber","variables":{"texts":"Retention","value":71,"label":"percent","mediaType":"gradient"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"scene.patch","sceneId":"later","patch":{"variables":{"mediaKeyword":"customer success meeting","mediaType":"photo"}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-media-scene-patch",
        input: { input: "Activation reached 58 percent and retention reached 71 percent." },
        capabilities: { templates: ["bigNumber"] },
      }),
    }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);
    const patchEvent = events.find(({ type }) => type === "scene.patch");

    expect(resolveMedia).toHaveBeenCalledWith("customer success meeting", expect.objectContaining({
      templateId: "bigNumber",
      preferredType: "image",
    }));
    expect(patchEvent).toMatchObject({
      type: "scene.patch",
      data: { patch: { variables: {
        mediaUrl: "https://media.example.test/patched.jpg",
        mediaType: "photo",
      } } },
    });
    expect(JSON.stringify(events)).not.toContain("mediaKeyword");
  });

  it("resolves media intent in asset.patch without exposing mediaKeyword", async () => {
    const { createVideoHandler } = await import("../src/server");
    const resolveMedia = vi.fn(async () => ({
      url: "https://media.example.test/patched.mp4",
      type: "video" as const,
      posterUrl: "https://media.example.test/patched-poster.jpg",
    }));
    const handler = createVideoHandler({
      authorize: "none",
      heartbeatMs: false,
      resolveMedia,
      streamText: async function* () {
        yield '{"type":"scene.add","scene":{"id":"opening","templateId":"bigNumber","variables":{"texts":"Activation","value":58,"label":"percent"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"scene.add","scene":{"id":"later","templateId":"bigNumber","variables":{"texts":"Retention","value":71,"label":"percent","mediaType":"gradient"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"asset.patch","sceneId":"later","variables":{"mediaKeyword":"customer success celebration","mediaType":"video"}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-media-asset-patch",
        input: { input: "Activation reached 58 percent and retention reached 71 percent." },
        capabilities: { templates: ["bigNumber"] },
      }),
    }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);
    const patchEvent = events.find(({ type }) => type === "asset.patch");

    expect(resolveMedia).toHaveBeenCalledWith("customer success celebration", expect.objectContaining({
      templateId: "bigNumber",
      preferredType: "video",
    }));
    expect(patchEvent).toMatchObject({
      type: "asset.patch",
      data: { variables: {
        mediaUrl: "https://media.example.test/patched.mp4",
        mediaType: "video",
        mediaPoster: "https://media.example.test/patched-poster.jpg",
      } },
    });
    expect(JSON.stringify(events)).not.toContain("mediaKeyword");
  });

  it("falls back to a gradient when the application media resolver fails", async () => {
    const { createVideoHandler } = await import("../src/server");
    const handler = createVideoHandler({
      authorize: "none",
      heartbeatMs: false,
      resolveMedia: async () => { throw new Error("private provider failure"); },
      streamText: async function* () {
        yield '{"type":"scene.add","scene":{"id":"opening","templateId":"bigNumber","variables":{"texts":"Activation","value":58,"label":"percent"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"scene.add","scene":{"id":"later","templateId":"bigNumber","variables":{"texts":"Retention","value":71,"label":"percent","mediaKeyword":"customer success meeting"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-media-resolver-failure",
        input: { input: "Activation reached 58 percent and retention reached 71 percent." },
        capabilities: { templates: ["bigNumber"] },
      }),
    }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);
    const scenes = events.flatMap((event) => event.type === "scene.add" ? [event.data.scene] : []);

    const later = scenes.find(({ id }) => id === "later")!;
    expect(later.variables).toMatchObject({ mediaType: "gradient" });
    expect(later.variables).not.toHaveProperty("mediaKeyword");
    expect(events.at(-1)).toMatchObject({ type: "response.complete" });
    expect(JSON.stringify(events)).not.toContain("private provider failure");
  });

  it("does not swallow an AbortError from the application media resolver", async () => {
    const { createVideoHandler } = await import("../src/server");
    const onError = vi.fn();
    const handler = createVideoHandler({
      authorize: "none",
      heartbeatMs: false,
      onError,
      resolveMedia: async () => { throw new DOMException("cancelled", "AbortError"); },
      streamText: async function* () {
        yield '{"type":"scene.add","scene":{"id":"opening","templateId":"bigNumber","variables":{"texts":"Activation","value":58,"label":"percent"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"scene.add","scene":{"id":"later","templateId":"bigNumber","variables":{"texts":"Retention","value":71,"label":"percent","mediaKeyword":"customer success meeting"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-media-resolver-abort",
        input: { input: "Activation reached 58 percent and retention reached 71 percent." },
        capabilities: { templates: ["bigNumber"] },
      }),
    }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: "AbortError" }));
    expect(events.at(-1)).toMatchObject({ type: "response.error", data: { terminal: true } });
    expect(events.some(({ type }) => type === "response.complete")).toBe(false);
  });

  it("does not expose or resolve media intent for an incompatible custom media schema", async () => {
    const { createVideoHandler } = await import("../src/server");
    const resolveMedia = vi.fn(async () => ({
      url: "https://media.example.test/should-not-resolve.jpg",
      type: "image" as const,
    }));
    let systemPrompt = "";
    const handler = createVideoHandler({
      authorize: "none",
      templates: incompatibleResolverKit,
      heartbeatMs: false,
      resolveMedia,
      streamText: async function* (context) {
        systemPrompt = context.systemPrompt;
        yield '{"type":"scene.add","scene":{"id":"custom","templateId":"incompatibleMedia","variables":{"title":"Grounded","mediaKeyword":"product team"},"timing":{"fixedDuration":3}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-incompatible-media-schema",
        input: { input: "Grounded." },
        capabilities: { templates: ["incompatibleMedia"] },
      }),
    }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);
    const scene = events.find((event) => event.type === "scene.add" &&
      event.data.scene.id === "custom");

    expect(systemPrompt).not.toContain('"mediaKeyword"');
    expect(resolveMedia).not.toHaveBeenCalled();
    expect(scene).toMatchObject({ type: "scene.add", data: { scene: { variables: { title: "Grounded" } } } });
    expect(JSON.stringify(events)).not.toContain("mediaKeyword");
  });

  it("uses safe prompt and validator overrides without exposing provider ownership", async () => {
    const { createVideoHandler } = await import("../src/server");
    const allowMediaUrl = vi.fn(() => true);
    let systemPrompt = "";
    const handler = createVideoHandler({
      authorize: "none",
      templates: kit,
      basePrompt: "CUSTOM BASE",
      allowMediaUrl,
      heartbeatMs: false,
      streamText: async function* (context) {
        systemPrompt = context.systemPrompt;
        yield '{"type":"scene.add","scene":{"id":"proof","templateId":"metric","variables":{"value":7},"timing":{"fixedDuration":4}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/motion", {
      method: "POST",
      body: JSON.stringify({ protocolVersion: "0.4", requestId: "request-app", input: { input: "Value is 7." } }),
    }));

    await response.text();
    expect(systemPrompt).toContain("CUSTOM BASE");
    expect(systemPrompt).toContain("TRUSTED TEMPLATE CATALOG");
    expect(response.status).toBe(200);
  });

  it("selects the trusted knowledge contract from validated VideoInput", async () => {
    const { createVideoHandler } = await import("../src/server");
    const prompts: string[] = [];
    const handler = createVideoHandler({
      authorize: "none",
      templates: kit,
      heartbeatMs: false,
      streamText: async function* (context) {
        prompts.push(context.systemPrompt);
        yield '{"type":"scene.add","scene":{"id":"proof","templateId":"metric","variables":{"value":7},"timing":{"fixedDuration":4}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    for (const [requestId, knowledgeMode] of [["strict", undefined], ["general", "general"]] as const) {
      const response = await handler(new Request("https://app.example/api/motion", {
        method: "POST",
        body: JSON.stringify({
          protocolVersion: "0.4",
          requestId,
          input: { input: "Explain the principle.", ...(knowledgeMode ? { knowledgeMode } : {}) },
        }),
      }));
      await response.text();
    }

    expect(prompts[0]).toContain("input-only knowledge mode");
    expect(prompts[0]).not.toContain("Use stable general knowledge to answer");
    expect(prompts[1]).toContain("general knowledge mode");
    expect(prompts[1]).toContain("Use stable general knowledge to answer");
  });

  it.each([
    ["scene.add", [
      '{"type":"scene.add","scene":{"id":"image-1","templateId":"image","variables":{"imageUrl":"https://evil.example/image.png"},"timing":{"fixedDuration":4}}}\n',
      '{"type":"plan.complete"}\n',
    ]],
    ["scene.patch", [
      '{"type":"scene.add","scene":{"id":"image-1","templateId":"image","variables":{"imageUrl":"https://safe.example/image.png"},"timing":{"fixedDuration":4}}}\n',
      '{"type":"scene.patch","sceneId":"image-1","variables":{"imageUrl":"https://evil.example/image.png"}}\n',
      '{"type":"plan.complete"}\n',
    ]],
  ])("rejects unauthorized schema-backed media in %s", async (_part, deltas) => {
    const { createVideoHandler } = await import("../src/server");
    const handler = createVideoHandler({
      authorize: "none",
      templates: mediaKit,
      heartbeatMs: false,
      streamText: async function* () {
        yield* deltas;
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-media",
        input: {
          input: "Use the supplied image.",
          suppliedMedia: [{ id: "safe-image", url: "https://safe.example/image.png", type: "image" }],
        },
      }),
    }));
    const body = await response.text();

    expect(body).toContain('"type":"response.error"');
    expect(body).not.toContain('"type":"response.complete"');
  });

  it("rejects a fabricated quote through the schema-driven handler", async () => {
    const { createVideoHandler } = await import("../src/server");
    const handler = createVideoHandler({
      authorize: "none",
      templates: quoteKit,
      heartbeatMs: false,
      streamText: async function* () {
        yield '{"type":"scene.add","scene":{"id":"quote-1","templateId":"quote","variables":{"quote":"the workflow was faster","secondQuote":"This was fabricated"},"timing":{"fixedDuration":4}}}\n';
        yield '{"type":"plan.complete"}\n';
      },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-quote",
        input: { input: "The customer said the workflow was faster." },
      }),
    }));
    const body = await response.text();
    expect(body).toContain('"type":"response.error"');
    expect(body).not.toContain('"type":"response.complete"');
  });

  it.each([
    ["scene.add", [
      '{"type":"scene.add","scene":{"id":"screen-1","templateId":"screenshot","variables":{"imageUrl":"https://host.example/not-supplied.png"},"timing":{"fixedDuration":4}}}\n',
      '{"type":"plan.complete"}\n',
    ]],
    ["scene.patch", [
      '{"type":"scene.add","scene":{"id":"screen-1","templateId":"screenshot","variables":{"imageUrl":"https://safe.example/screenshot.png"},"timing":{"fixedDuration":4}}}\n',
      '{"type":"scene.patch","sceneId":"screen-1","variables":{"imageUrl":"https://host.example/not-supplied.png"}}\n',
      '{"type":"plan.complete"}\n',
    ]],
  ])("requires an actual supplied image for screenshot %s", async (_part, deltas) => {
    const { createVideoHandler } = await import("../src/server");
    const handler = createVideoHandler({
      authorize: "none",
      templates: screenshotKit,
      heartbeatMs: false,
      allowMediaUrl: () => true,
      streamText: async function* () { yield* deltas; },
    });
    const response = await handler(new Request("https://app.example/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "request-screenshot",
        input: {
          input: "Show the product screenshot.",
          suppliedMedia: [{ id: "safe-screenshot", url: "https://safe.example/screenshot.png", type: "image" }],
        },
      }),
    }));
    const body = await response.text();
    expect(body).toContain('"type":"response.error"');
    expect(body).not.toContain('"type":"response.complete"');
  });
});
