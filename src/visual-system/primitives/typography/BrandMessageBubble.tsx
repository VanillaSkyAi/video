/**
 * BrandMessageBubble
 *
 * Single iMessage-style outgoing bubble (cream, right-aligned, sharp
 * bottom-right corner). Typing dots fade in first, then the bubble pops.
 *
 * brand-message.tsx is refactored to consume this primitive; both paths
 * render byte-identical DOM.
 */

import * as React from "react";
import { interpolate } from "../../motion";
import { stripPipe } from "../../typography";
import { renderWithEmoji } from "../../emoji/emoji-text";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const BUBBLE_BG = "rgba(245,242,238,0.92)";
const BUBBLE_TEXT = "#1c1c1e";
const DOT_COLOR = "#8C8C92";

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

const TAIL_WITH_EMOJI = /(\S+)(\s+)([\p{Extended_Pictographic}\p{Emoji_Modifier}\u{FE0E}\u{FE0F}\u{200D}]+)\s*$/u;

/**
 * Render a message and glue the trailing emoji cluster to the last word
 * via a `white-space: nowrap` span, so the emoji can NEVER wrap to its
 * own line at the bottom of the bubble.
 *
 * Why a span and not just NBSP: an earlier fix used U+00A0 (non-breaking
 * space) between the last word and the trailing emoji. NBSP works in the
 * live DOM (preview) but the modern-screenshot SVG-as-image render path
 * does NOT consistently honor NBSP — the emoji wrapped to its own line
 * in the exported MP4 even with NBSP in place (verified by extracting a
 * frame from a real export via ffmpeg). `white-space: nowrap` on a span
 * is a hard CSS rendering rule that all renderers respect.
 *
 * Scoped to the LAST trailing emoji cluster preceded by a word: messages
 * with an emoji mid-sentence still wrap naturally on width. Covers the
 * pictographic set + emoji modifiers + variation selectors (FE0E/F) +
 * ZWJ for composite emoji like the astronaut.
 */
function renderMessageWithEmojiTail(text: string, fontSizePx: number): React.ReactNode {
  const match = TAIL_WITH_EMOJI.exec(text);
  if (!match || match.index === undefined) {
    // No trailing-emoji tail: still render any mid-sentence emoji with the
    // viewer's native emoji font.
    return renderWithEmoji(text, fontSizePx);
  }
  const [, lastWord, space, emoji] = match;
  const leading = text.slice(0, match.index);
  return (
    <>
      {renderWithEmoji(leading, fontSizePx)}
      <span style={{ whiteSpace: "nowrap" }}>
        {lastWord}
        {space}
        {renderWithEmoji(emoji, fontSizePx)}
      </span>
    </>
  );
}

function popIn(t: number, start: number, dur = 0.4): number {
  if (t <= start) return 0;
  if (t >= start + dur) return 1;
  return easeOutBack((t - start) / dur);
}

// ─── Typed component (direct use from templates) ────────────────

export interface BrandMessageBubbleProps {
  progress: number;
  sceneDuration: number;
  /** Sender label (italic, top-left of bubble) */
  brandName: string;
  /** Message text */
  message: string;
  width: number;
  height: number;
  safeZone: { top: number; right: number; bottom: number; left: number };
}

