/**
 * High-level, export-safe motion effects for project-owned scene templates.
 * available to project-owned scene templates through the motion entry point.
 *
 * Why this exists: handing a code-writing model raw CSS makes it reinvent
 * basics, badly. These helpers encode the craft moves of Remotion-grade
 * pieces (springy staggers, eased counters, layered glows, seeded particle
 * fields, path draws) as single calls the model composes.
 *
 * Hard rules — every helper in this file:
 *   - is PURE and DETERMINISTIC: same args → same output, always.
 *   - touches NO DOM, NO globals, NO Date/Math.random/timers.
 *   - is progress-driven: animation state comes in as `progress` (0..1).
 *   - emits only export-safe CSS: no `filter`, no transitions, no animations.
 *     (The export pipeline rasterizes SVG-as-image — see CLAUDE.md.)
 *
 * Naming is deliberately collision-resistant: multi-word identifiers a model
 * won't reach for as a loop variable (round-2 eval found `s`/`dim` shadowed
 * by `.map((s, si) => …)` params, producing NaN geometry).
 *
 * Keep every helper deterministic and compatible with the preview and export
 * paths.
 */

import type { CSSProperties } from "react";
import { cubicBezier } from "./curves";

export type EasingFn = (t: number) => number;

/**
 * Re-export of the canonical cubic-bezier solver (also `Easing.bezier`).
 * cubicBezier(0.16, 1, 0.3, 1) === EASE.crispEnter
 */
export { cubicBezier };

// ─── internals ───────────────────────────────────────────────────

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Hex → rgba with alpha. Non-hex colors pass through unchanged. */
function alpha(color: string, a: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color);
  if (!m) return color;
  const h = m[1];
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.round(clamp01(a) * 1000) / 1000})`;
}

// ─── timing / physics ────────────────────────────────────────────

/**
 * Named easing presets. Enter on the ease-OUT family, exit on ease-IN.
 * crispEnter / editorial / pop are the canonical VanillaSky curves from
 * docs/motion-library.md §1.
 */
export const EASE: Record<string, EasingFn> = {
  linear: (t) => t,
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  /** Decelerating overshoot — lands from beyond 1. Great for card arrivals. */
  outBack: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inQuad: (t) => t * t,
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  /** Pulls back below 0 before launching. Use for wind-up exits/entrances. */
  anticipate: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const c = 2.0;
    return t * t * ((c + 1) * t - c);
  },
  /** CRISP_ENTER — UI slide-ins, tight purposeful reveals. */
  crispEnter: cubicBezier(0.16, 1, 0.3, 1),
  /** EDITORIAL — calm holds, photo reveals, chart draws. */
  editorial: cubicBezier(0.45, 0, 0.55, 1),
  /** POP — stat pops, single-element arrivals with small overshoot. */
  pop: cubicBezier(0.34, 1.56, 0.64, 1),
};

/**
 * Remap scene progress to a local 0..1 inside a [start, end] window,
 * clamped, optionally eased. The backbone of multi-beat scenes.
 *
 * const t = phase(progress, [0.2, 0.6], EASE.crispEnter);
 */
export function phase(
  progress: number,
  window: readonly [number, number],
  easing?: EasingFn,
): number {
  const [start, end] = window;
  if (end <= start) return progress >= end ? 1 : 0;
  const t = clamp01((progress - start) / (end - start));
  return easing ? easing(t) : t;
}

export interface StaggerWindowOptions {
  /** 0 = strictly sequential, 1 = all items animate together. Default 0.6. */
  overlap?: number;
  /** Animation order: "start" (default), "end" (reverse), "center" (outward), "random" (seeded shuffle). */
  from?: "start" | "end" | "center" | "random";
  /** Seed for from: "random" — same seed → same order every frame. Default "stagger". */
  seed?: string | number;
  easing?: EasingFn;
}

/**
 * Per-item progress for staggered groups with OVERLAPPING windows — unlike
 * `stagger()`, which is delay-based. Item 0 starts at progress 0; the last
 * item ends exactly at 1, so the stagger always fills the scene.
 *
 * items.map((item, i) => {
 *   const t = staggerWindow(progress, i, items.length, { overlap: 0.6, easing: EASE.pop });
 *   return <div style={{ opacity: Math.min(1, t), transform: `translateY(${(1 - t) * 40}px)` }}>…</div>;
 * })
 */
export function staggerWindow(
  progress: number,
  index: number,
  count: number,
  options?: StaggerWindowOptions,
): number {
  const { overlap = 0.6, from = "start", seed = "stagger", easing } = options ?? {};
  const n = Math.max(1, Math.floor(count));
  const ov = clamp01(overlap);
  let order = Math.min(Math.max(index, 0), n - 1);
  if (from === "end") order = n - 1 - order;
  else if (from === "center") order = Math.abs(order - (n - 1) / 2) * 2;
  else if (from === "random") order = rand01(seed, order) * (n - 1);
  const widthFrac = 1 / (1 + (n - 1) * (1 - ov));
  const step = n > 1 ? (1 - widthFrac) / (n - 1) : 0;
  const t = clamp01((progress - order * step) / widthFrac);
  return easing ? easing(t) : t;
}

export interface PunchOptions {
  /** Progress at which the punch peaks. Default 0.5. */
  at?: number;
  /** Window width of the punch. Default 0.25. */
  width?: number;
  /** Peak extra scale, e.g. 0.12 → 1 → 1.12 → 1. Default 0.12. */
  amount?: number;
}

/**
 * A scale multiplier that bumps 1 → 1+amount → 1 around a moment.
 * Use for beat hits and emphasis: `transform: \`scale(${punch(progress, { at: 0.8 })})\``.
 */
