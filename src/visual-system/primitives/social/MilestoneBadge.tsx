/**
 * MilestoneBadge — numeric achievement badge with rolling counter, glow,
 * confetti burst, and celebration pill.
 *
 * The
 * template composes this component, so the two can no longer drift.
 * The primitive owns:
 *   - the big rolling number with auto-fit font scale
 *   - the uppercase label above
 *   - the radial glow that ramps up as the count nears target
 *   - the confetti burst (via shared ConfettiLayer) that fires on hit
 *   - the celebration pill ("🎉 10K Followers!") that pops in on hit
 *
 * It does NOT own the SceneBackground gradient/media — that stays in the
 * scene composer so the same badge can render over brand gradient or
 * Pexels footage.
 *
 * Distinct from CountUpNumber: this primitive has badge framing
 * (label + pill + confetti) baked in.
 *
 * Props:
 *  - progress        — scene progress 0..1
 *  - width / height  — frame dimensions
 *  - targetNumber    — milestone to reach
 *  - label           — uppercase label above the number (e.g. "Followers")
 *  - prefix / suffix — optional decoration around the number (e.g. "$", "+", "K")
 *  - startNumber     — counter origin. Defaults to ~98% of target so it
 *                      always rolls UP visibly.
 *  - badgeText       — celebration pill text (e.g. "10K Followers!")
 *  - badgeEmoji      — emoji shown in the pill (default 🎉)
 *  - accent          — brand accent driving the glow color (default "#00e5a0")
 *  - hasMedia        — when true, use the media-safe text treatment
 *                      (full white label + drop shadows). Defaults to false.
 *  - foreground      — resolved semantic foreground for gradient mode;
 *                      media mode uses its deliberate scrim-safe white.
 *  - surfaceElevated — opaque semantic surface for the celebration pill.
 *  - beatIntensity   — optional 0..1 audio reactivity (subtle scale pop)
 *  - confettiBgColor — optional confetti hue-filter input (parity with source)
 */

import * as React from "react";
import {
  interpolate,
  spring,
  SPRING_SMOOTH,
  SPRING_BOUNCY,
} from "../../motion";
import { stripPipe } from "../../typography";
import { Emoji } from "../../emoji";
import { renderWithEmoji } from "../../emoji/emoji-text";
import { ConfettiLayer } from "../../scene-templates/confetti-layer";
import { accessibleTextColor, withOpacity, MEDIA_TEXT_SHADOW, TOKEN_DEFAULTS } from "../../theme";

const CLAMP = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

export interface MilestoneBadgeProps {
  progress: number;
  width: number;
  height: number;
  targetNumber: number;
  label: string;
  prefix?: string;
  suffix?: string;
  startNumber?: number;
  badgeText?: string;
  badgeEmoji?: string;
  badgeColor?: string;
  accent?: string;
  hasMedia?: boolean;
  /** Resolved semantic foreground for text on the main background. */
  foreground?: string;
  /** Resolved semantic elevated surface for the celebration pill. */
  surfaceElevated?: string;
  beatIntensity?: number;
  confettiBgColor?: string;
}

