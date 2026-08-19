import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getTemplateDefaults } from "../src/visual-system/catalog/schema";
import { createBuiltinTemplateSystemPrompt } from "../src/visual-system/catalog/catalog";
import { BarChart } from "../src/visual-system/primitives/charts/BarChart";
import { getTemplate } from "../src/visual-system/scene-templates/registry";
import { TEST_VIDEO_STYLE as style } from "./semantic-brand-fixture";

function renderPrimitive(props: Record<string, unknown>): string {
  const Component = BarChart as unknown as ComponentType<Record<string, unknown>>;
  return renderToStaticMarkup(createElement(Component, props));
}

function renderTemplate(
  variables: Record<string, unknown>,
  width = 1080,
  height = 1920,
): string {
  const template = getTemplate("barChart");
  expect(template).toBeDefined();
  if (!template) return "";

  return renderToStaticMarkup(createElement(template.component, {
    variables,
    style,
    progress: 1,
    beatIntensity: 0,
    width,
    height,
    safeZone: width < height
      ? { top: 100, right: 60, bottom: 100, left: 60 }
      : { top: 60, right: 100, bottom: 60, left: 100 },
    sceneDuration: 3.5,
    isPlaying: false,
  }));
}

describe("bar chart", () => {
  it.each([
    [1080, 1920],
    [1920, 1080],
  ])("renders labeled exact values at %sx%s", (width, height) => {
    const markup = renderPrimitive({
      data: [
        { label: "Starter", value: 34 },
        { label: "Growth", value: 68 },
        { label: "Scale", value: 91 },
      ],
      progress: 1,
      width,
      height,
      chartColor: "#00e5a0",
    });

    expect(markup).toContain("Starter");
    expect(markup).toContain("Growth");
    expect(markup).toContain("Scale");
    expect(markup).toContain(">34<");
    expect(markup).toContain(">68<");
    expect(markup).toContain(">91<");
  });

  it("caps the rendered comparison at six items", () => {
    const markup = renderPrimitive({
      data: Array.from({ length: 8 }, (_, index) => ({
        label: `Series ${index + 1}`,
        value: (index + 1) * 10,
      })),
      progress: 1,
      width: 1920,
      height: 1080,
    });

    expect(markup.match(/data-bar-chart-item=/g)).toHaveLength(6);
    expect(markup).not.toContain("Series 7");
    expect(markup).not.toContain("Series 8");
  });

  it("finishes all bar motion early enough for a stable final hold", () => {
    const props = {
      data: [20, 35, 50, 65, 80, 100].map((value, index) => ({
        label: `Series ${index + 1}`,
        value,
      })),
      width: 1920,
      height: 1080,
      beatIntensity: 0,
    };

    expect(renderPrimitive({ ...props, progress: 0.75 }))
      .toBe(renderPrimitive({ ...props, progress: 1 }));
  });

  it("uses grounded labeled data as the schema-owned visible default", () => {
    const template = getTemplate("barChart");
    expect(template).toBeDefined();
    if (!template) return;

    const bars = template.schema.properties.bars;
    expect(bars.type).toBe("array");
    expect(bars.minItems).toBe(2);
    expect(bars.maxItems).toBe(6);
    expect(bars.items?.type).toBe("object");
    expect(bars.items?.properties?.value?.format).toBe("grounded-stat");
    expect(bars.default).toEqual([
      { label: "Q1", value: 42 },
      { label: "Q2", value: 58 },
      { label: "Q3", value: 76 },
      { label: "Q4", value: 91 },
    ]);

    const defaults = getTemplateDefaults(template.schema);
    const markup = renderTemplate(defaults);
    expect(markup).toContain("Q1");
    expect(markup).toContain(">42<");
    expect(template.preferredDuration).toBe(4);
    expect(template.timing).toEqual({ contentFields: ["bars"], contentUnit: "items" });
  });

  it("continues to parse existing label:value template input", () => {
    const markup = renderTemplate({
      texts: "Revenue by region",
      bars: "North:42,South:67,West:53",
      chartColor: "#00e5a0",
    }, 1920, 1080);

    expect(markup).toContain("North");
    expect(markup).toContain("South");
    expect(markup).toContain("West");
    expect(markup).toContain(">42<");
    expect(markup).toContain(">67<");
    expect(markup).toContain(">53<");
  });

  it("keeps structured bars in the supplied-only planner schema without media keywords", () => {
    const prompt = createBuiltinTemplateSystemPrompt();
    const plannerCatalog = JSON.parse(prompt.trim().split("\n").at(-1) ?? "[]");
    const barChart = plannerCatalog.find(({ id }: { id: string }) => id === "barChart");

    expect(barChart.schema.properties.bars.items.type).toBe("object");
    expect(barChart.schema.properties).not.toHaveProperty("mediaKeyword");
    expect(prompt).not.toContain('"mediaKeyword"');
    expect(prompt).toContain(
      'For bars, emit an actual JSON array of 2–6 grounded objects with "label" and "value" fields.',
    );
    expect(prompt).not.toContain("use comma-separated label:value pairs");
  });
});