export function punch(progress: number, options?: PunchOptions): number {
  const { at = 0.5, width = 0.25, amount = 0.12 } = options ?? {};
  if (width <= 0) return 1;
  const t = (progress - (at - width / 2)) / width;
  if (t <= 0 || t >= 1) return 1;
  return 1 + amount * Math.sin(t * Math.PI);
}

// ─── typography ──────────────────────────────────────────────────

export interface CascadeOptions {
  /** Split unit. Default "word". */
  by?: "word" | "char";
  /** Window overlap between items (see staggerWindow). Default 0.7. */
  overlap?: number;
  easing?: EasingFn;
  /** Entrance travel in px. Default 28. */
  distance?: number;
  /** Travel direction. Default "up" (rises into place). */
  direction?: "up" | "down";
  from?: "start" | "end" | "center";
}

export interface CascadeItem {
  /** The word or character. */
  item: string;
  /** Eased local progress 0..1 (may overshoot 1 with springy easings). */
  t: number;
  /** Ready-to-spread inline style: opacity + translate + scale punch-in. */
  style: CSSProperties;
}

/**
 * Per-word / per-char cascade — the word-cascade archetype as one call.
 * Returns ready-to-render spans:
 *
 * cascade(title, progress).map(({ item, style }, i) => (
 *   <span key={i} style={style}>{item}</span>
 * ))
 */
export function cascade(text: string, progress: number, options?: CascadeOptions): CascadeItem[] {
  const { by = "word", overlap = 0.7, easing = EASE.pop, distance = 28, direction = "up", from = "start" } =
    options ?? {};
  const items =
    by === "char" ? Array.from(String(text)) : String(text).split(/\s+/).filter((w) => w.length > 0);
  const n = items.length;
  const dir = direction === "down" ? -1 : 1;
  return items.map((item, i) => {
    const t = staggerWindow(progress, i, n, { overlap, from, easing });
    const style: CSSProperties = {
      display: "inline-block",
      whiteSpace: "pre",
      opacity: clamp01(t * 1.4),
      transform: `translateY(${((1 - t) * distance * dir).toFixed(2)}px) scale(${(0.88 + 0.12 * t).toFixed(3)})`,
      ...(by === "word" && i < n - 1 ? { marginRight: "0.26em" } : null),
    };
    return { item, t, style };
  });
}

export interface TypewriterOptions {
  /**
   * Progress range over which typing happens (held after). Default [0, 0.7].
   * (Named `range`, not `window` — the validator bans the `window` token.)
   */
  range?: readonly [number, number];
  easing?: EasingFn;
  /** Cursor blinks per scene. Default 6. Set 0 to hide. */
  blinks?: number;
}

export interface TypewriterResult {
  /** The visible slice — render this directly. */
  text: string;
  /** True when the block cursor should be visible this frame. */
  cursorOn: boolean;
  done: boolean;
}

/**
 * Typewriter via string slicing (never per-char opacity — it reads as fade,
 * not typing). Deterministic blink derived from progress.
 *
 * const tw = typewriter(cmd, progress);
 * <span>{tw.text}{tw.cursorOn ? "▋" : " "}</span>
 */
