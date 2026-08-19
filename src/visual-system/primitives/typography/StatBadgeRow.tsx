/**
 * StatBadgeRow
 *
 * Three stat tiles laid out side-by-side (landscape) or stacked (portrait).
 * Each tile has a big value + uppercase label below. Tiles stagger in with
 * SPRING_STAT bouncy spring, then cascade-exit (left-slide) in reading
 * order from progress 0.78 onwards.
 *
 * infographic-stat-row.tsx is refactored to consume this component; both
 * paths render byte-identical DOM.
 */

import React from "react";
import {
  interpolate,
  spring,
  type SpringConfig,
} from "../../motion";
import { withOpacity } from "../../theme";
import { TOP_TEXT_AREA_RATIO } from "../../backgrounds";
import { TOKEN_DEFAULTS } from "../../theme";

const SPRING_STAT: SpringConfig = { damping: 12, stiffness: 170 };

// ─── Typed component (direct use from templates) ────────────────

export interface StatBadgeRowProps {
  progress: number;
  /** 1-4 stats. Empty values are filtered out. */
  stats: { value: string; label: string }[];
  width: number;
  height: number;
  font?: string;
  textColor?: string;
}

export const StatBadgeRow: React.FC<StatBadgeRowProps> = ({
  progress,
  stats: rawStats,
  width,
  height,
  font = TOKEN_DEFAULTS.font,
  textColor = "#ffffff",
}) => {
  const s = Math.min(width, height) / 1080;
  const stats = rawStats.filter((st) => st.value);
  const isLandscape = width > height;

  const textAreaHeight = height * TOP_TEXT_AREA_RATIO;
  const statsAreaTop = textAreaHeight;
  const statsAreaHeight = height - statsAreaTop;

  const valueFontSize = isLandscape ? 72 * s : 100 * s;
  const labelFontSize = isLandscape ? 28 * s : 38 * s;

  const statCount = stats.length;

  const getStatPosition = (i: number) => {
    if (isLandscape) {
      const spacing = width / (statCount + 1);
      return {
        x: spacing * (i + 1),
        y: statsAreaTop + statsAreaHeight * 0.4,
      };
    }
    const sectionH = statsAreaHeight / (statCount + 0.5);
    return {
      x: width / 2,
      y: statsAreaTop + sectionH * (i + 0.5),
    };
  };

  return (
    <>
      {stats.map((stat, i) => {
        const pos = getStatPosition(i);
        const itemStart = 0.10 + i * 0.12;

        const statP = spring(
          interpolate(progress, [itemStart, itemStart + 0.12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          SPRING_STAT,
        );
        const scaleVal = interpolate(statP, [0, 1], [0.5, 1]);
        const opacity = interpolate(progress, [itemStart, itemStart + 0.06], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const labelDelay = itemStart + 0.06;
        const labelOpacity = interpolate(progress, [labelDelay, labelDelay + 0.05], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const labelSlideY = interpolate(progress, [labelDelay, labelDelay + 0.06], [10 * s, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

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

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              transform: `translate(-50%, -50%) translate(${exitTranslateX}px, 0) scale(${scaleVal})`,
              opacity: opacity * exitFade,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: isLandscape ? 12 * s : 24 * s,
              backgroundColor: "rgba(255,255,255,0.15)",
              border: "1.5px solid rgba(255,255,255,0.2)",
              borderRadius: isLandscape ? 20 * s : 28 * s,
              padding: isLandscape ? `${28 * s}px ${24 * s}px` : `${48 * s}px ${56 * s}px`,
              width: isLandscape ? (width / (statCount + 1)) * 0.85 : undefined,
              maxWidth: isLandscape ? width * 0.28 : undefined,
              minWidth: isLandscape ? undefined : width * 0.6,
            }}
          >
            <div
              style={{
                fontSize: valueFontSize,
                fontWeight: 800,
                color: textColor,
                fontFamily: font,
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                fontSize: labelFontSize,
                fontWeight: 500,
                color: withOpacity(textColor, 0.8),
                fontFamily: font,
                lineHeight: 1.2,
                whiteSpace: isLandscape ? "normal" : "nowrap",
                textAlign: "center" as const,
                textTransform: "uppercase" as const,
                letterSpacing: isLandscape ? 1 * s : 2 * s,
                opacity: labelOpacity,
                transform: `translateY(${labelSlideY}px)`,
              }}
            >
              {stat.label}
            </div>
          </div>
        );
      })}
    </>
  );
};
