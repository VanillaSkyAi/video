import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { VideoStyle } from "../src";
import { BUILTIN_TEMPLATE_SCHEMAS } from "../src/visual-system/scene-templates/schemas";

function cssValue(styleText: string, property: string): string {
  const value = styleText.match(new RegExp(`(?:^|;)${property}:([^;]+)`))?.[1];
  if (!value) throw new Error(`Missing ${property} in rendered style: ${styleText}`);
  return value;
}

function renderedRgb(color: string, backdrop: string): [number, number, number] {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((offset) =>
    Number.parseInt(hex[1].slice(offset, offset + 2), 16)) as [number, number, number];
  const rgba = color.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);
  if (!rgba) throw new Error(`Unsupported rendered color: ${color}`);
  const backdropRgb = renderedRgb(backdrop, "#000000");
  const alpha = Number(rgba[4]);
  return [1, 2, 3].map((index) =>
    Number(rgba[index]) * alpha + backdropRgb[index - 1] * (1 - alpha)) as [number, number, number];
}

function renderedContrast(first: string, second: string, backdrop: string): number {
  const luminance = (color: string) => {
    const channels = renderedRgb(color, backdrop).map((value) => {
      const encoded = value / 255;
      return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);
}

const style: VideoStyle = {
  brand: {
    name: "Acme",
    logoUrl: "https://cdn.example.com/acme.svg",
    font: "Geist",
    scriptFont: "Caveat",
    background: { type: "solid", color: "#102030" },
    colors: {
      primary: "#FF3366",
      secondary: "#33CCAA",
      foreground: "#F8FAFC",
      surface: "#101827",
      surfaceElevated: "#1E293B",
      muted: "#94A3B8",
    },
  },
};

describe("semantic brand flow", () => {
  it("maps the already-resolved brand to semantic template tokens without deriving another palette", async () => {
    const { resolveTokens } = await import("../src/visual-system/scene-templates/tokens");

    expect(resolveTokens(style)).toMatchObject({
      primary: "#FF3366",
      secondary: "#33CCAA",
      foreground: "#F8FAFC",
      surface: "#101827",
      surfaceElevated: "#1E293B",
      muted: "#94A3B8",
      font: 'Geist, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif',
      scriptFont: "Caveat",
      logoUrl: "https://cdn.example.com/acme.svg",
      name: "Acme",
      background: { type: "solid", color: "#102030" },
    });
  });

  it("renders host-owned identity in closers without model-authored brandName", async () => {
    const [{ CtaLogoTemplate }, { BrandMessageTemplate }] = await Promise.all([
      import("../src/visual-system/scene-templates/cta-logo"),
      import("../src/visual-system/scene-templates/brand-message"),
    ]);
    const shared = {
      style,
      progress: 0.8,
      beatIntensity: 0,
      width: 1080,
      height: 1920,
      safeZone: { top: 100, right: 80, bottom: 100, left: 80 },
      sceneDuration: 4,
    };
    const closer = renderToStaticMarkup(createElement(CtaLogoTemplate, {
      ...shared,
      variables: { url: "acme.test", cta: "Start now" },
    }));
    const message = renderToStaticMarkup(createElement(BrandMessageTemplate, {
      ...shared,
      variables: { message: "We built this for you." },
    }));

    expect(closer).toContain("Acme");
    expect(closer).toContain("https://cdn.example.com/acme.svg");
    expect(message).toContain("Acme");
  });

  it("renders main and elevated-surface text accessibly for a light brand", async () => {
    const [{ IncomingCallTemplate }, { SocialMilestoneTemplate }, { SocialTestimonialTemplate }, { SocialReviewStackTemplate }] = await Promise.all([
      import("../src/visual-system/scene-templates/incoming-call"),
      import("../src/visual-system/scene-templates/social-milestone"),
      import("../src/visual-system/scene-templates/social-testimonial"),
      import("../src/visual-system/scene-templates/social-review-stack"),
    ]);
    const lightStyle: VideoStyle = {
      brand: {
        name: "Light Brand",
        font: "Inter",
        scriptFont: "Caveat",
        background: { type: "solid", color: "#F8FAFC" },
        colors: {
          primary: "#5B3FD6",
          secondary: "#0F766E",
          foreground: "#111827",
          surface: "#FFFFFF",
          surfaceElevated: "#F8FAFC",
          muted: "#475569",
        },
      },
    };
    const shared = {
      style: lightStyle,
      progress: 0.8,
      beatIntensity: 0,
      width: 1080,
      height: 1920,
      safeZone: { top: 100, right: 80, bottom: 100, left: 80 },
      sceneDuration: 4,
      isPlaying: false,
    };
    const renders = {
      incomingCall: renderToStaticMarkup(createElement(IncomingCallTemplate, {
        ...shared,
        variables: { callerName: "Acme Support", subtitle: "Incoming call" },
      })),
      milestone: renderToStaticMarkup(createElement(SocialMilestoneTemplate, {
        ...shared,
        variables: { targetNumber: 10_000, label: "Followers", badgeText: "10K Followers!" },
      })),
      testimonial: renderToStaticMarkup(createElement(SocialTestimonialTemplate, {
        ...shared,
        variables: { quote: "Easy to use", authorName: "Maya", authorRole: "Designer" },
      })),
      reviewStack: renderToStaticMarkup(createElement(SocialReviewStackTemplate, {
        ...shared,
        variables: {
          review1Title: "Fast to launch",
          review1Body: "We shipped today.",
          review1Author: "Maya",
        },
      })),
    };

    for (const [templateId, markup] of Object.entries(renders)) {
      expect(markup, `${templateId} should render the light brand's accessible foreground`).toContain("color:#111827");
    }
    expect(renders.testimonial).toContain("color:#475569");
    expect(renders.reviewStack).toContain("color:#475569");

    const pill = renders.milestone.match(
      /<div style="([^"]*background-color:[^"]*border:1px solid rgba\(255,255,255,0\.15\)[^"]*)"[^>]*>[\s\S]*?<span style="([^"]*color:[^"]*)"/,
    );
    expect(pill, "milestone should render its celebration pill").not.toBeNull();
    const pillBackground = cssValue(pill?.[1] || "", "background-color");
    const pillText = cssValue(pill?.[2] || "", "color");
    expect(renderedContrast(pillBackground, pillText, "#F8FAFC")).toBeGreaterThanOrEqual(4.5);
  });

  it("derives safe elevated-surface text without changing the main semantic foreground", async () => {
    const [{ SocialTestimonialTemplate }, { SocialReviewStackTemplate }] = await Promise.all([
      import("../src/visual-system/scene-templates/social-testimonial"),
      import("../src/visual-system/scene-templates/social-review-stack"),
    ]);
    const styleWithLightSurfaces: VideoStyle = {
      brand: {
        ...style.brand,
        background: { type: "solid", color: "#111827" },
        colors: {
          ...style.brand.colors,
          foreground: "#FFFFFF",
          surface: "#FFFFFF",
          surfaceElevated: "#F8FAFC",
          muted: "#475569",
        },
      },
    };
    const shared = {
      style: styleWithLightSurfaces,
      progress: 0.8,
      beatIntensity: 0,
      width: 1080,
      height: 1920,
      safeZone: { top: 100, right: 80, bottom: 100, left: 80 },
      sceneDuration: 4,
      isPlaying: false,
    };
    const testimonial = renderToStaticMarkup(createElement(SocialTestimonialTemplate, {
      ...shared,
      variables: { quote: "Readable surface", authorName: "Maya" },
    }));
    const reviewStack = renderToStaticMarkup(createElement(SocialReviewStackTemplate, {
      ...shared,
      variables: { review1Title: "Readable card", review1Author: "Maya" },
    }));

    expect(testimonial).toContain("color:#000000");
    expect(reviewStack).toContain("color:#000000");
    expect(styleWithLightSurfaces.brand.colors.foreground).toBe("#FFFFFF");
  });

  it("removes raw visual styling and duplicated identity from every planner-facing built-in schema", () => {
    const forbidden = [
      "textColor",
      "chartColor",
      "badgeColor",
      "starColor",
      "avatarColor",
      "pillBg",
      "pillTextColor",
    ];
    for (const [id, schema] of Object.entries(BUILTIN_TEMPLATE_SCHEMAS)) {
      for (const field of forbidden) {
        expect(schema.properties, `${id} should not expose ${field}`).not.toHaveProperty(field);
      }
    }
    for (const id of ["ctaLogo", "brandMessage"] as const) {
      const schema = BUILTIN_TEMPLATE_SCHEMAS[id];
      expect(schema.properties).not.toHaveProperty("brandName");
      expect("required" in schema ? schema.required : []).not.toContain("brandName");
    }
  });

  it("keeps generated metadata and planner prompts free of removed styling fields", async () => {
    const [{ GENERATED_BUILTIN_TEMPLATE_CATALOG }, { createTemplateSystemPrompt }, { loadAcceptanceKit }] = await Promise.all([
      import("../src/visual-system/catalog/catalog.generated"),
      import("../src/visual-system/catalog/prompt"),
      import("../scripts/acceptance/catalog"),
    ]);
    const serialized = JSON.stringify(GENERATED_BUILTIN_TEMPLATE_CATALOG);
    const prompt = createTemplateSystemPrompt({ kit: loadAcceptanceKit() });
    for (const field of [
      "textColor",
      "chartColor",
      "badgeColor",
      "starColor",
      "avatarColor",
      "pillBg",
      "pillTextColor",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
      expect(prompt).not.toContain(`"${field}"`);
    }
  });

  it("has no obsolete brand API in the protocol, composition, player, template context, or docs", () => {
    const files = [
      "src/protocol/types.ts",
      "src/protocol/background.ts",
      "src/protocol/validation.ts",
      "src/server/compose-video.ts",
      "src/player/video-frame.tsx",
      "src/player/video-player.tsx",
      "src/visual-system/template-context.ts",
      "src/visual-system/scene-templates/tokens.ts",
      "docs/branding-and-personalization.md",
      "docs/customization.md",
      "scripts/acceptance/fixtures.ts",
      "scripts/verify-packed-package.mjs",
    ];
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
    for (const obsolete of [
      "brandKit",
      "logoDataUrl",
      "surface_elevated",
      "script_font",
      "backgroundOverride",
      "brand.kit",
    ]) {
      expect(source).not.toContain(obsolete);
    }
    const contract = [
      readFileSync("src/protocol/types.ts", "utf8"),
      readFileSync("src/protocol/background.ts", "utf8"),
      readFileSync("src/visual-system/template-context.ts", "utf8"),
    ].join("\n");
    for (const obsolete of ["accent", "vibe", "sourceUrl"]) {
      expect(contract).not.toMatch(new RegExp(`\\b${obsolete}\\b`));
    }
  });
});
