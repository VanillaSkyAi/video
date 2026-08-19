/**
 * FeatureList
 *
 * Vertical list (portrait) / horizontal row (landscape) of glassmorphic
 * feature cards. Each card has an emoji + label. Rows enter together from
 * the left with spring, emoji bounces after, label fades. Left-cascade
 * exit in reading order. Headline TemplateText stays in the scene
 * composer; this primitive renders the list only.
 */

import * as React from "react";
import {
  interpolate,
  spring,
  type SpringConfig,
} from "../../motion";
import { stripPipe } from "../../typography";
import { TOKEN_DEFAULTS } from "../../theme";
import { Emoji } from "../../emoji";

const SPRING_ROW: SpringConfig = { damping: 14, stiffness: 170 };
const SPRING_EMOJI: SpringConfig = { damping: 8, stiffness: 200 };

// ─── Typed component (direct use from templates) ────────────────

/**
 * Props for FeatureList.
 *
 * - `progress` (required): scene progress 0→1 driving row / emoji / label
 *   stagger + exit cascade.
 * - `width` / `height` (required): scene viewport. Drives portrait (stacked
 *   rows) vs landscape (side-by-side square cards) layout.
 * - `features` (required): 1–3 feature entries (truncated to 3). Source
 *   layout uses the verbatim text as a single description string; pass it
 *   in `title` or `description` — both are concatenated with title taking
 *   priority when both present. Missing emoji falls back to "✦".
 * - `textColor` (optional, default `#ffffff`): label color.
 * - `font` (optional, default `Inter`).
 * - `beatIntensity` (optional, default `0`): accepted for API parity;
 *   currently unused.
 */
export interface FeatureListProps {
  progress: number;
  width: number;
  height: number;
  features: Array<{ title: string; description?: string; icon?: string }>;
  textColor?: string;
  font?: string;
  beatIntensity?: number;
}

