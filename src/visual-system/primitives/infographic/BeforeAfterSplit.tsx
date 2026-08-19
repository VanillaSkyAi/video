/**
 * BeforeAfterSplit
 * The template composes this component (the
 * brand gradient stays in the template), so the two can no longer drift.
 *
 * Two-phase before/after reveal. Before phase: red BEFORE pill +
 * problem headline + scrambled emoji scatter with chaos jitter. Mid-
 * scene the emojis fall like confetti while pill+headline crossfade.
 * After phase: green AFTER pill + solution headline + solution emojis
 * pop in with a happy bounce.
 *
 * Gradient background is NOT included — paint that with SceneBackground
 * above this primitive. The optional `beforeUrl` / `afterUrl` props let
 * a consumer paint a media still behind the corresponding phase (e.g. a
 * before screenshot vs after screenshot); when omitted the emoji
 * scatter carries the contrast on its own.
 */

import * as React from "react";
import {
  interpolate,
  spring,
  type SpringConfig,
} from "../../motion";
import { smoothSize } from "../../scene-templates/template-text";
import { stripPipe } from "../../typography";
import { Emoji } from "../../emoji";
import { renderWithEmoji } from "../../emoji/emoji-text";
import { TOKEN_DEFAULTS } from "../../theme";

const SPRING_POP: SpringConfig = { damping: 6, stiffness: 250 };
const SPRING_HAPPY: SpringConfig = { damping: 9, stiffness: 220 };
const SPRING_TEXT: SpringConfig = { damping: 10, stiffness: 150 };

// 16 deterministic scatter slots framing the central text zone.
const POSITIONS = [
  { x: 0.06, y: 0.06 }, { x: 0.30, y: 0.10 }, { x: 0.62, y: 0.07 }, { x: 0.92, y: 0.09 },
  { x: 0.08, y: 0.26 }, { x: 0.92, y: 0.24 }, { x: 0.04, y: 0.40 }, { x: 0.96, y: 0.42 },
  { x: 0.04, y: 0.62 }, { x: 0.96, y: 0.60 },
  { x: 0.10, y: 0.78 }, { x: 0.34, y: 0.82 }, { x: 0.66, y: 0.80 }, { x: 0.90, y: 0.78 },
  { x: 0.22, y: 0.92 }, { x: 0.78, y: 0.94 },
];
const ROTATIONS = [-12, 8, -5, 15, -8, 10, -15, 6, -10, 12, -6, 14, -9, 7, -13, 11];
const POP_ORDER = [7, 12, 3, 9, 0, 14, 5, 11, 2, 8, 15, 4, 10, 1, 13, 6];
const FALL_SWAY = [0.7, -1.0, 0.4, -0.6, 0.9, -0.3, 0.5, -0.8, 0.6, -0.5, 0.3, -0.9, 0.8, -0.4, 0.2, -0.7];

// ─── Typed component (direct use from templates) ────────────────

/**
 * Props for BeforeAfterSplit.
 *
 * - `progress` (required): scene progress 0→1 driving both phases.
 * - `width` / `height` (required): scene viewport. Drives the emoji-
 *   scatter zone and orientation-aware text scaling.
 * - `problemHeadline` (required): the BEFORE headline, 2-5 words.
 *   Centered beneath the BEFORE pill. Pipe suffixes stripped.
 * - `solutionHeadline` (required): the AFTER headline, 2-5 words.
 *   Centered beneath the AFTER pill. Pipe suffixes stripped.
 * - `problemEmojis` (optional): emoji glyphs cycled across 16 scatter
 *   slots during the before phase. Defaults to `["📅", "😰"]` if empty.
 * - `solutionEmojis` (optional): emoji glyphs cycled across 16 scatter
 *   slots during the after phase. Defaults to `["✨", "✅"]` if empty.
 * - `beforeLabel` (optional, default `"BEFORE"`): uppercase pill text
 *   shown during the before phase.
 * - `afterLabel` (optional, default `"AFTER"`): uppercase pill text
 *   shown during the after phase.
 * - `beforeUrl` (optional): when present, painted as a cover-fit
 *   image behind the before phase (replaces nothing — sits behind the
 *   emojis + pill + headline so the emojis still tell the story).
 * - `afterUrl` (optional): same but for the after phase.
 * - `textColor` (optional, default `#ffffff`): headline color.
 * - `font` (optional, default `Inter`).
 * - `beatIntensity` (optional, default `0`): drives a small per-emoji
 *   beat-pulse on both phases.
 */