export function typewriter(text: string, progress: number, options?: TypewriterOptions): TypewriterResult {
  const { range: win = [0, 0.7], easing = EASE.linear, blinks = 6 } = options ?? {};
  const chars = Array.from(String(text));
  const t = phase(progress, win, easing);
  const visible = t >= 1 ? chars.length : Math.floor(t * chars.length);
  const done = visible >= chars.length;
  const cursorOn = blinks > 0 && Math.floor(clamp01(progress) * blinks * 2) % 2 === 0;
  return { text: chars.slice(0, visible).join(""), cursorOn, done };
}

export interface CountUpOptions {
  start?: number;
  /** Decimal places. Defaults to 1 if target is non-integer, else 0. */
  decimals?: number;
  easing?: EasingFn;
  /** "plain" → 12,847 · "compact" → 12.8K. Default "plain". */
  format?: "plain" | "compact";
  prefix?: string;
  suffix?: string;
}

export interface CountUpResult {
  value: number;
  /** Formatted display string including prefix/suffix. */
  text: string;
  /** Scale multiplier with a landing punch near the end — apply via transform. */
  scale: number;
}

/**
 * Eased counter with deterministic formatting (no locale dependence) and a
 * scale punch as the number lands.
 *
 * const { text, scale } = countUp(progress, 12847, { format: "compact", suffix: " users" });
 * <div style={{ transform: `scale(${scale})` }}>{text}</div>
 */
export function countUp(progress: number, target: number, options?: CountUpOptions): CountUpResult {
  const {
    start = 0,
    easing = EASE.outExpo,
    format = "plain",
    prefix = "",
    suffix = "",
  } = options ?? {};
  const decimals = options?.decimals ?? (Number.isInteger(target) ? 0 : 1);
  const e = easing(clamp01(progress));
  const value = start + (target - start) * e;
  let body: string;
  if (format === "compact" && Math.abs(value) >= 1000) {
    const units: Array<[number, string]> = [
      [1e9, "B"],
      [1e6, "M"],
      [1e3, "K"],
    ];
    const [div, unit] = units.find(([d]) => Math.abs(value) >= d) as [number, string];
    const scaled = value / div;
    body = `${(Math.round(scaled * 10) / 10).toFixed(Math.abs(scaled) >= 100 ? 0 : 1)}${unit}`;
  } else {
    const fixed = value.toFixed(decimals);
    const [int, frac] = fixed.split(".");
    const sign = int.startsWith("-") ? "-" : "";
    const digits = sign ? int.slice(1) : int;
    let grouped = "";
    for (let i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 === 0) grouped += ",";
      grouped += digits[i];
    }
    body = `${sign}${grouped}${frac ? `.${frac}` : ""}`;
  }
  const scale = punch(progress, { at: 0.88, width: 0.24, amount: 0.08 });
  return { value, text: `${prefix}${body}${suffix}`, scale };
}

// ─── layout ──────────────────────────────────────────────────────

/**
 * Absolute-center an element at (xPct%, yPct%) of its container — the
 * translate(-50%,-50%) idiom done right. Extra transforms compose AFTER
 * the centering translate so scale/rotate don't break the anchor.
 *
 * <div style={{ ...center(50, 42, `scale(${pop})`), width: 600 }}>…</div>
 */
export function center(xPct = 50, yPct = 50, extraTransform = ""): CSSProperties {
  return {
    position: "absolute",
    left: `${xPct}%`,
    top: `${yPct}%`,
    transform: `translate(-50%, -50%)${extraTransform ? ` ${extraTransform}` : ""}`,
  };
}

// ─── light / depth (no CSS filter — export-safe) ─────────────────

export interface GlowOptions {
  /** Diameter in px — scale with sceneScale, e.g. 520 * sceneScale. Default 480. */
  size?: number;
  /** CSS position of the glow center. Defaults "50%" / "50%". */
  x?: string;
  y?: string;
  /** Core opacity 0..1. Default 0.4. */
  intensity?: number;
}

/**
 * A layered radial-gradient glow blob (absolutely positioned, pointer-inert).
 * The export-safe replacement for `filter: blur()` light.
 *
 * <div style={glow(accent, { size: 600 * sceneScale, y: "42%" })} />
 */
