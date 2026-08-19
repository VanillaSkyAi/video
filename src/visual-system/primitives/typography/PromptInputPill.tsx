/**
 * PromptInputPill
 *
 * AI prompt-bar focal element: pill scales in as a small circle (icon only),
 * expands horizontally to full width, then typewrites a sample prompt
 * character-by-character. Sparkles icon on the left, blinking cursor at the
 * end of the typed text.
 *
 * prompt-input.tsx consumes this component so both paths share one
 * implementation.
 *
 * Two surfaces:
 *   1. <PromptInputPill {...typedProps} /> — direct use from templates
 *   2. Registered primitive — used by custom scenes via composition JSON
 */

import * as React from "react";
import { interpolate, spring, SPRING_BOUNCY, SPRING_SMOOTH } from "../../motion";
import { stripPipe } from "../../typography";

const CLAMP = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

// ─── Sparkles icon (lifted verbatim from prompt-input) ───────────

const SparklesIcon: React.FC<{ size: number; gradientId: string }> = ({ size, gradientId }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <defs>
      <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="50%" stopColor="#3B82F6" />
        <stop offset="100%" stopColor="#06B6D4" />
      </linearGradient>
    </defs>
    <path
      d="M7.657 6.247c.11-.33.576-.33.686 0l.645 1.937a2.89 2.89 0 0 0 1.829 1.828l1.936.645c.33.11.33.576 0 .686l-1.937.645a2.89 2.89 0 0 0-1.828 1.829l-.645 1.936a.361.361 0 0 1-.686 0l-.645-1.937a2.89 2.89 0 0 0-1.828-1.828l-1.937-.645a.361.361 0 0 1 0-.686l1.937-.645a2.89 2.89 0 0 0 1.828-1.828zM3.794 1.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387A1.73 1.73 0 0 0 4.593 5.69l-.387 1.162a.217.217 0 0 1-.412 0L3.407 5.69A1.73 1.73 0 0 0 2.31 4.593l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387A1.73 1.73 0 0 0 3.407 2.31zM10.863.099a.145.145 0 0 1 .274 0l.258.774c.115.346.386.617.732.732l.774.258a.145.145 0 0 1 0 .274l-.774.258a1.16 1.16 0 0 0-.732.732l-.258.774a.145.145 0 0 1-.274 0l-.258-.774a1.16 1.16 0 0 0-.732-.732L9.1 2.137a.145.145 0 0 1 0-.274l.774-.258c.346-.115.617-.386.732-.732z"
      fill={`url(#${gradientId})`}
    />
  </svg>
);

// ─── Typed component (direct use from templates) ────────────────

export interface PromptInputPillProps {
  progress: number;
  sceneDuration: number;
  /** Prompt text typed into the pill */
  promptText: string;
  /** Pill background color (default #FFFFFF) */
  pillBg?: string;
  /** Color of the typed text (default #374151 — Tailwind gray-700) */
  pillTextColor?: string;
  /** Frame width */
  width: number;
  /** Frame height */
  height: number;
}

export const PromptInputPill: React.FC<PromptInputPillProps> = ({
  progress,
  sceneDuration,
  promptText: rawText,
  pillBg = "#FFFFFF",
  pillTextColor = "#374151",
  width,
  height,
}) => {
  const dim = Math.min(width, height);
  const promptText = stripPipe(rawText || "");
  const seed = promptText.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);

  // Sizing — verbatim from prompt-input
  const pillHeight = dim * 0.13;
  const pillTargetWidth = Math.min(width * 0.86, dim * 0.95);
  const pillCircleWidth = pillHeight;
  const pillRadius = pillHeight / 2;
  const iconSize = pillHeight * 0.46;
  const padLeft = pillHeight * 0.30;
  const fontSizeDefault = pillHeight * 0.42;
  const availableTextWidth = pillTargetWidth - padLeft * 3 - iconSize;
  const naturalTextWidth = promptText.length * fontSizeDefault * 0.55 * 1.06;
  // Allow shrink down to 0.45× — the prior 0.6 floor wasn't aggressive
  // enough for unexpectedly long prompts and left them hard-clipped at
  // the right edge of the pill (stress test caught a 130-char prompt
  // overflowing). 0.45 keeps text readable even after shrink. The pill
  // body has overflow: hidden so anything that still doesn't fit clips
  // cleanly instead of running past the pill border.
  const shrinkFactor =
    naturalTextWidth > availableTextWidth
      ? Math.max(0.45, availableTextWidth / naturalTextWidth)
      : 1;
  const fontSize = fontSizeDefault * shrinkFactor;

  // Reveal sequence — verbatim from prompt-input
  const enterSpring = spring(
    interpolate(progress, [0, 0.10], [0, 1], CLAMP),
    SPRING_BOUNCY,
  );
  const enterScale = 0.7 + 0.3 * enterSpring;
  const enterOpacity = interpolate(progress, [0, 0.08], [0, 1], CLAMP);

  const widthProgress = spring(
    interpolate(progress, [0.10, 0.30], [0, 1], CLAMP),
    SPRING_SMOOTH,
  );
  const pillWidth = pillCircleWidth + (pillTargetWidth - pillCircleWidth) * widthProgress;

  const typeStart = 0.30;
  const typeEnd = 0.68;
  const charsRevealed = Math.max(
    0,
    Math.floor(
      interpolate(progress, [typeStart, typeEnd], [0, promptText.length], CLAMP),
    ),
  );
  const visibleText = promptText.slice(0, charsRevealed);

  const realT = progress * sceneDuration;
  const cursorVisible =
    progress >= typeStart * 0.9 && Math.sin(realT * Math.PI * 2.4) > 0;

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -50%) scale(${enterScale})`,
        opacity: enterOpacity,
      }}
    >
      <div
        style={{
          width: pillWidth,
          height: pillHeight,
          backgroundColor: pillBg,
          borderRadius: pillRadius,
          display: "flex",
          alignItems: "center",
          paddingLeft: padLeft,
          paddingRight: padLeft,
          // Clip at the pill border — even after the 0.45× shrink floor,
          // pathologically long prompts can still exceed the pill width.
          // Clipping at the rounded border looks cleaner than letting text
          // bleed past the right edge.
          overflow: "hidden",
          boxShadow: [
            `inset 0 ${1 * (dim / 1080)}px 0 rgba(255,255,255,0.85)`,
            `0 ${8 * (dim / 1080)}px ${24 * (dim / 1080)}px ${-8 * (dim / 1080)}px rgba(110,80,200,0.10)`,
            `0 ${2 * (dim / 1080)}px ${8 * (dim / 1080)}px ${-4 * (dim / 1080)}px rgba(0,0,0,0.05)`,
          ].join(", "),
          whiteSpace: "nowrap",
        }}
      >
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: iconSize,
            height: iconSize,
          }}
        >
          <SparklesIcon size={iconSize} gradientId={`prompt-input-grad-${seed}`} />
        </div>
        <div
          style={{
            marginLeft: padLeft,
            fontSize,
            lineHeight: 1.4,
            color: pillTextColor,
            fontWeight: 500,
            letterSpacing: -0.5,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <span>{visibleText}</span>
          <span
            style={{
              display: "inline-block",
              width: fontSize * 0.06,
              height: fontSize * 0.95,
              backgroundColor: pillTextColor,
              marginLeft: fontSize * 0.08,
              opacity: cursorVisible ? 0.85 : 0,
              borderRadius: fontSize * 0.03,
            }}
          />
        </div>
      </div>
    </div>
  );
};