export const BrandMessageBubble: React.FC<BrandMessageBubbleProps> = ({
  progress,
  sceneDuration,
  brandName: rawBrandName,
  message: rawMessage,
  width,
  height,
  safeZone,
}) => {
  const isLandscape = width > height;
  const s = isLandscape
    ? (Math.min(width, height) / 534) * 1.3
    : width / 534;
  const brandName = stripPipe(rawBrandName);
  const message = stripPipe(rawMessage);
  const realTimeSeconds = progress * sceneDuration;

  const typingStart = 0.10;
  const bubbleStart = 0.38;
  const typingPop = popIn(progress, typingStart, 0.10);
  const typingFade = interpolate(progress, [bubbleStart - 0.06, bubbleStart], [1, 0], CLAMP);
  const showTyping = progress >= typingStart && progress < bubbleStart;

  const bubblePop = popIn(progress, bubbleStart, 0.18);
  const showBubble = progress >= bubbleStart;

  const topPad = Math.max(safeZone.top, height * 0.25);
  const sidePad = Math.max(safeZone.left, width * 0.06);

  return (
    <div
      style={{
        position: "absolute",
        top: topPad,
        left: sidePad,
        right: sidePad,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      {showTyping && (
        <div
          style={{
            opacity: typingPop * typingFade,
            transform: `translateY(${(1 - typingPop) * 8 * s}px)`,
            background: BUBBLE_BG,
            borderRadius: 18 * s,
            padding: `${12 * s}px ${16 * s}px`,
            display: "flex",
            gap: 5 * s,
            alignItems: "center",
            boxShadow: `0 ${1 * s}px ${4 * s}px rgba(0,0,0,0.10)`,
          }}
        >
          {[0, 1, 2].map((j) => {
            const phase = (realTimeSeconds * 1.6 + j * 0.2) % 1;
            const y = Math.sin(phase * Math.PI * 2) * 2.5 * s;
            const op = 0.45 + 0.55 * Math.max(0, Math.sin(phase * Math.PI));
            return (
              <div
                key={j}
                style={{
                  width: 7 * s,
                  height: 7 * s,
                  borderRadius: 3.5 * s,
                  background: DOT_COLOR,
                  transform: `translateY(${-y}px)`,
                  opacity: op,
                }}
              />
            );
          })}
        </div>
      )}

      {showBubble && (
        <div
          style={{
            // `width: max-content` forces the bubble to size to its
            // natural one-line content width up to `maxWidth`. Without
            // this, modern-screenshot's foreignObject text shaping (the
            // export path) was using an intrinsic width well below
            // `maxWidth`, breaking text that would have fit on one line
            // in the live DOM — even after the NBSP fix glued the
            // trailing emoji to the last word. With `max-content` +
            // `maxWidth`, the bubble grows up to the cap on a single
            // line, then wraps naturally inside the cap for genuinely
            // long messages.
            width: "max-content",
            maxWidth: width * 0.86,
            // Render with native system fonts in BOTH paths. The export
            // pipeline turns the iframe DOM into an SVG and loads it via
            // <img src="data:image/svg+xml,…">, and SVG-as-image is a
            // sandboxed graphics context that does NOT load @font-face
            // resources (data: or otherwise — this is a browser security
            // model, not a CSP issue). Inter therefore never resolves in
            // the export; the SVG falls back to Helvetica/Helvetica Neue,
            // which is wider at the same point size, and "We built this
            // for you ❤️" wraps inside the pinned bubble box even though
            // the iframe's Inter rendering fit on one line. Naming the
            // system font explicitly here makes the iframe ALSO use that
            // same OS-native font, so preview and export compute identical
            // widths and both fit on one line. See PRs #598/#599/#604 for
            // the months of font-embed work that this finally closes out.
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
            background: BUBBLE_BG,
            color: BUBBLE_TEXT,
            borderRadius: `${22 * s}px ${22 * s}px 0 ${22 * s}px`,
            padding: `${14 * s}px ${18 * s}px ${12 * s}px`,
            fontSize: 23 * s,
            lineHeight: `${29 * s}px`,
            fontWeight: 400,
            opacity: bubblePop,
            transform: `translateY(${(1 - bubblePop) * 8 * s}px) scale(${0.96 + 0.04 * bubblePop})`,
            transformOrigin: "right top",
            boxShadow: `0 ${2 * s}px ${10 * s}px rgba(0,0,0,0.14)`,
          }}
        >
          <div
            style={{
              fontSize: 14 * s,
              fontStyle: "italic",
              fontWeight: 400,
              color: "rgba(0,0,0,0.45)",
              lineHeight: 1.2,
              marginBottom: 6 * s,
            }}
          >
            {brandName}
          </div>
          {renderMessageWithEmojiTail(message, 23 * s)}
        </div>
      )}
    </div>
  );
};
