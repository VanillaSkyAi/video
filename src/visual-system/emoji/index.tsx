import * as React from "react";

const NATIVE_EMOJI_FONT = "Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif";
const NATIVE_EMOJI = /\p{Emoji_Presentation}|\p{Regional_Indicator}|\u{FE0F}|\u{20E3}/u;

/** True for emoji-presentation graphemes, not plain symbols such as ★ or ✓. */
export function isNativeEmoji(char: string): boolean {
  return NATIVE_EMOJI.test(char);
}

export interface EmojiProps {
  /** The emoji character or grapheme cluster, e.g. "🎉" or "👩‍💻". */
  char: string;
  /** Font size in px. */
  size: number;
  /** vertical-align for inline flow. Defaults to a glyph-like baseline nudge. */
  verticalAlign?: React.CSSProperties["verticalAlign"];
  /** Extra styles merged onto the native emoji span. */
  style?: React.CSSProperties;
}

/** Render emoji with the viewer's OS font while preserving text-style symbols. */
export const Emoji: React.FC<EmojiProps> = ({ char, size, verticalAlign = "-0.15em", style }) => {
  const nativeEmoji = isNativeEmoji(char);
  return (
    <span
      role={nativeEmoji ? "img" : undefined}
      aria-label={nativeEmoji ? char : undefined}
      style={{
        ...(nativeEmoji ? { fontFamily: NATIVE_EMOJI_FONT } : {}),
        fontSize: size,
        lineHeight: 1,
        display: "inline-block",
        verticalAlign,
        ...style,
      }}
    >
      {char}
    </span>
  );
};
