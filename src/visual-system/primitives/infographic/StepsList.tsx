/**
 * StepsList — the `steps` template composes this component (background and
 * headline stay in the template), so the two can never drift.
 *
 * Numbered (or emoji) step circles form a compact timeline in portrait and
 * a horizontal sequence in landscape, with a shared bouncy spring pop-in,
 * title fade-up, and a left-cascade exit. The three steps enter together so
 * the full sequence remains visible as one composition.
 *
 * Layout owns its own absolute positioning — drop into a scene that
 * already paints a background + headline above. The primitive renders
 * the step blocks only.
 */

import * as React from "react";
import {
  interpolate,
  spring,
  type SpringConfig,
} from "../../motion";
import {
  withOpacity,
  autoTextColor,
} from "../../theme";
import { TOP_TEXT_AREA_RATIO } from "../../backgrounds";
import { fitTextSize, stripPipe } from "../../typography";
import { TOKEN_DEFAULTS } from "../../theme";
import { Emoji } from "../../emoji";
import type { SafeZone } from "../../template-context";

// Bouncy pop — matches Remotion reference (damping 8, stiffness 200)
const SPRING_POP: SpringConfig = { damping: 8, stiffness: 200 };
// Snappy slide — for titles
const SPRING_TITLE: SpringConfig = { damping: 18, stiffness: 200 };

// ─── Typed component (direct use from templates) ────────────────

/**
 * Props for StepsList.
 *
 * - `progress` (required): scene progress 0→1 driving all animations.
 * - `width` / `height` (required): scene viewport. Drives portrait/landscape
 *   layout switch and the orientation-aware scale factor.
 * - `steps` (required): 1–4 step entries. Only `title` is used in the
 *   verbatim layout; `description` is accepted for forward-compat but not
 *   rendered (matches the source template). Truncated to 4.
 * - `stepEmojis` (optional): per-step emoji glyph; falls back to a numbered
 *   circle (`1`, `2`, `3`, `4`) when entry is empty / array shorter than `steps`.
 * - `accent` (optional, default `#00e5a0`): brand accent — number color +
 *   radial-glow tint + circle box-shadow.
 * - `textColor` (optional, default `#ffffff`): step-title color.
 * - `font` (optional, default `Inter`).
 * - `beatIntensity` (optional, default `0`): accepted for API parity with
 *   other primitives; currently unused (source doesn't beat-modulate steps).
 */
export interface StepsListProps {
  progress: number;
  width: number;
  height: number;
  steps: Array<{ title: string; description?: string }>;
  stepEmojis?: string[];
  accent?: string;
  textColor?: string;
  font?: string;
  beatIntensity?: number;
  safeZone?: SafeZone;
}

export interface StepsLayoutItem {
  x: number;
  y: number;
  circleRadius: number;
  labelLeft: number;
  labelTop: number;
  labelWidth: number;
  labelFontSize: number;
}

export interface StepsLayout {
  mode: "portrait-timeline" | "landscape-row";
  items: StepsLayoutItem[];
}

/**
 * Safe-zone-aware geometry shared by the renderer and regression tests.
 * Four portrait steps use a compact editorial timeline rather than four
 * oversized centered badges, leaving a predictable text column and bottom
 * breathing room for social-player chrome.
 */
