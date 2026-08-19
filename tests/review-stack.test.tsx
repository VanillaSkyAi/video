import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewStack } from "../src/visual-system/primitives/social/ReviewStack";

const reviews = [
  { title: "Fast to launch", body: "We shipped in one afternoon.", author: "Maya" },
  { title: "Beautiful by default", body: "Every scene feels considered.", author: "Noah" },
  { title: "Easy to iterate", body: "Changes take seconds.", author: "Iris" },
];

function renderStack(progress: number, width: number, height: number) {
  return renderToStaticMarkup(createElement(ReviewStack, {
    progress,
    width,
    height,
    reviews,
  }));
}

function cardStyles(markup: string) {
  return [...markup.matchAll(/data-review-card="(\d+)" style="([^"]+)"/g)]
    .map((match) => ({ index: Number(match[1]), style: match[2] }));
}

describe("ReviewStack", () => {
  it.each([
    [1080, 1920],
    [1920, 1080],
  ])("keeps all reviews in separate readable rows at the shared hold (%ix%i)", (width, height) => {
    const cards = cardStyles(renderStack(0.6, width, height));

    expect(cards).toHaveLength(3);
    expect(cards.map(({ style }) => Number(style.match(/opacity:([^;]+)/)?.[1])))
      .toEqual([1, 1, 1]);

    const rowOffsets = cards.map(({ style }) =>
      Number(style.match(/translateY\(([-\d.]+)px\)/)?.[1]),
    );
    expect(new Set(rowOffsets).size).toBe(3);
    expect(rowOffsets[0]).toBeLessThan(rowOffsets[1]);
    expect(rowOffsets[1]).toBeLessThan(rowOffsets[2]);
  });

  it("brings all three reviews on early enough for a fair shared reading hold", () => {
    const cards = cardStyles(renderStack(0.4, 1080, 1920));
    const opacities = cards.map(({ style }) => Number(style.match(/opacity:([^;]+)/)?.[1]));

    expect(opacities).toHaveLength(3);
    expect(opacities.every((opacity) => opacity >= 0.95)).toBe(true);
  });
});
