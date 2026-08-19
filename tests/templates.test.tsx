import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addRegistryTemplates } from "../src/cli/registry";
import { getTemplateDefaults } from "../src/visual-system/catalog/schema";
import { TEST_VIDEO_BRAND, TEST_VIDEO_STYLE } from "./semantic-brand-fixture";

const EXPECTED_TEMPLATE_IDS = [
  "media",
  "reaction",
  "confetti",
  "emojiBurst",
  "bigNumber",
  "barChart",
  "progressRing",
  "phoneMockup",
  "webMockup",
  "codeEditor",
  "terminal",
  "tweet",
  "notification",
  "chatMessenger",
  "chatWhatsapp",
  "milestone",
  "reviewStack",
  "testimonial",
  "incomingCall",
  "brandMessage",
  "promptInput",
  "beforeAfter",
  "tripleStats",
  "problemSolution",
  "cardList",
  "steps",
  "ctaLogo",
  "ctaMedia",
].sort();

const EXPECTED_GLOBAL_TRANSITION_IDS = [
  "media",
  "reaction",
  "confetti",
  "emojiBurst",
  "bigNumber",
  "barChart",
  "progressRing",
  "phoneMockup",
  "webMockup",
  "codeEditor",
  "terminal",
  "tweet",
  "notification",
  "tripleStats",
  "cardList",
  "steps",
  "ctaLogo",
  "ctaMedia",
].sort();

const EXPECTED_POST_HOLD_MOTION_IDS = EXPECTED_GLOBAL_TRANSITION_IDS
  .filter((id) => id !== "tweet" && id !== "notification");