export function glow(color: string, options?: GlowOptions): CSSProperties {
  const { size = 480, x = "50%", y = "50%", intensity = 0.4 } = options ?? {};
  return {
    position: "absolute",
    left: x,
    top: y,
    width: size,
    height: size,
    transform: "translate(-50%, -50%)",
    borderRadius: "50%",
    pointerEvents: "none",
    // `closest-side` — the default (farthest-corner) only reaches transparent at
    // the box edge, so a large bloom can show a faint rectangular seam.
    background: `radial-gradient(circle closest-side, ${alpha(color, intensity)} 0%, ${alpha(
      color,
      intensity * 0.45,
    )} 32%, transparent 72%)`,
  };
}

/**
 * Layered box-shadow stack for believable depth (single shadows look flat).
 * elevation 1 (card resting) … 5 (floating hero). Returns the boxShadow string.
 */
export function softShadow(elevation = 3, color = "#000"): string {
  const e = Math.min(5, Math.max(1, elevation));
  return [
    `0 ${2 * e}px ${4 * e}px ${alpha(color, 0.16)}`,
    `0 ${6 * e}px ${16 * e}px ${alpha(color, 0.2)}`,
    `0 ${12 * e}px ${40 * e}px ${alpha(color, 0.24)}`,
  ].join(", ");
}

/**
 * Full-bleed darkened-edges overlay (focus pull). strength 0..1.
 * Render LAST inside the body so it sits above content, or depth "foreground".
 */
export function vignette(strength = 0.5): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background: `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 52%, rgba(0,0,0,${
      Math.round(clamp01(strength) * 100) / 100
    }) 100%)`,
  };
}

/**
 * Deterministic mesh-gradient background string — 2-4 colors as soft radial
 * blobs at seeded positions over a base layer. Use as `background`.
 *
 * background: meshGradient([accent, secondary, "#1a1040"], "hero")
 */
export function meshGradient(colors: string[], seed: string | number = 1): string {
  const list = colors.length > 0 ? colors.slice(0, 4) : ["#222"];
  const layers = list.map((c, i) => {
    const cx = Math.round(12 + rand01(seed, i * 3) * 76);
    const cy = Math.round(10 + rand01(seed, i * 3 + 1) * 80);
    const r = Math.round(40 + rand01(seed, i * 3 + 2) * 35);
    return `radial-gradient(circle at ${cx}% ${cy}%, ${alpha(c, 0.85)} 0%, transparent ${r}%)`;
  });
  layers.push(`linear-gradient(180deg, ${alpha(list[0], 0.5)} 0%, rgba(0,0,0,0.9) 100%)`);
  return layers.join(", ");
}

/**
 * Film-grain texture overlay — a pre-rasterized 96×96 seeded-noise PNG tile
 * (data URI). Why PNG and not SVG feTurbulence: SVG <filter> elements do NOT
 * execute when a data-URI SVG is rasterized inside the export pipeline's
 * SVG-as-image pass. PNG data URIs render identically in
 * preview and export.
 *
 * The tile was generated once from rand01("vanillasky-grain", i) — fully
 * deterministic. `seed` shifts the tile offset so layered grains never align.
 */
const GRAIN_TILE_PX = 96;
const GRAIN_TILE_URI =
  "data:image/png;base64," +
  "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";

export function grain(opacity = 0.08, seed: string | number = 2): CSSProperties {
  const ox = Math.floor(rand01(seed, 0) * GRAIN_TILE_PX);
  const oy = Math.floor(rand01(seed, 1) * GRAIN_TILE_PX);
  return {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    opacity: clamp01(opacity),
    backgroundImage: `url("${GRAIN_TILE_URI}")`,
    backgroundRepeat: "repeat",
    backgroundPosition: `${ox}px ${oy}px`,
    backgroundSize: `${GRAIN_TILE_PX}px ${GRAIN_TILE_PX}px`,
  };
}

export interface DriftOptions {
  /** Total x travel in px over the scene. Default 0. */
  x?: number;
  /** Total y travel in px over the scene. Default 0. */
  y?: number;
  easing?: EasingFn;
  /** Extra transform appended after the drift translate. */
  extraTransform?: string;
}

/**
 * Slow continuous travel — returns a transform string. Layer different
 * x/y per element for parallax depth (background drifts less than focal).
 *
 * transform: drift(progress, { y: -40 * sceneScale })
 */
export function drift(progress: number, options?: DriftOptions): string {
  const { x = 0, y = 0, easing = EASE.editorial, extraTransform = "" } = options ?? {};
  const e = easing(clamp01(progress));
  return `translate(${(x * e).toFixed(2)}px, ${(y * e).toFixed(2)}px)${
    extraTransform ? ` ${extraTransform}` : ""
  }`;
}