export function computeStepsLayout({
  width,
  height,
  labels,
  safeZone = { top: 0, right: 0, bottom: 0, left: 0 },
}: {
  width: number;
  height: number;
  labels: string[];
  safeZone?: SafeZone;
}): StepsLayout {
  const stepCount = Math.max(1, Math.min(labels.length, 4));
  const s = Math.min(width, height) / 1080;
  const textAreaBottom = Math.max(height * TOP_TEXT_AREA_RATIO, safeZone.top);

  if (width > height) {
    const availableWidth = Math.max(1, width - safeZone.left - safeZone.right);
    const sectionWidth = availableWidth / stepCount;
    const circleRadius = Math.min(104 * s, sectionWidth * 0.25);
    const y = Math.min(
      height * 0.55,
      height - safeZone.bottom - circleRadius - 86 * s,
    );

    return {
      mode: "landscape-row",
      items: labels.slice(0, 4).map((label, index) => {
        const x = safeZone.left + sectionWidth * (index + 0.5);
        const labelWidth = sectionWidth * 0.76;
        return {
          x,
          y,
          circleRadius,
          labelLeft: x - labelWidth / 2,
          labelTop: y + circleRadius + 20 * s,
          labelWidth,
          labelFontSize: fitTextSize(label, 42 * s, labelWidth, { minScale: 0.72 }),
        };
      }),
    };
  }

  const contentTop = textAreaBottom;
  const contentBottom = Math.max(contentTop + 1, height - safeZone.bottom);
  const rowHeight = (contentBottom - contentTop) / stepCount;
  const circleRadius = Math.min(82 * s, rowHeight * 0.27);
  const x = safeZone.left + circleRadius + 48 * s;
  const labelLeft = x + circleRadius + 42 * s;
  const labelWidth = Math.max(1, width - safeZone.right - labelLeft);

  return {
    mode: "portrait-timeline",
    items: labels.slice(0, 4).map((label, index) => {
      const y = contentTop + rowHeight * (index + 0.5);
      return {
        x,
        y,
        circleRadius,
        labelLeft,
        labelTop: y - circleRadius,
        labelWidth,
        labelFontSize: fitTextSize(label, 50 * s, labelWidth, { minScale: 0.68 }),
      };
    }),
  };
}