describe("open source template registry", () => {
  it("renders unsuffixed three-message chats as incoming, outgoing, incoming", async () => {
    const { buildConversationMessages } = await import(
      "../src/visual-system/scene-templates/social-conversation"
    );

    expect(buildConversationMessages({
      msg1: "Did the launch ship?",
      msg2: "Yes — it is live now.",
      msg3: "Amazing, send me the link.",
    })).toEqual([
      { author: "Customer", text: "Did the launch ship?", side: "left" },
      { author: "You", text: "Yes — it is live now.", side: "right" },
      { author: "Customer", text: "Amazing, send me the link.", side: "left" },
    ]);
  });

  it("preserves explicit chat direction suffixes", async () => {
    const { buildConversationMessages } = await import(
      "../src/visual-system/scene-templates/social-conversation"
    );

    expect(buildConversationMessages({
      msg1: "I sent this|out",
      msg2: "I received this|in",
    })).toEqual([
      { author: "You", text: "I sent this", side: "right" },
      { author: "Customer", text: "I received this", side: "left" },
    ]);
  });

  it("uses the configured video font in the notification opening", async () => {
    const { getTemplate } = await import("../src/visual-system/scene-templates/registry");
    const template = getTemplate("notification");
    expect(template).toBeDefined();
    if (!template) return;
    const markup = renderToStaticMarkup(createElement(template.component, {
      variables: { ...getTemplateDefaults(template.schema), message: "Creating your video" },
      style: { brand: { ...TEST_VIDEO_BRAND, font: "Raleway" } },
      progress: 0.2,
      beatIntensity: 0,
      width: 1920,
      height: 1080,
      safeZone: { top: 60, right: 100, bottom: 60, left: 100 },
      sceneDuration: 4,
      isPlaying: true,
    }));

    expect(markup).toContain("font-family:Raleway");
  });

  it("keeps every transition-enabled built-in renderable at entry, hold, and terminal points", async () => {
    const { listTemplates } = await import("../src/visual-system/scene-templates/registry");
    const templates = listTemplates().filter(({ usesGlobalTransition }) => usesGlobalTransition);
    expect(templates.map(({ id }) => id).sort()).toEqual(EXPECTED_GLOBAL_TRANSITION_IDS);

    for (const template of templates) {
      for (const [width, height] of [[1080, 1920], [1920, 1080]] as const) {
        const checkpoints = [
          { label: "entry", progress: 0, motionProgress: template.transitionTiming?.entryReadyProgress, visible: true },
          { label: "hold", progress: 1, motionProgress: template.transitionTiming?.holdProgress, visible: true },
          { label: "terminal", progress: 1, motionProgress: 1, visible: false },
        ] as const;
        const rendered = new Map<string, string>();
        for (const { label, progress, motionProgress, visible } of checkpoints) {
          const markup = renderToStaticMarkup(createElement(template.component, {
            variables: getTemplateDefaults(template.schema),
            style: TEST_VIDEO_STYLE,
            progress,
            motionProgress,
            beatIntensity: 0,
            width,
            height,
            safeZone: { top: 100, right: 100, bottom: 100, left: 100 },
            sceneDuration: template.preferredDuration ?? 5,
            isPlaying: false,
          }));
          rendered.set(label, markup);
          expect(markup, `${template.id} ${width}x${height} at raw ${progress}`).not.toContain("NaN");
          expect(markup.length, `${template.id} ${width}x${height} at raw ${progress}`).toBeGreaterThan(300);
          const opacities = [...markup.matchAll(/opacity:([0-9.]+)/g)].map((match) => Number(match[1]));
          if (visible) {
            expect(
              opacities.length === 0 || Math.max(...opacities) >= 0.5,
              `${template.id} ${width}x${height} at ${label} should retain a visible layer`,
            ).toBe(true);
          }
        }
        if (EXPECTED_POST_HOLD_MOTION_IDS.includes(template.id)) {
          expect(
            rendered.get("terminal"),
            `${template.id} ${width}x${height} should run motion after its readable hold`,
          ).not.toBe(rendered.get("hold"));
        }
      }
    }
  });

  it("renders exactly three cardList and steps blocks together", async () => {
    const { getTemplate } = await import("../src/visual-system/scene-templates/registry");
    const render = (templateId: "cardList" | "steps", variables: Record<string, unknown>) => {
      const template = getTemplate(templateId);
      expect(template).toBeDefined();
      if (!template) return "";
      return renderToStaticMarkup(createElement(template.component, {
        variables,
        style: TEST_VIDEO_STYLE,
        progress: 0.2,
        beatIntensity: 0,
        width: 1080,
        height: 1920,
        safeZone: { top: 100, right: 60, bottom: 100, left: 60 },
        sceneDuration: 4,
        isPlaying: false,
      }));
    };

    for (const [templateId, variables] of [
      ["cardList", { texts: "Three benefits", items: ["Fast", "Personal", "Live", "Extra"], itemEmojis: ["⚡", "🎯", "▶️", "✦"] }],
      ["steps", { texts: "How it works", steps: ["Connect", "Generate", "Stream", "Extra"], stepEmojis: ["🔌", "✨", "▶️", "✦"] }],
    ] as const) {
      const markup = render(templateId, variables);
      const itemPattern = new RegExp(`data-template-item="${templateId}"`, "g");
      expect(markup.match(itemPattern)).toHaveLength(3);
      expect(markup).not.toContain("Extra");
      const opacityPattern = new RegExp(`data-template-item="${templateId}" style="[^"]*opacity:([^;"]+)`, "g");
      const opacities = [...markup.matchAll(opacityPattern)].map((match) => Number(match[1]));
      expect(opacities).toHaveLength(3);
      expect(opacities.every((opacity) => opacity >= 0.95)).toBe(true);
    }
  });

  it("does not resolve removed pre-release template aliases", async () => {
    const registry = await import("../src/visual-system/scene-templates/registry");
    expect(registry.getTemplate("browserMockup")).toBeUndefined();
    expect(registry).not.toHaveProperty("ID_ALIASES");
    expect(registry).not.toHaveProperty("resolveAlias");
  });

  it("does not map removed pre-release text-effect names", async () => {
    const { normalizeArchetype } = await import("../src/visual-system/scene-templates/text-archetypes");
    expect(normalizeArchetype("zoom-in")).toBe("subtle");
    expect(normalizeArchetype("word-stagger")).toBe("subtle");
  });

  it("keeps landscape step labels in separate readable columns", async () => {
    const { computeStepsLayout } = await import("../src/visual-system/primitives/infographic/StepsList");
    const safeZone = { top: 60, right: 100, bottom: 60, left: 100 };
    const layout = computeStepsLayout({
      width: 1920,
      height: 1080,
      labels: ["Meet leadership", "Review dashboard", "Publish assessment"],
      safeZone,
    });
    const sectionWidth = (1920 - safeZone.left - safeZone.right) / 3;

    for (let index = 0; index < layout.items.length - 1; index += 1) {
      const current = layout.items[index];
      const next = layout.items[index + 1];
      const gap = next.labelLeft - (current.labelLeft + current.labelWidth);
      expect(gap).toBeGreaterThanOrEqual(sectionWidth * 0.2);
    }
  });

  it("keeps bigNumber visually identical to the pre-streaming template", async () => {
    const { getTemplate } = await import("../src/visual-system/scene-templates/registry");
    const template = getTemplate("bigNumber");

    expect(template).toBeDefined();
    if (!template) return;
    expect(template.schema.properties).not.toHaveProperty("deltaValue");
    expect(template.schema.properties).not.toHaveProperty("deltaLabel");

    const markup = renderToStaticMarkup(createElement(template.component, {
      variables: {
        ...getTemplateDefaults(template.schema),
        value: 12.983,
        prefix: "$",
        unit: "B",
        label: "Operating earnings",
        deltaValue: "16%",
        deltaLabel: "up",
      },
      style: TEST_VIDEO_STYLE,
      progress: 1,
      beatIntensity: 0,
      width: 1920,
      height: 1080,
      safeZone: { top: 60, right: 100, bottom: 60, left: 100 },
      sceneDuration: 4,
      isPlaying: false,
    }));
    expect(markup).not.toContain("data-metric-delta");
    expect(markup).not.toContain("16%");
  });

  it("installs and renders every trusted public template without hosted services", async () => {
    let api: typeof import("../src/visual-system/scene-templates/registry") | undefined;
    try {
      api = await import("../src/visual-system/scene-templates/registry");
    } catch {
      // The assertion below is the expected red phase before extraction.
    }
    expect(api, "the bundled template entry point should exist").toBeDefined();
    if (!api) return;

    const templates = api.listTemplates();
    expect(templates.map((template) => template.id).sort()).toEqual(EXPECTED_TEMPLATE_IDS);

    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-all-templates-"));
    const installation = addRegistryTemplates({ cwd, names: EXPECTED_TEMPLATE_IDS });
    expect(installation.added.sort()).toEqual(EXPECTED_TEMPLATE_IDS);
    for (const id of EXPECTED_TEMPLATE_IDS) {
      expect(existsSync(join(cwd, `vanillasky/templates/${id}.tsx`)), `${id} source should install`).toBe(true);
    }

    for (const template of templates) {
      const markup = renderToStaticMarkup(createElement(template.component, {
        variables: getTemplateDefaults(template.schema),
        style: TEST_VIDEO_STYLE,
        progress: 0.5,
        beatIntensity: 0,
        width: 1080,
        height: 1920,
        safeZone: { top: 100, right: 60, bottom: 100, left: 60 },
        sceneDuration: template.preferredDuration ?? 4,
        isPlaying: false,
      }));
      expect(markup, `${template.id} should render visible markup`).toContain("style=");
      expect(markup).not.toContain("vanillasky.ai");
    }
  });
});