// ─── shape / SVG ─────────────────────────────────────────────────

/**
 * Stroke draw-on for SVG paths/circles/polylines. Pass the path length
 * (circle: 2πr). Spread onto the SVG element's style or attributes.
 *
 * <path d="…" style={{ ...pathDraw(progress, 1200), stroke: accent, fill: "none" }} />
 */
export function pathDraw(
  progress: number,
  pathLength: number,
  easing: EasingFn = EASE.editorial,
): { strokeDasharray: number; strokeDashoffset: number } {
  const e = easing(clamp01(progress));
  return { strokeDasharray: pathLength, strokeDashoffset: pathLength * (1 - e) };
}

export interface OrbitOptions {
  /** Orbit center. */
  cx: number;
  cy: number;
  radius: number;
  /** Full revolutions over the scene. Default 1. */
  turns?: number;
  /** Start angle in degrees, -90 = 12 o'clock. Default -90. */
  startDeg?: number;
  clockwise?: boolean;
}

/**
 * Position on a circular orbit at the given progress.
 * Returns { x, y, deg } — deg is the current angle (use for rotate()).
 */
export function orbit(progress: number, options: OrbitOptions): { x: number; y: number; deg: number } {
  const { cx, cy, radius, turns = 1, startDeg = -90, clockwise = true } = options;
  const deg = startDeg + (clockwise ? 1 : -1) * clamp01(progress) * turns * 360;
  const rad = (deg * Math.PI) / 180;
  return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius, deg };
}

/**
 * Interpolate between two same-length point lists → SVG `points` string
 * for <polygon>/<polyline> morphs.
 *
 * <polygon points={morph(progress, triangle, star, EASE.crispEnter)} fill={accent} />
 */
export function morph(
  progress: number,
  fromPoints: ReadonlyArray<readonly [number, number]>,
  toPoints: ReadonlyArray<readonly [number, number]>,
  easing: EasingFn = EASE.inOutCubic,
): string {
  const e = easing(clamp01(progress));
  const n = Math.min(fromPoints.length, toPoints.length);
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = fromPoints[i][0] + (toPoints[i][0] - fromPoints[i][0]) * e;
    const y = fromPoints[i][1] + (toPoints[i][1] - fromPoints[i][1]) * e;
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(" ");
}

export type SweepDirection = "left" | "right" | "up" | "down" | "open";

/**
 * Masked wipe reveal via clip-path inset (verified export-safe).
 * "left" reveals left→right, "open" reveals center-out.
 *
 * <div style={{ ...sweep(progress, "left"), position: "relative" }}>…</div>
 */
export function sweep(
  progress: number,
  direction: SweepDirection = "left",
  easing: EasingFn = EASE.crispEnter,
): { clipPath: string } {
  const e = clamp01(easing(clamp01(progress)));
  const rest = ((1 - e) * 100).toFixed(2);
  switch (direction) {
    case "right":
      return { clipPath: `inset(0% 0% 0% ${rest}%)` };
    case "up":
      return { clipPath: `inset(${rest}% 0% 0% 0%)` };
    case "down":
      return { clipPath: `inset(0% 0% ${rest}% 0%)` };
    case "open":
      return { clipPath: `inset(0% ${(parseFloat(rest) / 2).toFixed(2)}% 0% ${(parseFloat(rest) / 2).toFixed(2)}%)` };
    case "left":
    default:
      return { clipPath: `inset(0% ${rest}% 0% 0%)` };
  }
}

// ─── particles ───────────────────────────────────────────────────

/**
 * Deterministic pseudo-random 0..1 from a seed + stream index.
 * FNV-1a + avalanche — same (seed, index) always yields the same value.
 * THE replacement for Math.random in custom scenes.
 */
