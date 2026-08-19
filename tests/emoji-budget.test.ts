import { existsSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Emoji } from "../src/visual-system/emoji";
import { planTypewriterEmoji, renderWithEmoji } from "../src/visual-system/emoji/emoji-text";

describe("native emoji rendering", () => {
  it("uses the viewer's familiar operating-system emoji font", () => {
    const markup = renderToStaticMarkup(createElement(Emoji, { char: "🎉", size: 48 }));

    expect(markup).toContain("🎉");
    expect(markup).toContain("font-family:Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif");
    expect(markup).not.toContain("<img");
  });

  it("keeps text-presentation symbols in the surrounding font", () => {
    const markup = renderToStaticMarkup(
      createElement(
        "span",
        null,
        createElement(Emoji, { char: "✦", size: 48 }),
        ...renderWithEmoji(" ★ ✓ 🎉", 48),
      ),
    );

    expect(markup.match(/role="img"/g)).toHaveLength(1);
    expect(markup.match(/font-family:/g)).toHaveLength(1);
    expect(markup).toContain(">✦</span> ★ ✓ ");
  });

  it("recognizes native emoji sequences", () => {
    const text = "⭐ ✨ ✅ 👩‍💻 👍🏽 🇳🇱 1️⃣";
    const markup = renderToStaticMarkup(createElement("span", null, ...renderWithEmoji(text, 48)));

    expect(markup.match(/role="img"/g)).toHaveLength(7);
  });

  it("keeps joined emoji intact in typewriter text", () => {
    const emoji = "👩‍💻";
    const plan = planTypewriterEmoji(`${emoji} ships`);

    expect(plan?.starts.get(0)).toBe(emoji);
    expect(plan?.covered.size).toBe(emoji.length - 1);
  });

  it("does not bundle a generated emoji artwork map", () => {
    for (const relative of [
      "src/visual-system/emoji/emoji-map.generated.ts",
      "registry/assets/emoji-map.generated.ts",
      "scripts/curate-emoji-map.mjs",
    ]) {
      expect(existsSync(join(process.cwd(), relative)), relative).toBe(false);
    }
  });
});
