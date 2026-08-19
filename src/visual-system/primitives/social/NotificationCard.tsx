/**
 * NotificationCard
 *
 * iOS-style glassmorphic notification card. Header (icon + app name + "now"),
 * then word-by-word message reveal. Card scales/lifts in via spring.
 *
 * social-notification.tsx is refactored to consume this primitive; both
 * paths render visually identical output.
 */

import * as React from "react";
import { interpolate, spring, SPRING_SMOOTH } from "../../motion";
import { stripPipe } from "../../typography";
import { Emoji } from "../../emoji";
import { renderWithEmoji } from "../../emoji/emoji-text";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// ─── Typed component (direct use from templates) ────────────────

export interface NotificationCardProps {
  progress: number;
  /** Transition-safe presentation clock; semantic scene time stays on progress. */
  motionProgress?: number;
  appName: string;
  /** Single emoji icon. Default 🔔. */
  appIcon?: string;
  message: string;
  width: number;
  height: number;
  beatIntensity?: number;
}

export const NotificationCard: React.FC<NotificationCardProps> = ({
  progress,
  motionProgress = progress,
  appName: rawAppName,
  appIcon: rawAppIcon,
  message: rawMessage,
  width,
  height,
  beatIntensity = 0,
}) => {
  const dim = Math.min(width, height);
  const appName = stripPipe(rawAppName);
  const appIcon = (rawAppIcon || "🔔").trim() || "🔔";
  const message = rawMessage;
  const presentationProgress = Math.max(progress, motionProgress);

  const cardSpring = spring(interpolate(presentationProgress, [0.05, 0.20], [0, 1], CLAMP), SPRING_SMOOTH);
  const cardOpacity = interpolate(presentationProgress, [0.05, 0.15], [0, 1], CLAMP);
  const cardScale = interpolate(cardSpring, [0, 1], [0.95, 1]);
  const cardLift = (1 - cardSpring) * 12;

  const headerOpacity = interpolate(presentationProgress, [0.18, 0.30], [0, 1], CLAMP);

  const words = message.split(/\s+/).filter(Boolean);
  const wordStart = 0.30;
  const wordEnd = 0.70;
  const wordSlice = (wordEnd - wordStart) / Math.max(words.length, 1);

  const cardW = Math.min(width * 0.88, dim * 0.9);
  const cardPad = dim * 0.038;
  const cardRadius = dim * 0.025;
  const iconSize = dim * 0.045;
  const iconRadius = iconSize * 0.28;
  const iconFont = iconSize * 0.66;
  const appFontSize = dim * 0.030;
  const timeFontSize = dim * 0.026;
  const msgFontSize = dim * 0.040;

  const beatGlow = 1 + beatIntensity * 0.3;

  return (
    <div
      data-notification-card="true"
      style={{
        position: "absolute",
        top: "50%",
        left: (width - cardW) / 2,
        width: cardW,
        transform: `translateY(calc(-50% + ${cardLift}px))`,
        opacity: cardOpacity,
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(245,242,238,0.92)",
          borderRadius: cardRadius,
          padding: cardPad,
          boxShadow: `0 ${dim * 0.012}px ${dim * 0.05 * beatGlow}px rgba(0,0,0,0.18)`,
          transform: `scale(${cardScale})`,
          transformOrigin: "center top",
          display: "flex",
          flexDirection: "column",
          gap: dim * 0.018,
        }}
      >
        <div
          data-notification-header="true"
          style={{
            display: "flex",
            alignItems: "center",
            gap: dim * 0.014,
            opacity: headerOpacity,
          }}
        >
          <div
            style={{
              width: iconSize,
              height: iconSize,
              borderRadius: iconRadius,
              backgroundColor: "rgba(0,0,0,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              fontSize: iconFont,
            }}
          >
            <Emoji char={appIcon} size={iconFont} verticalAlign="middle" />
          </div>

          <span
            style={{
              fontSize: appFontSize,
              fontWeight: 600,
              color: "rgba(0,0,0,0.65)",
              letterSpacing: 0.2,
            }}
          >
            {appName}
          </span>

          <span
            style={{
              fontSize: timeFontSize,
              color: "rgba(0,0,0,0.4)",
              marginLeft: "auto",
            }}
          >
            now
          </span>
        </div>

        <div
          style={{
            fontSize: msgFontSize,
            fontWeight: 400,
            color: "#1c1c1e",
            lineHeight: 1.28,
            display: "flex",
            flexWrap: "wrap",
            gap: `0 ${dim * 0.009}px`,
          }}
        >
          {words.map((word, wi) => {
            const wordP = interpolate(
              presentationProgress,
              [wordStart + wi * wordSlice, wordStart + wi * wordSlice + wordSlice * 0.6],
              [0, 1],
              CLAMP,
            );
            return (
              <span
                key={wi}
                style={{
                  opacity: wordP,
                  transform: `translateY(${(1 - wordP) * 4}px)`,
                  display: "inline-block",
                }}
              >
                {renderWithEmoji(word, msgFontSize)}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