export const FeatureList: React.FC<FeatureListProps> = ({
  progress,
  width,
  height,
  features,
  textColor = "#ffffff",
  font = TOKEN_DEFAULTS.font,
  beatIntensity = 0,
}) => {
  void beatIntensity;
  const s = Math.min(width, height) / 1080;

  // The source template treats each item as one description string; we
  // prefer `title` when present, falling back to `description`.
  const itemLabels = features
    .slice(0, 3)
    .map((f) => stripPipe(String(f.title || f.description || "")));
  const itemEmojis = features.slice(0, 3).map((f) => String(f.icon || ""));
  const itemCount = itemLabels.length;

  if (itemCount === 0) return null;

  // ── Layout ──────────────────────────────────────────────────────
  const isLandscape = width > height;
  const contentAreaTop = height * (isLandscape ? 0.28 : 0.25);
  const contentAreaHeight = height * (isLandscape ? 0.65 : 0.7);

  const sidePadding = 40 * s;
  const gap = 20 * s;
  const borderRadius = 20 * s;

  let cardWidth: number;
  let cardHeight: number;
  let emojiFontSize: number;
  let labelFontSize: number;
  let listLeft: number;

  if (isLandscape) {
    const totalWidth = width * 0.9;
    cardWidth = (totalWidth - gap * (itemCount - 1)) / itemCount;
    cardHeight = Math.min(cardWidth, contentAreaHeight * 0.85);
    emojiFontSize = Math.min(cardHeight * 0.35, 110 * s);
    labelFontSize = Math.min(cardHeight * 0.16, 48 * s);
    listLeft = (width - (cardWidth * itemCount + gap * (itemCount - 1))) / 2;
  } else {
    cardWidth = width - sidePadding * 2;
    const maxRowHeight = 260 * s;
    cardHeight = Math.min((contentAreaHeight - gap * (itemCount - 1)) / itemCount, maxRowHeight);
    emojiFontSize = Math.min(cardHeight * 0.35, 64 * s);
    labelFontSize = Math.min(cardHeight * 0.25, 44 * s);
    listLeft = sidePadding;
  }

  const totalHeight = isLandscape ? cardHeight : cardHeight * itemCount + gap * (itemCount - 1);
  const verticalAnchor = isLandscape ? 0.5 : 0.25;
  const listTop = contentAreaTop + (contentAreaHeight - totalHeight) * verticalAnchor;

  const cardBg = "rgba(255,255,255,0.15)";
  const cardBorder = "rgba(255,255,255,0.2)";

  const firstRow = 0.08;

  return (
    <>
      {itemLabels.map((label, i) => {
        const x = isLandscape ? listLeft + i * (cardWidth + gap) : listLeft;
        const y = isLandscape ? listTop : listTop + i * (cardHeight + gap);
        const itemStart = firstRow;

        const rowP = spring(
          interpolate(progress, [itemStart, itemStart + 0.12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          SPRING_ROW,
        );
        const cardScale = isLandscape ? interpolate(rowP, [0, 1], [0.6, 1]) : 1;
        const rowX = isLandscape ? 0 : (1 - rowP) * -120 * s;
        const rowOpacity = interpolate(progress, [itemStart, itemStart + 0.05], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const emojiDelay = itemStart + 0.04;
        const emojiP = spring(
          interpolate(progress, [emojiDelay, emojiDelay + 0.08], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          SPRING_EMOJI,
        );
        const emojiScale = interpolate(emojiP, [0, 1], [0, 1]);

        const textDelay = itemStart + 0.06;
        const textOpacity = interpolate(progress, [textDelay, textDelay + 0.05], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        // ── Exit cascade — slide left + fade in reading order ────
        const EXIT_START = 0.78;
        const EXIT_DURATION = 0.10;
        const EXIT_STAGGER = 0.04;
        const exitStart = EXIT_START + i * EXIT_STAGGER;
        const exitEnd = exitStart + EXIT_DURATION;
        const exitRaw = interpolate(progress, [exitStart, exitEnd], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const exitEased = exitRaw * exitRaw;
        const exitTranslateX = -90 * s * exitEased;
        const exitFade = 1 - exitEased;

        const emoji = itemEmojis[i] || "✦";

        const transform = isLandscape
          ? `translate(${exitTranslateX}px, 0) scale(${cardScale})`
          : `translateX(${rowX + exitTranslateX}px)`;

        return (
          <div
            key={i}
            data-template-item="cardList"
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: cardWidth,
              height: cardHeight,
              borderRadius,
              backgroundColor: cardBg,
              border: `1.5px solid ${cardBorder}`,
              display: "flex",
              flexDirection: isLandscape ? "column" : "row",
              alignItems: "center",
              justifyContent: isLandscape ? "center" : undefined,
              gap: isLandscape ? 32 * s : 0,
              opacity: rowOpacity * exitFade,
              transform,
              transformOrigin: "center center",
            }}
          >
            {/* Emoji */}
            <div
              style={{
                width: isLandscape ? undefined : Math.min(cardHeight * 0.7, 130 * s),
                height: isLandscape ? undefined : cardHeight,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Emoji
                char={emoji}
                size={emojiFontSize}
                verticalAlign="middle"
                style={{ transform: `scale(${emojiScale})`, display: "block" }}
              />
            </div>

            {/* Label */}
            <div
              style={{
                flex: isLandscape ? undefined : 1,
                fontSize: labelFontSize,
                fontWeight: 600,
                color: textColor,
                fontFamily: font,
                lineHeight: 1.25,
                letterSpacing: -0.3,
                opacity: textOpacity,
                textAlign: isLandscape ? "center" : undefined,
                padding: isLandscape ? `0 ${16 * s}px` : `0 ${20 * s}px 0 0`,
                textShadow: "0 1px 6px rgba(0,0,0,0.1)",
              }}
            >
              {label}
            </div>
          </div>
        );
      })}
    </>
  );
};
