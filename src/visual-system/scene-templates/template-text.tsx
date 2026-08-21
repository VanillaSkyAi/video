/**
 * TemplateText — unified text component for scene templates.
 *
 * Replaces the per-template hand-rolled text rendering with a single component
 * that owns: archetype motion lifecycle (entrance + hold + exit), font sizing,
 * position, beat pulse, and safe zone.
 *
 * Each template declares its constraints (position + sizeRole) at the call site;
 * the user/AI picks the archetype. Templates that can only show text at the top
 * just always pass position="top".
 *
 * Example — a data template (caption above a chart):
 *
 *   <TemplateText
 *     archetype={textArchetype}
 *     text={variables.title}
 *     progress={progress}
 *     sceneDuration={sceneDuration}
 *     width={width}
 *     height={height}
 *     position="top"
 *     sizeRole="caption"
 *   />
 *
 * Example — a media template (full-frame headline):
 *
 *   <TemplateText
 *     archetype={textArchetype}
 *     text={variables.headline}
 *     progress={progress}
 *     sceneDuration={sceneDuration}
 *     width={width}
 *     height={height}
 *     position="center"
 *     sizeRole="headline"
 *     beatIntensity={beatIntensity}
 *   />
 *
 * Note: `textArchetype` is destructured from props (a scene-level
 * field on `SceneTemplateProps`), NOT read from `variables`. Copying
 * the wrong pattern silently no-ops — the executor routes
 * `setSceneVariable("textArchetype", ...)` to the scene-level field,
 * never into variables, so `variables.textArchetype` is always
 * undefined.
 */

import {
  renderArchetype,
  normalizeArchetype,
  type TextArchetype,
  type ArchetypeRender,
} from "../typography";
import { MEDIA_TEXT_SHADOW } from "../theme";
import type { TypeTreatment } from "../theme";
import { renderWithEmoji, planTypewriterEmoji } from "../emoji/emoji-text";
import { Emoji } from "../emoji";

export type TextPosition = "top" | "center" | "bottom";
export type TextSizeRole = "headline" | "caption" | "label";

export interface SafeZone {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TemplateTextProps {
  archetype: TextArchetype;
  text: string;
  /** Scene progress 0→1. */
  progress: number;
  /** Presentation clock; VideoFrame keeps it on the complete scene timeline. */
  motionProgress?: number;
  /** Scene duration in seconds — drives entrance/exit phase scaling. */
  sceneDuration: number;
  /** Frame width in pixels (1080 in production, smaller in previews). */
  width: number;
  /** Frame height in pixels (1920 in production). */
  height: number;
  /** Where the text box sits in the frame. Templates declare this. */
  position?: TextPosition;
  /** Size envelope. Templates declare this. */
  sizeRole?: TextSizeRole;
  /** Preset type treatment — weight/tracking/size/case shift from style.preset. */
  typeTreatment?: TypeTreatment;
  /** Padding from frame edges. Defaults to a 24px box. */
  safeZone?: SafeZone;
  /** Font family. */
  font?: string;
  /** Fill color. */
  color?: string;
  /** Beat intensity 0→1 (currently unused — kept for forward compat). */
  beatIntensity?: number;
  /** True when this text renders over a photo or video backdrop. Swaps the
   *  gradient-tuned hairline shadow for the media halo, which is what keeps
   *  the scrim behind it light enough to leave the picture intact. */
  overMedia?: boolean;
}

const DEFAULT_SAFE_ZONE: SafeZone = { top: 24, right: 24, bottom: 24, left: 24 };
const DEFAULT_FONT =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ─── Typography constants ───────────────────────────────────────
// All em-based so they scale with font size and behave consistently across
// font families. Values from print/motion-design conventions:
//
//  - Big text (display/headline) gets TIGHTER tracking and TIGHTER leading.
//    -0.022em (≈ -2.2%) is the sweet spot for 48–88px headlines on most
//    sans-serifs (Inter, Helvetica, SF Pro, Manrope, Geist).
//  - Word-spacing kept subtle (≤0.08em). CSS word-spacing is ADDITIVE on
//    top of the natural space char, so what looks like "a touch of
//    rhythm" in print becomes a visible double-gap on 80px motion
//    headlines (especially under wordStagger, where each word renders
//    as an inline-block and the gap between them is preserved). Old
//    values (0.16/0.18/0.22 em) added ~13–18px per gap on display
//    type — the "too much space between words" symptom.
//  - Line-height 1.1 for headlines, 1.5 for body — Bringhurst-aligned ratios.
//  - kern + liga always on so any font's pair-kerning and ligatures fire
//    consistently (works across Inter, Manrope, SF, IBM Plex, etc.).
const TYPO = {
  headline: {
    letterSpacing: "-0.022em",
    wordSpacing: "0.04em",
    lineHeight: 1.1,
  },
  caption: {
    letterSpacing: "-0.012em",
    wordSpacing: "0.06em",
    lineHeight: 1.25,
  },
  label: {
    letterSpacing: "-0.005em",
    wordSpacing: "0.10em",
    lineHeight: 1.4,
  },
};
const FONT_FEATURES = '"kern" 1, "liga" 1';

// Drop shadow tuned to give crisp edges on retina without muddying text on
// saturated gradients. Earlier two-layer shadow (1px tight + 16px wide) cast
// dark halos that made gradient-backed text look smudged. A single barely-
// there shadow is enough for edge definition. Text over a photo or video
// takes MEDIA_TEXT_SHADOW instead — see `overMedia`.
function dropShadowFor(textColor: string): string {
  const dark = isLikelyDark(textColor);
  const tone = dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.2)";
  return `0 1px 2px ${tone}`;
}

