import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Video } from "../src/internal";
import { VideoFrame } from "../src/player/video-frame";
import { createRenderTemplateRegistry } from "../src/visual-system/catalog/internal";
import { BUILTIN_TEMPLATE_MANIFEST } from "../src/visual-system/catalog/builtin-manifest";
import { getTemplate } from "../src/visual-system/scene-templates/registry";
import { TEST_VIDEO_STYLE } from "./semantic-brand-fixture";

function outgoingMarkup(templateId: string, variables: Record<string, unknown>): string {
  const outgoing = getTemplate(templateId);
  const incoming = getTemplate("notification");
  if (!outgoing || !incoming) throw new Error(`Missing transition fixture ${templateId}`);
  const kit = createRenderTemplateRegistry({ templates: [outgoing, incoming] });
  const config: Video = {
    schemaVersion: "0.1",
    orientation: "portrait",
    style: { ...TEST_VIDEO_STYLE, defaultTransition: "crossfade" },
    scenes: [
      { id: "outgoing", templateId, variables: { ...variables, mediaUrl: "outgoing.jpg" }, timing: { fixedDuration: 5 } },
      {
        id: "incoming",
        templateId: "notification",
        variables: { appName: "VanillaSky", message: "Next scene", mediaUrl: "incoming.jpg" },
        timing: { fixedDuration: 5 },
      },
    ],
  };
  const markup = renderToStaticMarkup(createElement(VideoFrame, {
    kit, config, time: 4.85, width: 1080, height: 1920,
  }));
  const match = markup.match(/<div data-scene-layer="outgoing"[\s\S]*?<\/div><div data-scene-layer="incoming"/);
  return match?.[0] ?? markup;
}

function incomingMarkup(
  templateId: string,
  variables: Record<string, unknown>,
  duration: number,
): string {
  const outgoing = getTemplate("notification");
  const incoming = getTemplate(templateId);
  if (!outgoing || !incoming) throw new Error(`Missing transition fixture ${templateId}`);
  const kit = createRenderTemplateRegistry({ templates: [outgoing, incoming] });
  const config: Video = {
    schemaVersion: "0.1",
    orientation: "portrait",
    style: {
      ...TEST_VIDEO_STYLE,
      defaultTransition: "crossfade",
      brand: { ...TEST_VIDEO_STYLE.brand, name: "VanillaSky" },
    },
    scenes: [
      {
        id: "outgoing",
        templateId: "notification",
        variables: { appName: "VanillaSky", message: "The previous scene remains readable", mediaUrl: "outgoing.jpg" },
        timing: { fixedDuration: 5 },
      },
      { id: "incoming", templateId, variables: { ...variables, mediaUrl: "incoming.jpg" }, timing: { fixedDuration: duration } },
    ],
  };
  const markup = renderToStaticMarkup(createElement(VideoFrame, {
    kit, config, time: 5.25, width: 1080, height: 1920,
  }));
  const match = markup.match(/<div data-scene-layer="active"[\s\S]*$/);
  return match?.[0] ?? markup;
}

function incomingBoundaryMarkup(
  templateId: string,
  variables: Record<string, unknown>,
): string {
  const outgoing = getTemplate("notification");
  const incoming = getTemplate(templateId);
  if (!outgoing || !incoming) throw new Error(`Missing transition fixture ${templateId}`);
  const kit = createRenderTemplateRegistry({ templates: [outgoing, incoming] });
  const config: Video = {
    schemaVersion: "0.1",
    orientation: "portrait",
    style: { ...TEST_VIDEO_STYLE, defaultTransition: "crossfade" },
    scenes: [
      {
        id: "outgoing",
        templateId: "notification",
        variables: { appName: "VanillaSky", message: "The previous scene remains readable", mediaUrl: "outgoing.jpg" },
        timing: { fixedDuration: 5 },
      },
      { id: "incoming", templateId, variables: { ...variables, mediaUrl: "incoming.jpg" }, timing: { fixedDuration: 6 } },
    ],
  };
  const markup = renderToStaticMarkup(createElement(VideoFrame, {
    kit, config, time: 4.71, width: 1080, height: 1920,
  }));
  const match = markup.match(/<div data-scene-layer="incoming"[\s\S]*$/);
  return match?.[0] ?? markup;
}