export const MilestoneBadge: React.FC<MilestoneBadgeProps> = ({
  progress,
  width,
  height,
  targetNumber,
  label: rawLabel,
  prefix = "",
  suffix = "",
  startNumber,
  badgeText: rawBadgeText = "",
  badgeEmoji = "🎉",
  accent = TOKEN_DEFAULTS.primary,
  hasMedia = false,
  foreground = TOKEN_DEFAULTS.foreground,
  surfaceElevated = TOKEN_DEFAULTS.surfaceElevated,
  beatIntensity = 0,
  confettiBgColor,
}) => {
  const dim = Math.min(width, height);
  const s = dim / 1080;

  const label = stripPipe(rawLabel || "");
  const badgeText = stripPipe(rawBadgeText || "");

  const safeTarget = Number.isFinite(targetNumber) ? targetNumber : 0;
  const safeStart =
    startNumber != null && Number.isFinite(startNumber)
      ? startNumber
      : Math.max(0, Math.round(safeTarget * 0.98));

  const mainTextColor = hasMedia ? "#FFFFFF" : foreground;
  const pillTextColor = accessibleTextColor(surfaceElevated, foreground);
  const mediaTextShadow = hasMedia ? MEDIA_TEXT_SHADOW : undefined;

  // ── Timing (mirror social-milestone source) ────────────────────
  // Counter rolls from progress 0.056 to 0.556
  const followerCount = Math.round(
    interpolate(progress, [0.056, 0.556], [safeStart, safeTarget], CLAMP),
  );
  const hasHitTarget = followerCount >= safeTarget;

  const numberScale = spring(
    interpolate(progress, [0, 0.25], [0, 1], CLAMP),
    SPRING_SMOOTH,
  );
  const glowIntensity = interpolate(progress, [0.33, 0.556], [0, 1], CLAMP);
  const labelOpacity = interpolate(progress, [0, 0.167], [0, 1], CLAMP);

  const badgeP = hasHitTarget
    ? spring(
        interpolate(progress, [0.556, 0.85], [0, 1], CLAMP),
        SPRING_BOUNCY,
      )
    : 0;
  const badgeScale = interpolate(badgeP, [0, 0.5, 1], [0, 1.2, 1], CLAMP);
  const badgeOpacity = badgeP;

  const confettiActive = hasHitTarget;
  const confettiProgress = confettiActive
    ? Math.max(0, (progress - 0.556) / 0.444)
    : 0;

  const beatScale = 1 + beatIntensity * 0.02;

  const numberDisplay = `${prefix}${followerCount.toLocaleString()}${suffix}`;
  // Auto-scale thresholds match social-milestone (the tuned source of truth).
  const fontSize =
    numberDisplay.length > 9
      ? dim * 0.09
      : numberDisplay.length > 6
        ? dim * 0.12
        : dim * 0.16;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Confetti — shared 200-particle layer, fires on milestone hit */}
      {confettiActive && (
        <ConfettiLayer
          progress={confettiProgress}
          width={width}
          height={height}
          beatIntensity={beatIntensity}
          bgColor={hasMedia ? undefined : confettiBgColor || accent}
        />
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: dim * 0.015,
          transform: `scale(${numberScale * beatScale})`,
          position: "relative",
          zIndex: 1,
          width: "100%",
        }}
      >
        {/* Label */}
        {label && (
          <div
            style={{
              color: mainTextColor,
              fontSize: dim * 0.032,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: dim * 0.004,
              opacity: labelOpacity,
              textAlign: "center",
              ...(mediaTextShadow ? { textShadow: mediaTextShadow } : {}),
            }}
          >
            {label}
          </div>
        )}

        {/* Big number */}
        <div
          style={{
            color: mainTextColor,
            fontSize,
            fontWeight: 800,
            letterSpacing: dim * -0.004,
            lineHeight: 1,
            position: "relative",
            maxWidth: "90%",
            textAlign: "center",
            ...(mediaTextShadow ? { textShadow: mediaTextShadow } : {}),
          }}
        >
          {/* Glow behind number */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: dim * 0.5,
              height: dim * 0.2,
              borderRadius: "50%",
              background: `radial-gradient(ellipse, ${withOpacity(accent, glowIntensity * 0.2)} 0%, ${withOpacity(accent, glowIntensity * 0.05)} 50%, transparent 70%)`,
              pointerEvents: "none",
            }}
          />
          <span style={{ position: "relative" }}>{numberDisplay}</span>
        </div>

        {/* Celebration badge */}
        {badgeText && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: `translateX(-50%) scale(${badgeScale})`,
              opacity: badgeOpacity,
              backgroundColor: surfaceElevated,
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 100 * s,
              padding: `${dim * 0.015}px ${dim * 0.037}px`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: dim * 0.011,
              whiteSpace: "nowrap",
              marginTop: dim * 0.02,
            }}
          >
            <Emoji char={badgeEmoji} size={dim * 0.045} verticalAlign="middle" />
            <span
              style={{
                color: pillTextColor,
                fontSize: dim * 0.036,
                fontWeight: 700,
                letterSpacing: dim * 0.0005,
              }}
            >
              {renderWithEmoji(badgeText, dim * 0.036)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
