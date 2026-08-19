/**
 * ProblemSolution
 *
 * Two-phase pill+statement reveal. Problem phase: red pill + big problem
 * text scale in, hold with a tremor, then fall away. Solution phase:
 * green pill + big solution text rise in together while a green confetti
 * burst fires upward from the pill.
 *
 * Gradient background is NOT included — paint that with SceneBackground
 * (or equivalent) above this primitive. Title TemplateText is not used
 * by the source; the pill + statement carry the entire message.
 */

import * as React from "react";
import {
  interpolate,
  spring,
  type SpringConfig,
} from "../../motion";
import { smoothSize } from "../../scene-templates/template-text";
import { stripPipe } from "../../typography";
import { TOKEN_DEFAULTS } from "../../theme";

const SPRING_TEXT: SpringConfig = { damping: 10, stiffness: 150 };

// ─── Typed component (direct use from templates) ────────────────

/**
 * Props for ProblemSolution.
 *
 * - `progress` (required): scene progress 0→1 driving both phases.
 * - `width` / `height` (required): scene viewport. Drives portrait vs
 *   landscape anchor offsets and the orientation-aware scale factor.
 * - `problemText` (required): the problem statement — 1 short sentence.
 *   Pipe-delimited suffixes are stripped.
 * - `solutionText` (required): the solution statement — 1 short sentence.
 *   Pipe suffixes stripped.
 * - `problemLabel` (optional, default `"THE PROBLEM"`): uppercase pill text
 *   for the problem phase.
 * - `solutionLabel` (optional, default `"THE SOLUTION"`): uppercase pill
 *   text for the solution phase.
 * - `textColor` (optional, default `#ffffff`): main statement text color.
 * - `font` (optional, default `Inter`).
 * - `beatIntensity` (optional, default `0`): accepted for API parity;
 *   currently unused (source doesn't beat-modulate this template).
 */
export interface ProblemSolutionProps {
  progress: number;
  width: number;
  height: number;
  problemText: string;
  solutionText: string;
  problemLabel?: string;
  solutionLabel?: string;
  textColor?: string;
  font?: string;
  beatIntensity?: number;
}