export interface BeforeAfterSplitProps {
  progress: number;
  width: number;
  height: number;
  problemHeadline: string;
  solutionHeadline: string;
  problemEmojis?: string[];
  solutionEmojis?: string[];
  showEmojis?: boolean;
  beforeLabel?: string;
  afterLabel?: string;
  beforeUrl?: string;
  afterUrl?: string;
  textColor?: string;
  font?: string;
  beatIntensity?: number;
}

export const BeforeAfterSplit: React.FC<BeforeAfterSplitProps> = ({
  progress,
  width,
  height,
  problemHeadline: rawProblemHeadline,
  solutionHeadline: rawSolutionHeadline,
  problemEmojis: rawProblemEmojis = [],
  solutionEmojis: rawSolutionEmojis = [],
  showEmojis = true,
  beforeLabel = "BEFORE",
  afterLabel = "AFTER",
  beforeUrl,
  afterUrl,
  textColor = "#ffffff",
  font = TOKEN_DEFAULTS.font,
  beatIntensity = 0,
}) => {
  const s = Math.min(width, height) / 1080;

  const problemLabel = String(beforeLabel || "BEFORE").toUpperCase();
  const solutionLabel = String(afterLabel || "AFTER").toUpperCase();
  const problemHeadline = stripPipe(String(rawProblemHeadline || ""));
  const solutionHeadline = stripPipe(String(rawSolutionHeadline || ""));
  const problemTypes = showEmojis ? rawProblemEmojis.filter((e) => (e || "").length > 0) : [];
  const solutionTypes = showEmojis ? rawSolutionEmojis.filter((e) => (e || "").length > 0) : [];
  if (showEmojis && problemTypes.length === 0) problemTypes.push("📅", "😰");
  if (showEmojis && solutionTypes.length === 0) solutionTypes.push("✨", "✅");

  const beforeColor = "#ef4444";
  const afterColor = "#22c55e";

  const SLOT_COUNT = POSITIONS.length;
  const problemEmojis = showEmojis
    ? Array.from({ length: SLOT_COUNT }, (_, i) => problemTypes[POP_ORDER[i] % problemTypes.length])
    : [];
  const solutionEmojis = showEmojis
    ? Array.from({ length: SLOT_COUNT }, (_, i) => solutionTypes[POP_ORDER[i] % solutionTypes.length])
    : [];

  // ── Phase windows ────────────────────────────────────────────
  const PROBLEM_BASE = 0.05;
  const PROBLEM_STAGGER = 0.010;
  const FALL_START = 0.35;
  const FALL_END = 0.50;
  const HEADLINE_FADE = [0.40, 0.50] as const;
  const SOLUTION_BASE = 0.50;
  const SOLUTION_STAGGER = 0.008;

  const problemHeadlineMask = 1 - interpolate(progress, [HEADLINE_FADE[0], HEADLINE_FADE[1]], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const solutionHeadlineMask = interpolate(progress, [HEADLINE_FADE[0] + 0.05, HEADLINE_FADE[1] + 0.05], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Layout ───────────────────────────────────────────────────
  const emojiFontSize = Math.min(72 * s, width * 0.085);
  const emojiHalf = emojiFontSize / 2;
  const padX = emojiHalf + 8 * s;
  const padY = emojiHalf + 8 * s;
  const zoneTop = padY;
  const zoneLeft = padX;
  const zoneWidth = width - padX * 2;
  const zoneHeight = height - padY * 2;

  const labelFontSize = 32 * s;
  const pillTop = height * 0.38;
  const textTop = height * 0.46;
  const longerChars = Math.max(problemHeadline.length, solutionHeadline.length, 1);
  const mainSize = smoothSize(longerChars, 70, 88, 60) * s;

  const problemTextP = spring(
    interpolate(progress, [0.10, 0.25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    SPRING_TEXT,
  );
  const problemTextScale = interpolate(problemTextP, [0, 1], [1.4, 1]);
  const problemTextOpacity = interpolate(progress, [0.10, 0.20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const solutionTextP = spring(
    interpolate(progress, [0.55, 0.70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    SPRING_TEXT,
  );
  const solutionTextScale = interpolate(solutionTextP, [0, 1], [1.4, 1]);
  const solutionTextOpacity = interpolate(progress, [0.55, 0.65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <>
      {/* Optional before media — painted behind the before phase scatter */}
      {beforeUrl ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: problemHeadlineMask * 0.6,
            backgroundImage: `url(${beforeUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            pointerEvents: "none",
          }}
        />
      ) : null}

      {/* Optional after media */}
      {afterUrl ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: solutionHeadlineMask * 0.6,
            backgroundImage: `url(${afterUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            pointerEvents: "none",
          }}
        />
      ) : null}

      {/* Problem emojis — scrambled fast pop, jitter, then gravity-fall */}
      {problemEmojis.map((emoji, i) => {
        const pos = POSITIONS[i];
        const rotation = ROTATIONS[i];
        const popRank = POP_ORDER[i];
        const sway = FALL_SWAY[i];
        const cx = zoneLeft + pos.x * zoneWidth;
        const cy = zoneTop + pos.y * zoneHeight;

        const popDelay = PROBLEM_BASE + popRank * PROBLEM_STAGGER;
        const popP = spring(
          interpolate(progress, [popDelay, popDelay + 0.10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          SPRING_POP,
        );
        const emojiScale = interpolate(popP, [0, 1], [0, 1]);

        const settled = popP > 0.5;
        const inFall = progress >= FALL_START;
        const shakePhase = progress * 50;
        const shakeX = settled && !inFall ? Math.sin(shakePhase + i * 1.7) * 7 * s : 0;
        const shakeY = settled && !inFall ? Math.cos(shakePhase + i * 2.3) * 5 * s : 0;
        const shakeRotate = settled && !inFall
          ? rotation + Math.sin(shakePhase * 0.7 + i * 3.1) * 9
          : rotation;

        const fallProgress = interpolate(progress, [FALL_START, FALL_END], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const fallY = fallProgress * fallProgress * height * 1.3;
        const fallSwayX = Math.sin(fallProgress * Math.PI * 2 + i * 0.7) * 30 * s * sway;
        const fallRotate = fallProgress * (180 + (i % 5) * 60) * (i % 2 === 0 ? 1 : -1);

        const fadeOut = interpolate(progress, [FALL_END - 0.02, FALL_END + 0.02], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const beatPulse = 1 + beatIntensity * 0.04 * ((i % 2 === 0) ? 1 : -0.5);

        return (
          <div
            key={`problem-${i}`}
            style={{
              position: "absolute",
              left: cx - emojiHalf,
              top: cy - emojiHalf,
              width: emojiFontSize,
              height: emojiFontSize,
              fontSize: emojiFontSize,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: fadeOut,
              transform: `translate(${shakeX + fallSwayX}px, ${shakeY + fallY}px) rotate(${shakeRotate + fallRotate}deg) scale(${emojiScale * beatPulse})`,
              transformOrigin: "center center",
              pointerEvents: "none",
            }}
          >
            <Emoji char={emoji} size={emojiFontSize} verticalAlign="baseline" />
          </div>
        );
      })}

      {/* Solution emojis — scrambled happy bouncy pop in same slots */}
      {solutionEmojis.map((emoji, i) => {
        const pos = POSITIONS[i];
        const popRank = POP_ORDER[i];
        const cx = zoneLeft + pos.x * zoneWidth;
        const cy = zoneTop + pos.y * zoneHeight;

        const popDelay = SOLUTION_BASE + popRank * SOLUTION_STAGGER;
        const popP = spring(
          interpolate(progress, [popDelay, popDelay + 0.14], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          SPRING_HAPPY,
        );
        const emojiScale = interpolate(popP, [0, 1], [0, 1]);
        const liftY = (1 - Math.min(1, popP)) * 14 * s;

        const settled = popP > 0.95;
        const breathe = settled
          ? 1 + Math.sin(progress * Math.PI * 4 + i * 0.9) * 0.015
          : 1;

        const exitP = interpolate(progress, [0.90, 1.0], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const exitFade = 1 - exitP;
        const exitLift = exitP * -20 * s;
        const exitShrink = 1 - exitP * 0.06;

        const beatPulse = 1 + beatIntensity * 0.03;
        const opacity = interpolate(popP, [0, 0.3], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }) * exitFade;

        return (
          <div
            key={`solution-${i}`}
            style={{
              position: "absolute",
              left: cx - emojiHalf,
              top: cy - emojiHalf,
              width: emojiFontSize,
              height: emojiFontSize,
              fontSize: emojiFontSize,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity,
              transform: `translateY(${liftY + exitLift}px) scale(${emojiScale * breathe * beatPulse * exitShrink})`,
              transformOrigin: "center center",
              pointerEvents: "none",
            }}
          >
            <Emoji char={emoji} size={emojiFontSize} verticalAlign="baseline" />
          </div>
        );
      })}

      {/* BEFORE pill + headline */}
      <div style={{ position: "absolute", inset: 0, opacity: problemHeadlineMask, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            top: pillTop,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: labelFontSize,
              fontWeight: 700,
              color: beforeColor,
              letterSpacing: 3 * s,
              textTransform: "uppercase" as const,
              whiteSpace: "nowrap" as const,
              transform: `scale(${interpolate(spring(interpolate(progress, [0.03, 0.18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), { damping: 9, stiffness: 220 }), [0, 1], [0.55, 1])})`,
              transformOrigin: "center center",
              fontFamily: font,
              backgroundColor: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 100 * s,
              padding: `${14 * s}px ${36 * s}px`,
              textShadow: "0 1px 6px rgba(0,0,0,0.1)",
            }}
          >
            {problemLabel}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            top: textTop,
            left: 0,
            right: 0,
            fontSize: mainSize,
            fontWeight: 800,
            color: textColor,
            textAlign: "center" as const,
            padding: `0 ${60 * s}px`,
            lineHeight: 1.2,
            opacity: problemTextOpacity,
            transform: `scale(${problemTextScale})`,
            fontFamily: font,
          }}
        >
          {renderWithEmoji(problemHeadline, mainSize)}
        </div>
      </div>

      {/* AFTER pill + headline */}
      <div style={{ position: "absolute", inset: 0, opacity: solutionHeadlineMask, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            top: pillTop,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: labelFontSize,
              fontWeight: 700,
              color: afterColor,
              letterSpacing: 3 * s,
              textTransform: "uppercase" as const,
              whiteSpace: "nowrap" as const,
              transform: `scale(${interpolate(spring(interpolate(progress, [0.50, 0.65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), { damping: 9, stiffness: 220 }), [0, 1], [0.55, 1])})`,
              transformOrigin: "center center",
              fontFamily: font,
              backgroundColor: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 100 * s,
              padding: `${14 * s}px ${36 * s}px`,
              textShadow: "0 1px 6px rgba(0,0,0,0.1)",
            }}
          >
            {solutionLabel}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            top: textTop,
            left: 0,
            right: 0,
            fontSize: mainSize,
            fontWeight: 800,
            color: textColor,
            textAlign: "center" as const,
            padding: `0 ${60 * s}px`,
            lineHeight: 1.2,
            opacity: solutionTextOpacity,
            transform: `scale(${solutionTextScale})`,
            fontFamily: font,
          }}
        >
          {renderWithEmoji(solutionHeadline, mainSize)}
        </div>
      </div>
    </>
  );
};