export function rand01(seed: string | number, index = 0): number {
  let h = 2166136261 >>> 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h = (h + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface ParticlesOptions {
  /** "float" ambient bobbing · "rise" upward stream · "rain" downward. Default "float". */
  mode?: "float" | "rise" | "rain";
  /** Travel speed multiplier. Default 1. */
  speed?: number;
  /** Particle size range in px (scale with sceneScale at call site). Default [4, 10]. */
  sizeRange?: readonly [number, number];
}

export interface Particle {
  /** Position as 0..1 fractions of the field — multiply by width/height. */
  x: number;
  y: number;
  /** Size in px (from sizeRange). */
  size: number;
  /** 0..1 — already fades near field edges, no popping. */
  opacity: number;
  /** Degrees. */
  rotation: number;
}

/**
 * Seeded ambient particle field. Deterministic: same (count, seed, progress)
 * → identical field. Map to absolutely-positioned divs:
 *
 * particles(progress, 24, "stars").map((p, i) => (
 *   <div key={i} style={{ position: "absolute", left: p.x * width, top: p.y * height,
 *     width: p.size, height: p.size, borderRadius: "50%", background: accent, opacity: p.opacity }} />
 * ))
 */
export function particles(
  progress: number,
  count: number,
  seed: string | number,
  options?: ParticlesOptions,
): Particle[] {
  const { mode = "float", speed = 1, sizeRange = [4, 10] } = options ?? {};
  const p = clamp01(progress);
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const baseX = rand01(seed, i * 7);
    const baseY = rand01(seed, i * 7 + 1);
    const sizeT = rand01(seed, i * 7 + 2);
    const phase0 = rand01(seed, i * 7 + 3);
    const wobble = 0.015 + rand01(seed, i * 7 + 4) * 0.025;
    const x = baseX + Math.sin((p * speed + phase0) * Math.PI * 3) * wobble;
    let y: number;
    if (mode === "rise") y = (((baseY - p * speed * 0.35) % 1) + 1) % 1;
    else if (mode === "rain") y = (baseY + p * speed * 0.35) % 1;
    else y = baseY + Math.sin((p * speed + phase0) * Math.PI * 2) * wobble * 1.5;
    const edgeFade = clamp01(Math.sin(Math.PI * clamp01(y)) * 2);
    out.push({
      x,
      y,
      size: sizeRange[0] + (sizeRange[1] - sizeRange[0]) * sizeT,
      opacity: edgeFade * (0.45 + 0.55 * rand01(seed, i * 7 + 5)),
      rotation: (phase0 * 360 + p * speed * 240) % 360,
    });
  }
  return out;
}

export interface BurstOptions {
  /** Cone width in degrees. Default 360 (full radial burst). */
  spreadDeg?: number;
  /** Cone center direction in degrees, -90 = up. Default -90. */
  originDeg?: number;
  /** Downward pull applied over time (0 = none). Default 0.35. */
  gravity?: number;
  easing?: EasingFn;
}

export interface BurstParticle {
  /** Offset from origin in UNIT radius — multiply by px radius at call site. */
  dx: number;
  dy: number;
  rotation: number;
  scale: number;
  opacity: number;
}

/**
 * Seeded radial burst (confetti / celebration). Particles fly outward from a
 * shared origin as progress runs 0→1, with gravity and a fade tail.
 *
 * burst(phase(progress, [0.55, 1]), 32, "confetti").map((b, i) => (
 *   <div key={i} style={{ position: "absolute",
 *     left: width / 2 + b.dx * minDim * 0.42, top: height * 0.45 + b.dy * minDim * 0.42,
 *     width: 12, height: 12, background: i % 2 ? accent : secondary,
 *     opacity: b.opacity, transform: `rotate(${b.rotation}deg) scale(${b.scale})` }} />
 * ))
 */
export function burst(
  progress: number,
  count: number,
  seed: string | number,
  options?: BurstOptions,
): BurstParticle[] {
  const { spreadDeg = 360, originDeg = -90, gravity = 0.35, easing = EASE.outCubic } = options ?? {};
  const e = easing(clamp01(progress));
  const out: BurstParticle[] = [];
  for (let i = 0; i < count; i++) {
    const jitter = rand01(seed, i * 5) * 0.8;
    const angleDeg = originDeg - spreadDeg / 2 + (spreadDeg * (i + jitter)) / Math.max(1, count);
    const rad = (angleDeg * Math.PI) / 180;
    const dist = e * (0.5 + 0.5 * rand01(seed, i * 5 + 1));
    out.push({
      dx: Math.cos(rad) * dist,
      dy: Math.sin(rad) * dist + gravity * e * e,
      rotation: (rand01(seed, i * 5 + 2) * 720 * e) % 360,
      scale: 1 - 0.45 * e * rand01(seed, i * 5 + 3),
      opacity: e < 0.7 ? 1 : clamp01((1 - e) / 0.3),
    });
  }
  return out;
}