export const ProblemSolution: React.FC<ProblemSolutionProps> = ({
  progress,
  width,
  height,
  problemText: rawProblemText,
  solutionText: rawSolutionText,
  problemLabel = "THE PROBLEM",
  solutionLabel = "THE SOLUTION",
  textColor = "#ffffff",
  font = TOKEN_DEFAULTS.font,
  beatIntensity = 0,
}) => {
  void beatIntensity;
  const s = Math.min(width, height) / 1080;

  const problemText = stripPipe(String(rawProblemText || ""));
  const solutionText = stripPipe(String(rawSolutionText || ""));
  const problemColor = "#ef4444";
  const solutionColor = "#22c55e";
  const isLandscape = width > height;
  const pillTop = height * (isLandscape ? 0.3 : 0.38);
  const textTop = height * (isLandscape ? 0.45 : 0.46);

  // ── Font sizing ───────────────────────────────────────────────
  const labelFontSize = 32 * s;
  const longerChars = Math.max(problemText.length, solutionText.length, 1);
  const mainSize = smoothSize(longerChars, 70, 88, 60) * s;

  // ── Phase orchestration ───────────────────────────────────────
  const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

  const problemLabelOpacity = interpolate(progress, [0.03, 0.10], [0, 1], CLAMP);
  const problemPillP = spring(interpolate(progress, [0.03, 0.15], [0, 1], CLAMP), { damping: 9, stiffness: 220 });
  const problemPillScale = interpolate(problemPillP, [0, 1], [0.55, 1]);
  const problemTextP = spring(interpolate(progress, [0.10, 0.25], [0, 1], CLAMP), SPRING_TEXT);
  const problemTextScale = interpolate(problemTextP, [0, 1], [1.4, 1]);
  const problemTextOpacity = interpolate(progress, [0.10, 0.20], [0, 1], CLAMP);
  const tremorActive = progress > 0.20 && progress < 0.40;
  const tremorX = tremorActive ? Math.sin(progress * 90) * 3 * s : 0;
  const problemFadeOut = interpolate(progress, [0.40, 0.48], [1, 0], CLAMP);
  const problemFallY = interpolate(progress, [0.40, 0.50], [0, height * 0.35], CLAMP);

  const solutionOverall = interpolate(progress, [0.50, 0.55], [0, 1], CLAMP);

  const SOLUTION_LAND = [0.55, 0.70] as const;
  const solutionLandP = spring(
    interpolate(progress, [SOLUTION_LAND[0], SOLUTION_LAND[1]], [0, 1], CLAMP),
    { damping: 9, stiffness: 220 },
  );
  const solutionLandScale = interpolate(solutionLandP, [0, 1], [0.7, 1]);
  const solutionLandRiseY = interpolate(solutionLandP, [0, 1], [40 * s, 0]);
  const solutionLandOpacity = interpolate(
    progress,
    [SOLUTION_LAND[0], SOLUTION_LAND[0] + 0.05],
    [0, 1],
    CLAMP,
  );
  const solutionLabelOpacity = solutionLandOpacity;
  const solutionPillScale = solutionLandScale;
  const solutionTextOpacity = solutionLandOpacity;
  const solutionTextScale = solutionLandScale;
  const solutionTextRiseY = solutionLandRiseY;

  // Confetti burst — fires UPWARD from above the pill as it lands.
  const CONFETTI_COUNT = 14;
  const CONFETTI_ANGLE_JITTER = [-12, 8, -5, 14, -7, 11, -16, 6, -9, 13, -4, 10, -11, 7];
  const CONFETTI_DISTANCE = [60, 230, 100, 180, 130, 260, 80, 210, 50, 240, 150, 90, 220, 170];
  const CONFETTI_ROTATION = [-180, 220, -140, 260, -200, 180, -240, 200, -160, 240, -200, 280, -180, 220];
  const CONFETTI_COLORS = [
    "#22c55e",
    "#4ade80",
    "#86efac",
    "#bbf7d0",
    "#dcfce7",
    "#f0fdf4",
  ];
  const CONFETTI_TINT_INDEX = [0, 1, 2, 0, 3, 1, 4, 0, 2, 1, 5, 0, 3, 2];
  const confettiRaw = interpolate(progress, [0.55, 0.70], [0, 1], CLAMP);
  const confettiActive = confettiRaw > 0 && confettiRaw < 1;
  const confettiDist = 1 - Math.pow(1 - confettiRaw, 2.5);

  return (
    <>
      {/* Problem phase — falls down on exit */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: problemFadeOut,
          transform: `translateY(${problemFallY}px)`,
        }}
      >
        {/* Pill */}
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
              color: problemColor,
              letterSpacing: 3 * s,
              textTransform: "uppercase" as const,
              whiteSpace: "nowrap" as const,
              opacity: problemLabelOpacity,
              transform: `scale(${problemPillScale})`,
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
        {/* Main text */}
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
            letterSpacing: -1,
            opacity: problemTextOpacity,
            transform: `translateX(${tremorX}px) scale(${problemTextScale})`,
            fontFamily: font,
            textShadow: "0 2px 12px rgba(0,0,0,0.15)",
          }}
        >
          {problemText}
        </div>
      </div>

      {/* Solution phase */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: solutionOverall,
        }}
      >
        {/* Confetti burst */}
        {confettiActive && Array.from({ length: CONFETTI_COUNT }, (_, i) => {
          const baseAngle = 200 + (i / (CONFETTI_COUNT - 1)) * 140 + CONFETTI_ANGLE_JITTER[i];
          const angleRad = baseAngle * Math.PI / 180;
          const distance = confettiDist * CONFETTI_DISTANCE[i] * s;
          const gravity = confettiRaw * confettiRaw * 35 * s;
          const dx = Math.cos(angleRad) * distance;
          const dy = Math.sin(angleRad) * distance + gravity;
          const rot = confettiRaw * CONFETTI_ROTATION[i];
          const op = interpolate(confettiRaw, [0, 0.08, 0.7, 1], [0, 1, 1, 0]);
          const particleSize = 9 * s;
          const originX = width / 2;
          const originY = pillTop - 6 * s;
          const tint = CONFETTI_COLORS[CONFETTI_TINT_INDEX[i]];
          return (
            <div
              key={`confetti-${i}`}
              style={{
                position: "absolute",
                left: originX - particleSize / 2,
                top: originY - particleSize / 2 * 1.6,
                width: particleSize,
                height: particleSize * 1.6,
                backgroundColor: tint,
                borderRadius: 1 * s,
                transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`,
                opacity: op,
                pointerEvents: "none",
                boxShadow: `0 0 ${4 * s}px ${tint}66`,
              }}
            />
          );
        })}

        {/* Pill */}
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
              color: solutionColor,
              letterSpacing: 3 * s,
              textTransform: "uppercase" as const,
              whiteSpace: "nowrap" as const,
              opacity: solutionLabelOpacity,
              transform: `scale(${solutionPillScale})`,
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
        {/* Main text */}
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
            letterSpacing: -1,
            opacity: solutionTextOpacity,
            transform: `translateY(${solutionTextRiseY}px) scale(${solutionTextScale})`,
            fontFamily: font,
            textShadow: "0 2px 12px rgba(0,0,0,0.15)",
          }}
        >
          {solutionText}
        </div>
      </div>
    </>
  );
};