function isLikelyDark(color: string): boolean {
  // Crude luminance check — handles #rrggbb and #rgb. Anything we can't parse
  // (named colors, rgb()) defaults to "not dark" so the heavier shadow shows.
  const m = color.replace("#", "");
  if (m.length === 3) {
    const r = parseInt(m[0] + m[0], 16);
    const g = parseInt(m[1] + m[1], 16);
    const b = parseInt(m[2] + m[2], 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }
  if (m.length === 6) {
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }
  return false;
}
// ─── Font sizing matrix ─────────────────────────────────────────
// Mirrors what production templates actually render today, ported from:
//   - text-overlay.tsx (headline: 80/64/48 × s_min by char count)
//   - infographic-steps.tsx (caption: ~44 × s_min capped by layout)

/**
 * Compute heroWord font size for a single word. Each active word fills its
 * own moment — trailer convention. Center can go large (480ref cap); top
 * stays inside the top zone height so it doesn't crash into the animation
 * or data viz below.
 */
function computeHeroFontSize(
  wordChars: number,
  position: TextPosition,
  width: number,
  height: number,
  safeZone: SafeZone,
): number {
  const chars = Math.max(wordChars, 1);
  const s_min = Math.min(width, height) / 1080;
  const widthBudget = (width - safeZone.left - safeZone.right) * 0.92;
  const pxPerChar = 0.58; // bold sans-serif approximation
  const widthCap = widthBudget / (chars * pxPerChar);

  if (position === "center") {
    return Math.min(480 * s_min, widthCap);
  }

  // Top/bottom: keep the word inside its zone (~28% of frame height) with
  // 80% headroom for entrance overshoot + breathe. Reference target 220ref
  // so even short words stay big without overflowing the zone.
  const heightCap = height * 0.28 * 0.8;
  return Math.min(220 * s_min, widthCap, heightCap);
}

/**
 * Smooth interpolation between max and min font size based on character count.
 * Avoids the visible "jump" you get from bucket boundaries when copy length
 * crosses a threshold (e.g., 25→26 chars dropping headline from 80px to 64px).
 *
 * Exported so templates that lay out their own text can match the headline
 * curve instead of inventing their own bucketed scaling.
 *
 * Returns size at 1080-reference scale; caller multiplies by s_min.
 */
export function smoothSize(chars: number, maxChars: number, max: number, min: number): number {
  const t = Math.max(0, Math.min(1, chars / maxChars));
  // Slight curve so short text stays at maxSize longer before scaling down.
  const eased = t * t;
  return max - (max - min) * eased;
}

function computeFontSize(
  archetype: TextArchetype,
  text: string,
  role: TextSizeRole,
  position: TextPosition,
  width: number,
  height: number,
  safeZone: SafeZone,
): { fontSize: number; fontWeight: number } {
  const s_min = Math.min(width, height) / 1080;

  // heroWord container fontSize uses the longest word as a safe fallback. The
  // ACTIVE-word size is recomputed per-render in the "hero" render branch
  // (via computeHeroFontSize) so each word fills its own moment optimally —
  // trailer convention.
  if (archetype === "heroWord") {
    const longestChars = text
      .split(/\s+/)
      .filter(Boolean)
      .reduce((m, w) => Math.max(m, w.length), 1);
    return {
      fontSize: computeHeroFontSize(longestChars, position, width, height, safeZone),
      fontWeight: 800,
    };
  }

  const chars = text.length;

  // Smooth scaling, minimums set so even long copy stays readable in production
  // (1080 reference). Numbers tuned to match — but improve on — the previous
  // bucketed system.
  if (role === "headline") {
    // Floor 60 (was 48) — matches the typography guideline "Titles/headlines
    // 60-86px at 1080" and lifts long-copy headlines off the body-text floor
    // that left ProblemSolution-shaped statements feeling small. Max held at
    // 88 so short, punchy headlines still fill the frame.
    const refSize = smoothSize(chars, /* maxChars */ 70, /* max */ 88, /* min */ 60);
    return { fontSize: refSize * s_min, fontWeight: 700 };
  }

  if (role === "caption") {
    const refSize = smoothSize(chars, 80, 48, 32);
    return { fontSize: refSize * s_min, fontWeight: 600 };
  }

  // label
  const refSize = smoothSize(chars, 80, 34, 24);
  return { fontSize: refSize * s_min, fontWeight: 500 };
}

// ─── Positioning ───────────────────────────────────────────────

function positionStyle(
  position: TextPosition,
  height: number,
  safeZone: SafeZone,
): React.CSSProperties {
  switch (position) {
    case "top":
      return {
        top: safeZone.top + height * 0.06,
        height: height * 0.28,
        alignItems: "flex-start",
      };
    case "bottom":
      return {
        bottom: safeZone.bottom + height * 0.06,
        height: height * 0.28,
        alignItems: "flex-end",
      };
    case "center":
    default:
      return {
        top: 0,
        bottom: 0,
        alignItems: "center",
      };
  }
}

// ─── Component ─────────────────────────────────────────────────

export const TemplateText: React.FC<TemplateTextProps> = ({
  archetype: archetypeRaw,
  text: textRaw,
  progress,
  motionProgress = progress,
  sceneDuration,
  width,
  height,
  position = "center",
  sizeRole = "headline",
  typeTreatment,
  safeZone = DEFAULT_SAFE_ZONE,
  font = DEFAULT_FONT,
  color = "#FFFFFF",
  beatIntensity = 0,
  overMedia = false,
}) => {
  // Defensive coerce: TemplateText is downstream of ~16 templates that pass
  // their own `variables.X` strings. If any one of them passes undefined
  // (missing variable on a freshly added scene, stale saved config, custom
  // template not setting a field), the unguarded `.split` / `.length` calls
  // below crash the entire preview. Treat undefined/non-string as
  // empty so a single bad scene doesn't take everything down. Warn in dev
  // so the upstream gap still surfaces.
  const textSafe = typeof textRaw === "string" ? textRaw : "";
  const isDevelopment = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV;
  if (textRaw !== undefined && typeof textRaw !== "string" && isDevelopment) {
    console.warn("[TemplateText] received non-string text:", textRaw);
  }
  // `|` is the AI's explicit line-break convention for headline copy
  // ("Built for speed.|Designed for you."). Convert centrally so EVERY
  // template that renders text through TemplateText honors it — bg-media
  // used to convert locally while confetti/emojiBurst/etc. rendered the
  // pipe literally. Whitespace around the pipe is trimmed so spaced and
  // unspaced pipes produce identical output. The container's
  // `white-space: pre-line` renders the resulting `\n` as a hard break.
  // Templates that legitimately render pipes (code, terminal commands)
  // don't flow through TemplateText, so they're unaffected.
  const text = textSafe.replace(/\s*\|\s*/g, "\n");
  // Normalize the archetype prop so unknown names fall back safely.
  const archetype = normalizeArchetype(archetypeRaw);
  const scale = Math.min(width, height) / 1080;
  // Motion pacing applies at every size role — a calm video should ease its
  // captions in too, not just its headlines. (The rest of the treatment is
  // headline-only; see `tt` below.)
  const result: ArchetypeRender = renderArchetype(
    archetype,
    progress,
    scale,
    text,
    sceneDuration,
    typeTreatment?.phaseScale ?? 1,
    motionProgress,
  );
  const { fontSize, fontWeight } = computeFontSize(
    archetype,
    text,
    sizeRole,
    position,
    width,
    height,
    safeZone,
  );

  // beatIntensity reserved for future use; currently a no-op on text body.
  void beatIntensity;

  const baseTypo = TYPO[sizeRole];
  // Preset type treatment. Absent (or the default preset's zero-deltas) leaves
  // every value exactly as it was, so unpresetted configs are unaffected.
  const tt = sizeRole === "headline" ? typeTreatment : undefined;
  // Only rewrite a value the preset actually changes — reformatting
  // letterSpacing with a zero delta would alter the emitted string (and every
  // stability snapshot) without changing the render.
  const typo = tt
    ? {
        ...baseTypo,
        ...(tt.trackingDeltaEm !== 0
          ? {
              letterSpacing: `${Number(
                (parseFloat(baseTypo.letterSpacing) + tt.trackingDeltaEm).toFixed(4),
              )}em`,
            }
          : {}),
        ...(tt.transform ? { textTransform: tt.transform } : {}),
      }
    : baseTypo;
  const presetWeight = tt ? Math.min(900, Math.max(100, fontWeight + tt.weightDelta)) : fontWeight;
  const presetSize = tt ? fontSize * tt.sizeScale : fontSize;
  const textShadow = overMedia ? MEDIA_TEXT_SHADOW : dropShadowFor(color);

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    padding: `0 ${safeZone.right}px 0 ${safeZone.left}px`,
    color,
    fontFamily: font,
    fontWeight: presetWeight,
    fontSize: presetSize,
    textAlign: "center",
    pointerEvents: "none",
    fontFeatureSettings: FONT_FEATURES,
    textRendering: "optimizeLegibility",
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
    // Respect explicit newlines — the centralized `|` → `\n` conversion
    // above (and callers passing real newlines) rely on this. Multiple
    // spaces still collapse normally; only `\n` and CRLF break.
    whiteSpace: "pre-line",
    ...(textShadow ? { textShadow } : {}),
    ...typo,
    ...positionStyle(position, height, safeZone),
  };

  if (result.kind === "block") {
    return (
      <div style={containerStyle}>
        <div
          style={{
            opacity: result.block.opacity,
            transform: `${result.block.transform}`,
            // Inherit letter-spacing from the container's typography defaults
            // unless the archetype explicitly overrides (e.g., for animated tracking).
            ...(result.block.letterSpacing ? { letterSpacing: result.block.letterSpacing } : {}),
            ...(result.block.willChange ? { willChange: result.block.willChange } : {}),
            maxWidth: "85%",
          }}
        >
          {renderWithEmoji(result.text, fontSize)}
        </div>
      </div>
    );
  }

  if (result.kind === "typewriter") {
    // Render every character as its own span so the FULL TEXT always sets the
    // layout — wrapping is decided by the complete string, not the typed
    // prefix. The cursor is overlaid with position:absolute from the last
    // typed char so it doesn't break the word it's inside.
    const chars = text.split("");
    // Map cluster-start code-unit indices → full emoji graphemes so emoji use
    // the native font even in the per-char typewriter reveal. Indexing
    // stays on text.length (UTF-16 units) so result.visibleChars / charExits
    // line up exactly; continuation units of a cluster render nothing.
    const emojiPlan = planTypewriterEmoji(text);
    const cursorBar = {
      position: "absolute" as const,
      width: "0.08em",
      height: "0.88em",
      background: "currentColor",
      borderRadius: "0.01em",
      pointerEvents: "none" as const,
    };
    return (
      <div style={containerStyle}>
        <div
          style={{
            opacity: result.opacity,
            maxWidth: "85%",
            whiteSpace: "pre-wrap",
            position: "relative",
          }}
        >
          {chars.map((ch, i) => {
            const isTyped = i < result.visibleChars;
            const isLastTyped = i === result.visibleChars - 1;
            const anchorCursor = isLastTyped && result.cursor;
            const charExit = result.charExits?.[i];
            const baseOpacity = isTyped ? 1 : 0;
            const finalOpacity = baseOpacity * (charExit?.opacity ?? 1);
            // During exit the per-char span needs inline-block so translateX
            // takes effect; whiteSpace: pre keeps space chars from collapsing.
            const exitStyle = charExit
              ? {
                  display: "inline-block" as const,
                  transform: `translateX(${charExit.translateX}px)`,
                  whiteSpace: "pre" as const,
                }
              : null;
            // Emoji handling: a cluster-start unit renders the full grapheme;
            // its continuation units render nothing.
            const emojiChar = emojiPlan?.starts.get(i);
            if (emojiPlan?.covered.has(i)) return null;
            return (
              <span
                key={i}
                style={{
                  opacity: finalOpacity,
                  position: anchorCursor ? "relative" : "static",
                  ...(exitStyle ?? {}),
                }}
              >
                {emojiChar ? <Emoji char={emojiChar} size={fontSize} /> : ch}
                {anchorCursor && (
                  <span
                    aria-hidden
                    style={{
                      ...cursorBar,
                      left: "100%",
                      top: "0.08em",
                      marginLeft: "0.12em",
                    }}
                  />
                )}
              </span>
            );
          })}
          {result.visibleChars === 0 && result.cursor && (
            <span
              aria-hidden
              style={{
                ...cursorBar,
                left: 0,
                top: "0.08em",
              }}
            />
          )}
        </div>
      </div>
    );
  }

  if (result.kind === "words") {
    // Render words inline-block with REAL space chars between them — word
    // spacing inherits from the container's typography defaults, matching
    // every other archetype's wrap behavior.
    return (
      <div style={containerStyle}>
        <div
          style={{
            opacity: result.blockOpacity,
            transform: `${result.blockTransform} `,
            maxWidth: "85%",
          }}
        >
          {result.words.map((w, i) => (
            <span key={i}>
              <span
                style={{
                  display: "inline-block",
                  opacity: w.style.opacity,
                  transform: w.style.transform,
                }}
              >
                {renderWithEmoji(w.text, fontSize)}
              </span>
              {i < result.words.length - 1 ? " " : ""}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (result.kind === "hero") {
    // Per-word sizing: each active word fills its own moment optimally.
    const perWordFontSize = computeHeroFontSize(
      result.word.length,
      position,
      width,
      height,
      safeZone,
    );
    // Fixed-height slot so words of different sizes don't jump vertically.
    // Slot is the max possible hero size for this position; lineHeight: 1 on
    // the inner word locks the glyph box to the font height so flex-center
    // lands the glyph at the same Y for every word.
    const slotHeight =
      position === "center" ? 480 * scale : Math.min(220 * scale, height * 0.28 * 0.8);
    return (
      <div style={{ ...containerStyle, fontSize: perWordFontSize }}>
        <div
          style={{
            height: slotHeight,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              opacity: result.opacity,
              transform: `${result.transform} `,
              lineHeight: 1,
              ...(result.letterSpacing ? { letterSpacing: result.letterSpacing } : {}),
            }}
          >
            {renderWithEmoji(result.word, perWordFontSize)}
          </div>
        </div>
      </div>
    );
  }

  return null;
};
