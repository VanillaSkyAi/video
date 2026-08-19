/**
 * TestimonialCard
 *
 * Dark card with a quote mark + word-by-word quote + horizontal divider
 * + author block (avatar + name + role). Card scales in, quote mark
 * pops, quote reveals word-by-word, divider expands, author rises in.
 *
 * This is the ONE implementation:
 * social-testimonial.tsx composes this component (background glow +
 * SceneBackground stay in the template), so template fixes reach
 * custom scenes and vice versa.
 */

import * as React from "react";
import { interpolate, spring, SPRING_SMOOTH, SPRING_SNAPPY } from "../../motion";
import { accessibleTextColor, autoTextColor } from "../../theme";
import { stripPipe } from "../../typography";
// `lighten` centralizes the color adjustment — for integer
// RGB channels round(v + x) ≡ v + round(x), so the two are bit-identical.
import { TOKEN_DEFAULTS, lighten } from "../../theme";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// ─── Typed component (direct use from templates) ────────────────

export interface TestimonialCardProps {
  /** Scene progress 0→1 */
  progress: number;
  /** The testimonial quote */
  quote: string;
  /** Author name (initial used in avatar) */
  authorName: string;
  /** Author role / title (optional, rendered as a smaller line below name) */
  authorRole?: string;
  /** Avatar background color. Defaults to "#ec4899". */
  avatarColor?: string;
  /** Accent color for the quote mark. Defaults to "#00e5a0". */
  accent?: string;
  /** Explicit brand-kit elevated surface for the card fill. Falls back to
   *  the tuned near-black card. */
  surfaceElevated?: string;
  /** Resolved semantic foreground, used when it is accessible on the card. */
  foreground?: string;
  /** Explicit brand-kit muted text color for the role line. */
  muted?: string;
  /** Frame width */
  width: number;
  /** Frame height */
  height: number;
  /** Beat pulse 0→1 */
  beatIntensity?: number;
}

export const TestimonialCard: React.FC<TestimonialCardProps> = ({
  progress,
  quote: rawQuote,
  authorName: rawAuthorName,
  authorRole: rawAuthorRole = "",
  avatarColor = "#ec4899",
  accent = TOKEN_DEFAULTS.primary,
  surfaceElevated,
  foreground,
  muted,
  width,
  height,
  beatIntensity = 0,
}) => {
  const dim = Math.min(width, height);
  const s = dim / 1080;

  const quote = stripPipe(rawQuote || "");
  const authorName = stripPipe(rawAuthorName || "");
  const authorRole = stripPipe(rawAuthorRole || "");
  const initialChar = authorName.charAt(0).toUpperCase();

  // Card colors — solid dark; explicit brand-kit values win when set
  const cardBg = surfaceElevated || lighten("#0a0a0f", 0.08);
  const borderColor = lighten("#0a0a0f", 0.15);
  const textPrimary = accessibleTextColor(cardBg, foreground);
  const textSecondary = accessibleTextColor(cardBg, muted);

  // Quotation mark entrance
  const quoteMarkP = spring(interpolate(progress, [0.02, 0.2], [0, 1], CLAMP), SPRING_SNAPPY);
  const quoteMarkScale = interpolate(quoteMarkP, [0, 1], [0.3, 1]);
  const quoteMarkOpacity = quoteMarkP;

  // Horizontal divider expand
  const lineWidth = interpolate(progress, [0.35, 0.55], [0, 100], CLAMP);

  // Author entrance
  const authorP = spring(interpolate(progress, [0.45, 0.7], [0, 1], CLAMP), SPRING_SMOOTH);
  const authorY = interpolate(authorP, [0, 1], [20 * s, 0]);
  const authorOpacity = authorP;

  // Card dimensions
  const cardWidth = Math.min(width * 0.75, dim * 0.85);
  const cardPad = dim * 0.045;
  const avatarSize = dim * 0.055;

  // Card entrance
  const cardP = spring(interpolate(progress, [0, 0.15], [0, 1], CLAMP), SPRING_SMOOTH);
  const cardScale = interpolate(cardP, [0, 1], [0.92, 1]);
  const cardOpacity = interpolate(cardP, [0, 1], [0, 1]);

  const beatScale = 1 + beatIntensity * 0.01;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: cardWidth,
          padding: cardPad,
          backgroundColor: cardBg,
          borderRadius: dim * 0.02,
          border: `1px solid ${borderColor}`,
          boxShadow: `0 ${dim * 0.01}px ${dim * 0.04}px rgba(0,0,0,0.4)`,
          position: "relative",
          zIndex: 1,
          transform: `scale(${cardScale * beatScale})`,
          opacity: cardOpacity,
        }}
      >
        {/* Quotation mark */}
        <div
          style={{
            fontSize: dim * 0.08,
            lineHeight: 0.8,
            color: accent,
            fontWeight: 700,
            marginBottom: dim * 0.018,
            transform: `scale(${quoteMarkScale})`,
            opacity: quoteMarkOpacity,
            transformOrigin: "left top",
          }}
        >
          {"“"}
        </div>

        {/* Quote — word-by-word reveal */}
        <div
          style={{
            fontSize: dim * 0.038,
            lineHeight: 1.6,
            color: textPrimary,
            fontWeight: 500,
            marginBottom: dim * 0.032,
            display: "flex",
            flexWrap: "wrap",
            gap: `0 ${dim * 0.007}px`,
          }}
        >
          {quote.split(/\s+/).filter(Boolean).map((word, i, arr) => {
            const wStart = 0.20 + i * (0.30 / Math.max(arr.length, 1));
            const wEnd = Math.min(wStart + 0.08, 0.55);
            const wordOpacity = interpolate(progress, [wStart, wEnd], [0, 1], CLAMP);
            const wordY = interpolate(progress, [wStart, wEnd], [8 * s, 0], CLAMP);
            return (
              <span
                key={i}
                style={{
                  opacity: wordOpacity,
                  transform: `translateY(${wordY}px)`,
                  display: "inline-block",
                }}
              >
                {word}
              </span>
            );
          })}
        </div>

        {/* Horizontal divider */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: dim * 0.028 }}>
          <div style={{ height: 1, width: `${lineWidth}%`, backgroundColor: borderColor }} />
        </div>

        {/* Author section */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: dim * 0.016,
            opacity: authorOpacity,
            transform: `translateY(${authorY}px)`,
          }}
        >
          <div
            style={{
              width: avatarSize,
              height: avatarSize,
              borderRadius: "50%",
              backgroundColor: avatarColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: avatarSize * 0.45,
              fontWeight: 700,
              color: autoTextColor(avatarColor),
              flexShrink: 0,
            }}
          >
            {initialChar}
          </div>
          <div>
            <div
              style={{
                fontSize: dim * 0.032,
                fontWeight: 600,
                color: textPrimary,
                marginBottom: dim * 0.003,
              }}
            >
              {authorName}
            </div>
            {authorRole && (
              <div style={{ fontSize: dim * 0.024, color: textSecondary }}>{authorRole}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