describe("transition semantic progress", () => {
  it("keeps every transition-enabled built-in in the audited entry-semantics inventory", () => {
    // These three animate a displayed number from a synthetic zero and need
    // the transient wrapper below. Every other opt-in renders only sourced
    // content or an empty reveal at raw progress zero.
    const transientValueTemplates = ["bigNumber", "progressRing", "tweet"];
    const groundedOrEmptyTemplates = [
      "media", "reaction", "confetti", "emojiBurst", "barChart", "phoneMockup",
      "webMockup", "codeEditor", "terminal", "notification", "tripleStats",
      "cardList", "steps", "ctaLogo", "ctaMedia",
    ];
    expect(BUILTIN_TEMPLATE_MANIFEST
      .filter((template) => template.usesGlobalTransition)
      .map((template) => template.id)
      .sort())
      .toEqual([...transientValueTemplates, ...groundedOrEmptyTemplates].sort());
  });

  it.each([
    ["bigNumber", { texts: "Grounded metric", value: 128, unit: "%", label: "Faster" }, 1],
    ["progressRing", { texts: "Readiness", value: 75, unit: "%", label: "Checks" }, 1],
    ["tweet", { authorName: "VanillaSky", message: "Grounded post", replies: 90, likes: 100 }, 2],
  ] as const)("keeps %s transient numeric semantics visually absent during incoming crossfade", (templateId, variables, expectedMarkers) => {
    const markup = incomingBoundaryMarkup(templateId, variables);
    expect(markup).toContain("--vanillasky-transition-semantic-visibility:hidden");
    expect(markup.match(/data-transition-semantic="transient"/g)).toHaveLength(expectedMarkers);
    expect(markup.match(/visibility:var\(--vanillasky-transition-semantic-visibility,visible\)/g)).toHaveLength(expectedMarkers);
  });

  it.each([
    ["bigNumber", { texts: "Grounded zero", value: 0, unit: "%", label: "No incidents" }],
    ["progressRing", { texts: "Grounded zero", value: 0, unit: "%", label: "No regressions" }],
    ["tweet", { authorName: "VanillaSky", message: "Grounded post", replies: 0, likes: 0 }],
  ] as const)("does not suppress a sourced zero in %s", (templateId, variables) => {
    const markup = incomingBoundaryMarkup(templateId, variables);
    expect(markup).not.toContain('data-transition-semantic="transient"');
  });

  it("makes the notification opening recognizable without advancing raw scene time", () => {
    const template = getTemplate("notification");
    if (!template) throw new Error("Missing notification fixture");
    const markup = renderToStaticMarkup(createElement(template.component, {
      variables: { appName: "VanillaSky", appIcon: "🔔", message: "Your release video is ready" },
      style: TEST_VIDEO_STYLE,
      progress: 0,
      motionProgress: template.transitionTiming?.entryReadyProgress,
      beatIntensity: 0,
      width: 1080,
      height: 1920,
      safeZone: { top: 100, right: 60, bottom: 100, left: 60 },
      sceneDuration: 3,
      isPlaying: false,
    }));
    expect(markup).toContain("VanillaSky");
    expect(markup).toMatch(/data-notification-card="true" style="[^"]*opacity:1/);
    expect(markup).toMatch(/data-notification-header="true" style="[^"]*opacity:1/);
  });

  it("makes the final CTA readable at its incoming transition point", () => {
    const template = getTemplate("ctaLogo");
    if (!template) throw new Error("Missing ctaLogo fixture");
    const markup = renderToStaticMarkup(createElement(template.component, {
      variables: { cta: "Audit your stack", url: "vanillasky.ai" },
      style: { ...TEST_VIDEO_STYLE, brand: { ...TEST_VIDEO_STYLE.brand, name: "VanillaSky" } },
      progress: 0,
      motionProgress: template.transitionTiming?.entryReadyProgress,
      beatIntensity: 0,
      width: 1080,
      height: 1920,
      safeZone: { top: 100, right: 60, bottom: 100, left: 60 },
      sceneDuration: 4,
      isPlaying: false,
    }));
    expect(markup).toContain("Audit your stack");
    expect(markup).toContain("VanillaSky");
    expect(markup).not.toContain("opacity:0;");
  });

  it("makes the media CTA brand close readable at its incoming transition point", () => {
    const template = getTemplate("ctaMedia");
    if (!template) throw new Error("Missing ctaMedia fixture");
    const markup = renderToStaticMarkup(createElement(template.component, {
      variables: { headline: "Release ready", cta: "Ship now", url: "vanillasky.ai" },
      style: { ...TEST_VIDEO_STYLE, brand: { ...TEST_VIDEO_STYLE.brand, name: "VanillaSky" } },
      progress: 0,
      motionProgress: template.transitionTiming?.entryReadyProgress,
      beatIntensity: 0,
      width: 1080,
      height: 1920,
      safeZone: { top: 100, right: 60, bottom: 100, left: 60 },
      sceneDuration: 4,
      isPlaying: false,
    }));
    expect(markup).toContain("Ship now");
    expect(markup).toContain("VanillaSky");
    expect(markup).not.toContain("opacity:0;");
  });

  it.each([
    ["ctaLogo", { cta: "Audit your stack", url: "vanillasky.ai" }, 3.5],
    ["ctaMedia", { headline: "Release ready", cta: "Ship now", url: "vanillasky.ai" }, 4],
  ] as const)("keeps %s readable 250 ms after its contiguous boundary", (templateId, variables, duration) => {
    const markup = incomingMarkup(templateId, variables, duration);
    expect(markup).toContain(templateId === "ctaLogo" ? "Audit your stack" : "Ship now");
    expect(markup).toContain("VanillaSky");
    expect(markup).toContain('data-scene-layer="active"');
    expect(markup).not.toContain("opacity:0;");
  });

  it("keeps a progress ring's exact grounded value through its outgoing motion", () => {
    const markup = outgoingMarkup("progressRing", {
      texts: "Reliability",
      value: 75,
      unit: "%",
      label: "successful runs",
    });
    expect(markup).toContain(">75<");
    expect(markup).not.toContain(">70<");
  });

  it("keeps exact tweet engagement values through outgoing card motion", () => {
    const markup = outgoingMarkup("tweet", {
      authorName: "VanillaSky",
      authorHandle: "@vanillaskyai",
      authorVerified: true,
      message: "Grounded release",
      replies: 90,
      likes: 100,
    });
    expect(markup).toContain(">90<");
    expect(markup).toContain(">100<");
    expect(markup).not.toContain(">80<");
    expect(markup).not.toContain(">78<");
  });

  it("reaches the exact third phone screen during outgoing shell motion", () => {
    const markup = outgoingMarkup("phoneMockup", {
      texts: "Three exact screens",
      screenMediaUrl: "https://assets.example.test/one.png",
      screen1Url: "https://assets.example.test/two.png",
      screen2Url: "https://assets.example.test/three.png",
    });
    expect(markup).toContain('data-phone-screen-progress="2"');
  });

  it("keeps terminal output and code lines authored after the old hold point exact", () => {
    const terminal = outgoingMarkup("terminal", {
      texts: "Install the SDK",
      command: "npm install @vanillaskyai/video",
      output: ["Checking package", "FINAL_TERMINAL_OUTPUT"],
      promptPrefix: "$",
    });
    expect(terminal).toContain("npm install @vanillaskyai/video");
    expect(terminal).toContain("FINAL_TERMINAL_OUTPUT");

    const code = outgoingMarkup("codeEditor", {
      texts: "Stream a video",
      filename: "route.ts",
      code: "const first = true;\nconst FINAL_CODE_LINE = true;",
    });
    expect(code).toContain("FINAL_CODE_LINE");
  });
});
