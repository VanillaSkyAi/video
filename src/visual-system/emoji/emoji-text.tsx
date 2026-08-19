/**
 * EmojiText / renderWithEmoji — split a string into text runs + emoji runs,
 * rendering each emoji with the viewer's native emoji font while leaving
 * everything else as plain text.
 *
 * Segmentation: grapheme clusters via Intl.Segmenter so ZWJ sequences
 * (👩‍💻) and skin-tone modifiers (👍🏽) stay single units. Adjacent emoji
 * clusters each render as their own span in sequence.
 */

import * as React from "react";
import { Emoji, isNativeEmoji } from "./index";

/** Split text into grapheme clusters (ZWJ + skin-tone safe). */
function toGraphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    const seg = new Seg(undefined, { granularity: "grapheme" });
    const out: string[] = [];
    for (const { segment } of seg.segment(text)) out.push(segment);
    return out;
  }
  // Fallback: code-point spread. Won't keep ZWJ/skin-tone as single units, so
  // those land as separate clusters. Modern browsers all have Segmenter.
  return Array.from(text);
}

export interface RenderWithEmojiOptions {
  /** vertical-align passed to each <Emoji>. */
  verticalAlign?: React.CSSProperties["verticalAlign"];
  /** Extra style merged onto each emoji span. */
  emojiStyle?: React.CSSProperties;
}

/**
 * Split `text` into an array of React nodes — plain-text strings interleaved
 * with <Emoji> spans for every emoji cluster. Returns a single-element
 * `[text]` fast-path when there are no emoji (the common case), so
 * non-emoji text pays ~one regex test.
 *
 * @param text         the string to render
 * @param fontSizePx   surrounding font size in px (emoji box = this size)
 */
export function renderWithEmoji(
  text: string,
  fontSizePx: number,
  opts?: RenderWithEmojiOptions,
): React.ReactNode[] {
  if (!text) return [text];
  // Cheap bail-out: if the whole string has no emoji-range codepoint, return
  // it untouched (no segmentation, no array churn) — the hot path for the vast
  // majority of titles/bodies.
  if (!isNativeEmoji(text)) return [text];

  const clusters = toGraphemes(text);
  const nodes: React.ReactNode[] = [];
  let textBuf = "";
  let key = 0;

  const flushText = () => {
    if (textBuf) {
      nodes.push(textBuf);
      textBuf = "";
    }
  };

  for (const cluster of clusters) {
    if (isNativeEmoji(cluster)) {
      flushText();
      nodes.push(
        <Emoji
          key={`e${key++}`}
          char={cluster}
          size={fontSizePx}
          verticalAlign={opts?.verticalAlign}
          style={opts?.emojiStyle}
        />,
      );
    } else {
      textBuf += cluster;
    }
  }
  flushText();
  return nodes;
}

/**
 * Per-code-unit emoji plan for the typewriter archetype, which reveals text
 * one UTF-16 code unit at a time and indexes by `text.length`. We can't just
 * call renderWithEmoji there (it would re-segment and desync the visibleChars
 * counter), so this maps each cluster's START code-unit index to the full emoji
 * and marks the cluster's CONTINUATION indices as covered (render nothing for
 * them — the start index's span already contains the whole cluster).
 *
 * Returns null when the text contains no emoji (the common case),
 * so the typewriter render keeps its plain per-char path.
 */
export interface EmojiTypewriterPlan {
  /** code-unit index → full emoji cluster char (cluster start). */
  starts: Map<number, string>;
  /** code-unit indices that are continuations of a cluster (render nothing). */
  covered: Set<number>;
}

export function planTypewriterEmoji(text: string): EmojiTypewriterPlan | null {
  if (!text || !isNativeEmoji(text)) return null;
  const starts = new Map<number, string>();
  const covered = new Set<number>();
  let idx = 0;
  let found = false;
  for (const cluster of toGraphemes(text)) {
    const len = cluster.length; // UTF-16 code units
    if (isNativeEmoji(cluster)) {
      found = true;
      // Store the WHOLE cluster char (not just the start unit) so callers can
      // pass it straight to <Emoji> without splitting a grapheme cluster.
      starts.set(idx, cluster);
      for (let k = 1; k < len; k++) covered.add(idx + k);
    }
    idx += len;
  }
  return found ? { starts, covered } : null;
}

export interface EmojiTextProps {
  /** The text to render with emoji in the native operating-system font. */
  children: string;
  /** Surrounding font size in px — sizes each emoji to match a glyph. */
  fontSize: number;
  verticalAlign?: React.CSSProperties["verticalAlign"];
  emojiStyle?: React.CSSProperties;
}

/**
 * Inline wrapper around renderWithEmoji. Renders a React.Fragment of text +
 * emoji spans. Use where a component currently renders a raw `{text}`
 * child and you have the surrounding font size in px.
 */
export const EmojiText: React.FC<EmojiTextProps> = ({
  children,
  fontSize,
  verticalAlign,
  emojiStyle,
}) => {
  const text = typeof children === "string" ? children : "";
  return <>{renderWithEmoji(text, fontSize, { verticalAlign, emojiStyle })}</>;
};
