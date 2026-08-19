/**
 * Color utilities for scene templates.
 *
 * Provides safe color manipulation that works with hex colors
 * and graceful fallbacks for non-hex inputs.
 */
import React from "react";
import { resolveTokens, darken, orderDarkToLight, type BackgroundFamily } from "../theme";

// ─── Layout constants ───────────────────────────────────────
//
// Shared vertical layout for templates that place a TextOverlay at the top of
// the scene (showcase-*, chart-*, infographic-*). Using a single constant
// guarantees the headline sits in the same place across every template, so
// scene-to-scene cuts don't visually jump.
//
// TextOverlay vertically centers itself inside its container, so the visual
// midline of the headline = TOP_TEXT_AREA_RATIO / 2 of the scene height.
export const TOP_TEXT_AREA_RATIO = 0.32;

/**
 * Gradient background — clean 2-color linear gradient with a subtle
 * animated breathing overlay. Matches the look of a plain CSS
 * `linear-gradient(90deg, colorA, colorB)` so palette chips preview
 * exactly what templates render.
 *
 * The animation is deliberately minimal: two low-opacity radial blobs
 * of the same two colors drift slowly, adding just enough motion for
 * video without introducing a third "midtone" color that muddies
 * the gradient (a common source of unwanted purple/brown tints).
 */
export function gradientBackground({
  colorA,
  colorB,
  solidBg,
  progress,
  sceneDuration,
  seed,
  family,
}: {
  colorA: string;
  colorB: string;
  /**
   * When set, the function returns this color as a solid background
   * (no gradient, no animated radial overlays). Used when the user has
   * a scraped brand whose darkest color reads as a real surface — the
   * accent stays on text/CTAs, but the bg goes flat instead of pairing
   * with an unrelated brand color and producing a noisy gradient.
   */
  solidBg?: string;
  progress: number;
  sceneDuration?: number;
  seed: number;
  /**
   * Background family from the style preset. Omitted = "mesh", the original
   * look — so existing configs are untouched. All families are pure CSS
   * background strings (no `filter`, which the SVG export can't rasterize)
   * and stay deterministic in `progress`.
   */
  family?: BackgroundFamily;
}): string {
  if (solidBg) return solidBg;
  // Every scene owns its foreground motion clock, but consecutive scenes that
  // use the same brand backdrop must not visibly reset that backdrop. Run one
  // eased closed loop per scene: the gradient has zero velocity and the exact
  // same pixels at progress 0 and 1, regardless of scene duration or content
  // seed. Seeded variation is strongest mid-scene and converges to zero at
  // both handoff edges.
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  const atBoundary = normalizedProgress === 0 || normalizedProgress === 1;
  const easedLoop = normalizedProgress * normalizedProgress * (3 - 2 * normalizedProgress);
  const seedEnvelope = atBoundary ? 0 : Math.sin(normalizedProgress * Math.PI) ** 2;
  void sceneDuration;

  const seededRandom = (s: number): number => {
    const x = Math.sin(s * 12.9898 + s * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const phase = seededRandom(seed) * Math.PI * 2 * seedEnvelope;
  const t = (atBoundary ? 0 : easedLoop * Math.PI * 2) + phase;

  // Darker of the two colors anchors the top of the frame so text and logos
  // sit over the stronger value. 180deg = top→bottom.
  const [topColor, bottomColor] = orderDarkToLight(colorA, colorB);

  if (family === "wash") {
    // No radials: one calm vertical ramp that drifts a few percent over the
    // scene. Reads considered rather than energetic.
    const shift = Math.sin(t) * 6;
    return `linear-gradient(${175 + shift}deg, ${topColor} 0%, ${bottomColor} 100%)`;
  }

  if (family === "spotlight") {
    // A single hard pool of accent high in the frame over a near-black
    // surround — high contrast, very little colour area.
    const x = 50 + Math.sin(t) * 8;
    const y = 28 + Math.cos(t + 1) * 5;
    return `
      radial-gradient(ellipse 70% 55% at ${x}% ${y}%, ${colorA}66 0%, ${colorA}1a 45%, transparent 72%),
      linear-gradient(180deg, ${darken(topColor, 0.55)} 0%, ${darken(bottomColor, 0.7)} 100%)
    `;
  }

  const x1 = 25 + Math.sin(t) * 25;
  const y1 = 30 + Math.cos(t + 1.0) * 25;
  const x2 = 75 + Math.sin(t + 2.0) * 25;
  const y2 = 70 + Math.cos(t + 3.5) * 25;

  return `
    radial-gradient(ellipse 60% 60% at ${x1}% ${y1}%, ${colorA}4d 0%, transparent 65%),
    radial-gradient(ellipse 60% 60% at ${x2}% ${y2}%, ${colorB}4d 0%, transparent 65%),
    linear-gradient(180deg, ${topColor} 0%, ${bottomColor} 100%)
  `;
}

/**
 * Animated brand-background overlay. Foreground semantic colours never alter
 * this visual background.
 */
export const BrandGradientOverlay: React.FC<{
  style: Parameters<typeof resolveTokens>[0];
  progress: number;
  sceneDuration?: number;
  seed: number;
}> = ({ style: globalStyle, progress, sceneDuration, seed }) => {
  const tokens = resolveTokens(globalStyle);
  const [first, second] = tokens.background.type === "gradient"
    ? tokens.background.colors
    : [tokens.background.color, tokens.background.color];
  const solidBg = tokens.background.type === "solid" ? tokens.background.color : undefined;

  return React.createElement("div", {
    style: {
      position: "absolute" as const,
      inset: 0,
      background: gradientBackground({ colorA: first, colorB: second, solidBg, progress, sceneDuration, seed, family: tokens.preset.background }),
      pointerEvents: "none" as const,
    },
  });
};