export const StepsList: React.FC<StepsListProps> = ({
  progress,
  width,
  height,
  steps,
  stepEmojis = [],
  accent = TOKEN_DEFAULTS.primary,
  textColor = "#ffffff",
  font = TOKEN_DEFAULTS.font,
  beatIntensity = 0,
  safeZone,
}) => {
  void beatIntensity;
  const s = Math.min(width, height) / 1080;

  const stepLabels = steps.slice(0, 4).map((st) => stripPipe(String(st.title || "")));
  const hasEmojis = stepEmojis.some((e) => (e || "").length > 0);
  const isLandscape = width > height;
  const layout = computeStepsLayout({ width, height, labels: stepLabels, safeZone });
  const connectorPairs = layout.items.slice(0, -1).map((item, index) => ({
    item,
    next: layout.items[index + 1],
  }));
  const lineProgress = interpolate(progress, [0.07, 0.62], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Animation timing ──────────────────────────────────────────
  const firstStep = 0.08;

  // ── Exit cascade — slide left + fade in reading order ────────
  const EXIT_START = 0.78;
  const EXIT_DURATION = 0.10;
  const EXIT_STAGGER = 0.04;
  const exitForIndex = (i: number) => {
    const start = EXIT_START + i * EXIT_STAGGER;
    const raw = interpolate(progress, [start, start + EXIT_DURATION], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const eased = raw * raw; // ease-in
    return { translateX: -90 * s * eased, fade: 1 - eased };
  };

  return (
    <>
      {connectorPairs.map(({ item, next }, index) => {
        const exit = exitForIndex(index);
        const segmentProgress = interpolate(
          lineProgress,
          [index / connectorPairs.length, (index + 1) / connectorPairs.length],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );

        return (
          <div
            key={`step-connector-${index}`}
            style={layout.mode === "portrait-timeline" ? {
              position: "absolute",
              left: item.x - 2 * s,
              top: item.y + item.circleRadius,
              width: 4 * s,
              height: Math.max(
                0,
                next.y - next.circleRadius - (item.y + item.circleRadius),
              ),
              borderRadius: 999,
              background: `linear-gradient(to bottom, ${withOpacity(accent, 0.9)}, ${withOpacity(textColor, 0.22)})`,
              transform: `translateX(${exit.translateX}px) scaleY(${segmentProgress})`,
              transformOrigin: "top",
              opacity: 0.75 * exit.fade,
            } : {
              position: "absolute",
              left: item.x + item.circleRadius,
              top: item.y - 2 * s,
              width: Math.max(
                0,
                next.x - next.circleRadius - (item.x + item.circleRadius),
              ),
              height: 4 * s,
              borderRadius: 999,
              background: `linear-gradient(to right, ${withOpacity(accent, 0.9)}, ${withOpacity(textColor, 0.22)})`,
              transform: `translateX(${exit.translateX}px) scaleX(${segmentProgress})`,
              transformOrigin: "left",
              opacity: 0.75 * exit.fade,
            }}
          />
        );
      })}

      {layout.items.map((pos, i) => {
        const circleRadius = pos.circleRadius;
        const circleSize = circleRadius * 2;
        const emojiFontSize = circleRadius * (isLandscape ? 0.9 : 0.8);
        const numberFontSize = circleRadius * 0.7;
        const itemStart = firstStep;

        const circleP = spring(
          interpolate(progress, [itemStart, itemStart + 0.12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          SPRING_POP,
        );
        const circleScale = interpolate(circleP, [0, 1], [0, 1]);

        const contentDelay = itemStart + 0.03;
        const contentOpacity = interpolate(progress, [contentDelay, contentDelay + 0.05], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const titleDelay = itemStart + 0.05;
        const titleP = spring(
          interpolate(progress, [titleDelay, titleDelay + 0.10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          SPRING_TITLE,
        );
        const titleSlide = isLandscape
          ? (1 - titleP) * 40 * s
          : (1 - titleP) * 120 * s;
        const titleOpacity = interpolate(progress, [titleDelay, titleDelay + 0.05], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const emoji = hasEmojis ? (stepEmojis[i] || "") : "";
        const glowOpacity = circleScale * 0.2;
        const exit = exitForIndex(i);

        return (
          <div
            key={`step-${i}`}
            data-template-item="steps"
            style={{
              position: "absolute",
              top: pos.y - circleRadius,
              left: 0,
              width,
              height: circleSize,
              transform: `translateX(${exit.translateX}px)`,
              opacity: exit.fade,
            }}
          >
            {/* Radial glow */}
            <div
              style={{
                position: "absolute",
                top: -circleRadius * 0.6,
                left: pos.x - circleRadius * 1.75,
                width: circleRadius * 3.5,
                height: circleRadius * 3.5,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${withOpacity(accent, 0.4)} 0%, transparent 70%)`,
                opacity: glowOpacity,
                pointerEvents: "none",
              }}
            />

            {/* Circle — numbered mode fills solid accent with an
                auto-contrast numeral: the old accent-on-translucent
                combo went illegible whenever accent ≈ background.
                Emoji mode keeps the translucent circle (emoji glyphs
                carry their own color). Matches infographic-steps.tsx. */}
            <div
              style={{
                position: "absolute",
                left: pos.x - circleRadius,
                top: 0,
                width: circleSize,
                height: circleSize,
                borderRadius: "50%",
                backgroundColor: emoji ? "rgba(255,255,255,0.15)" : accent,
                border: "2px solid rgba(255,255,255,0.2)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                transform: `scale(${circleScale})`,
                boxShadow: `0 0 ${20 * s}px ${withOpacity(accent, glowOpacity)}`,
              }}
            >
              {emoji ? (
                <Emoji char={emoji} size={emojiFontSize} verticalAlign="middle" style={{ opacity: contentOpacity }} />
              ) : (
                <span
                  style={{
                    fontSize: numberFontSize,
                    fontWeight: 800,
                    color: autoTextColor(accent),
                    fontFamily: font,
                    lineHeight: 1,
                    opacity: contentOpacity,
                  }}
                >
                  {i + 1}
                </span>
              )}
            </div>

            {/* Title — beside the portrait timeline or below the landscape row. */}
            <div
              style={{
                position: "absolute",
                left: pos.labelLeft,
                top: pos.labelTop - (pos.y - circleRadius),
                width: pos.labelWidth,
                height: isLandscape ? 80 * s : circleSize,
                display: "flex",
                alignItems: isLandscape ? "flex-start" : "center",
                justifyContent: isLandscape ? "center" : "flex-start",
                fontSize: pos.labelFontSize,
                fontWeight: 600,
                color: textColor,
                fontFamily: font,
                letterSpacing: -0.3,
                textAlign: isLandscape ? "center" : "left",
                opacity: titleOpacity,
                transform: isLandscape ? `translateY(${titleSlide}px)` : `translateX(${titleSlide}px)`,
                textShadow: "0 1px 6px rgba(0,0,0,0.1)",
                lineHeight: 1.12,
                whiteSpace: "normal",
              }}
            >
              {stepLabels[i]}
            </div>
          </div>
        );
      })}
    </>
  );
};
