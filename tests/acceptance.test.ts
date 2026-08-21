import { describe, expect, it } from "vitest";
import { createVideo, type VideoEvent } from "../src/internal";

async function validEvents(): Promise<VideoEvent[]> {
  const run = createVideo({
    input: "Activation increased from 41% to 58%.",
    opening: "Your activation update is ready.",
    audio: { src: "https://customer.example/audio/calm.mp3" },
  }, {
    generate: async function* () {
      yield {
        type: "scene.add",
        scene: {
          id: "metric",
          templateId: "bigNumber",
          variables: { value: 58, unit: "%", label: "activation" },
          timing: { fixedDuration: 4 },
        },
      };
      yield {
        type: "scene.add",
        scene: {
          id: "proof",
          templateId: "media",
          variables: { mediaUrl: "https://customer.example/proof.mp4", headline: "Up 17 points" },
          timing: { fixedDuration: 4 },
        },
      };
      yield {
        type: "scene.add",
        scene: {
          id: "closer",
          templateId: "ctaLogo",
          variables: { cta: "Keep going" },
          timing: { fixedDuration: 3 },
        },
      };
      yield { type: "plan.complete" };
    },
  });
  const events: VideoEvent[] = [];
  for await (const event of run.stream) events.push(event);
  return events;
}

describe("video release gates", () => {
  it("passes an immediate opening, early asset-free body, resolved media, audio, and completion", async () => {
    const api = await import("../scripts/acceptance/evaluate").catch(() => undefined);
    expect(api?.evaluateVideoAcceptance, "the acceptance evaluator should exist")
      .toBeTypeOf("function");
    if (!api?.evaluateVideoAcceptance) return;

    const events = await validEvents();
    const timedEvents = events.map((event) => ({
      event,
      elapsedMs: event.type === "response.start" ? 0
        : event.type === "audio.set" ? 1
          : event.type === "scene.add" && event.data.scene.id === "supplied-opening" ? 2
            : event.type === "scene.add" && event.data.scene.id === "metric" ? 900
              : event.type === "response.complete" ? 1900
                : 1300,
    }));
    const report = api.evaluateVideoAcceptance({
      events: timedEvents,
      requireAudio: true,
      humanQualityScore: 86,
      thresholds: {
        openingMs: 100,
        firstGeneratedSceneMs: 1000,
        completionMs: 2000,
        minBodyScenes: 3,
        minTemplateDiversity: 3,
        minHumanQualityScore: 80,
      },
    });

    expect(report.passed).toBe(true);
    expect(report.metrics).toEqual(expect.objectContaining({
      openingMs: 2,
      firstGeneratedSceneMs: 900,
      completionMs: 1900,
      bodyScenes: 3,
      templateDiversity: 3,
    }));
    expect(report.checks.every(({ passed }) => passed)).toBe(true);
  });

  it("reports unresolved first media, missing completion, and insufficient review quality", async () => {
    const api = await import("../scripts/acceptance/evaluate").catch(() => undefined);
    expect(api?.evaluateVideoAcceptance).toBeTypeOf("function");
    if (!api?.evaluateVideoAcceptance) return;

    const events = (await validEvents()).filter((event) => event.type !== "response.complete");
    const firstBody = events.find((event) =>
      event.type === "scene.add" && event.data.scene.id === "metric");
    if (firstBody?.type === "scene.add") {
      firstBody.data.scene.templateId = "media";
      firstBody.data.scene.variables = { mediaUrl: "", headline: "Loading media..." };
    }
    const report = api.evaluateVideoAcceptance({
      events: events.map((event, index) => ({ event, elapsedMs: index * 500 })),
      humanQualityScore: 60,
    });

    expect(report.passed).toBe(false);
    const failed = report.checks.filter(({ passed }) => !passed).map(({ id }) => id);
    expect(failed).toContain("first-generated-scene-playable");
    expect(failed).toContain("media-resolved-before-commit");
    expect(failed).toContain("response-complete");
    expect(failed).toContain("human-quality");
  });

  it("rejects a media keyword that has no resolved URL on any template", async () => {
    const { evaluateVideoAcceptance } = await import("../scripts/acceptance/evaluate");
    const events = await validEvents();
    const closer = events.find((event) =>
      event.type === "scene.add" && event.data.scene.id === "closer");
    if (closer?.type === "scene.add") {
      closer.data.scene.variables.mediaKeyword = "team celebration";
      closer.data.scene.variables.mediaUrl = "";
    }

    const report = evaluateVideoAcceptance({
      events: events.map((event, index) => ({ event, elapsedMs: index * 100 })),
      humanQualityScore: 100,
    });

    expect(report.checks.find(({ id }) => id === "media-resolved-before-commit")?.passed)
      .toBe(false);
  });

  it("rejects pipe- or newline-delimited list variables", async () => {
    const { evaluateVideoAcceptance } = await import("../scripts/acceptance/evaluate");
    const events = await validEvents();
    const closer = events.find((event) =>
      event.type === "scene.add" && event.data.scene.id === "closer");
    if (closer?.type === "scene.add") {
      closer.data.scene.variables.items = "First item|Second item|Third item";
    }

    const report = evaluateVideoAcceptance({
      events: events.map((event, index) => ({ event, elapsedMs: index * 100 })),
      humanQualityScore: 100,
    });

    expect(report.checks.find(({ id }) => id === "template-variable-shape")?.passed)
      .toBe(false);
  });
});
