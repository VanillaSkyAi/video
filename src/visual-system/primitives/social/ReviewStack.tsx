/**
 * ReviewStack — a staggered, fanned review showcase.
 *
 * The primitive twin of `social-review-stack.tsx`'s card stack — and since
 * the ONE implementation: the template composes this
 * component, so template fixes reach custom scenes and vice versa.
 * The template's card anatomy is the tuned source of truth:
 *   - 5-star row (filled stars in starColor, unfilled at 15% white)
 *   - bold white title, muted slate body, dim author line
 *   - per-card delayed spring entrance into a persistent readable row
 *
 * It does NOT own the SceneBackground (gradient or media) — that
 * stays in the scene composer so the same stack can render over
 * brand gradient, Pexels photo, or a custom backdrop.
 *
 * Props:
 *  - progress   — scene progress 0..1 (drives the per-card spring)
 *  - width      — frame width
 *  - height     — frame height
 *  - reviews    — array of `{ stars?, title?, quote?, body?, author? }`.
 *                 `title` is the bold headline; `quote` is an alternate
 *                 content field for customer-defined scenes.
 *                 `body` is the muted supporting copy. Stars clamped 0..5,
 *                 default 5 (all filled — the template look).
 *  - starColor  — color for filled stars (default gold `#facc15`)
 *  - surfaceElevated — explicit brand-kit card surface; falls back to the
 *                 template's tuned near-black card fill
 *  - accent     — brand accent (unused today, kept for parity)
 *  - beatIntensity — optional 0..1 audio reactivity (subtle scale pop)
 */

import * as React from "react";
import {
  interpolate,
  spring,
  SPRING_SNAPPY,
} from "../../motion";
import { stripPipe } from "../../typography";
import { accessibleTextColor, lighten, withOpacity } from "../../theme";

const CLAMP = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

// Subtle deterministic rotations keep the hand-stacked character without
// letting one opaque card cover another card's copy.
const ROTATIONS = [-1.4, 0.8, -0.7, 1.1, -0.9];

export interface ReviewStackEntry {
  /** 0–5 filled stars. Default 5 (all filled). */
  stars?: number;
  /** Bold headline line of the card. */
  title?: string;
  /** Alternate primary line for customer-defined scenes. */
  quote?: string;
  /** Muted supporting copy below the title. */
  body?: string;
  author?: string;
}

export interface ReviewStackProps {
  progress: number;
  width: number;
  height: number;
  reviews: ReviewStackEntry[];
  starColor?: string;
  /** Explicit brand-kit elevated surface for the card fill. */
  surfaceElevated?: string;
  /** Resolved semantic foreground, used when accessible on the card. */
  foreground?: string;
  /** Resolved semantic muted color, used when accessible on the card. */
  muted?: string;
  accent?: string;
  beatIntensity?: number;
}

export const ReviewStack: React.FC<ReviewStackProps> = ({
  progress,
  width,
  height,
  reviews,
  starColor = "#facc15",
  surfaceElevated,
  foreground,
  muted,
  beatIntensity = 0,
}) => {
  const dim = Math.min(width, height);
  const s = dim / 1080;

  const cardBg = surfaceElevated || lighten("#0a0a0f", 0.08);
  const borderColor = lighten("#0a0a0f", 0.15);
  const textPrimary = accessibleTextColor(cardBg, foreground);
  const textSecondary = accessibleTextColor(cardBg, muted);

  const isPortrait = height > width;
  const cardWidth = Math.min(
    width * (isPortrait ? 0.82 : 0.64),
    dim * (isPortrait ? 0.78 : 0.9),
  );
  const cardPad = dim * 0.028;
  const rowGap = Math.min(
    dim * 0.28,
    (height * 0.55) / Math.max(reviews.length - 1, 1),
  );

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
      {reviews.map((review, i) => {
        // The compact stagger completes by 38% for three cards. Since every
        // card keeps its own row, they then share at least 62% of the scene as
        // a fully readable ensemble instead of the newest card covering the
        // previous one.
        const cardStart = 0.02 + i * 0.1;
        const cardEnd = cardStart + 0.16;

        const cardP = spring(
          interpolate(progress, [cardStart, cardEnd], [0, 1], CLAMP),
          SPRING_SNAPPY,
        );

        const cardScale = interpolate(cardP, [0, 1], [0.9, 1]);
        const cardOpacity = Math.min(1, cardP);
        const cardX = interpolate(cardP, [0, 1], [(i % 2 === 0 ? -1 : 1) * 54 * s, 0]);
        const rotation = ROTATIONS[i % ROTATIONS.length];
        const rowOffset = (i - (reviews.length - 1) / 2) * rowGap;

        const stars = review.stars == null
          ? 5
          : Math.max(0, Math.min(5, Math.round(review.stars)));
        const title = stripPipe(review.title || review.quote || "");
        const body = stripPipe(review.body || "");
        const author = stripPipe(review.author || "");

        return (
          <div
            key={i}
            data-review-card={i}
            style={{
              position: "absolute",
              width: cardWidth,
              padding: cardPad,
              backgroundColor: cardBg,
              borderRadius: dim * 0.018,
              border: `1px solid ${borderColor}`,
              boxShadow: `0 ${dim * 0.01}px ${dim * 0.04}px rgba(0,0,0,0.4)`,
              transform: `translateX(${cardX}px) translateY(${rowOffset}px) rotate(${rotation}deg) scale(${cardScale * beatScale})`,
              opacity: cardOpacity,
              zIndex: i,
              top: "50%",
              left: "50%",
              marginLeft: -(cardWidth / 2),
              marginTop: -(dim * 0.11),
            }}
          >
            {/* Stars */}
            <div style={{ display: "flex", gap: 3 * s, marginBottom: dim * 0.011 }}>
              {Array.from({ length: 5 }).map((_, si) => (
                <span
                  key={si}
                  style={{
                    color: si < stars ? starColor : withOpacity(textPrimary, 0.15),
                    fontSize: dim * 0.03,
                    lineHeight: 1,
                  }}
                >
                  ★
                </span>
              ))}
            </div>

            {/* Title */}
            <div
              style={{
                fontSize: dim * 0.034,
                fontWeight: 700,
                color: textPrimary,
                marginBottom: dim * 0.009,
                lineHeight: 1.3,
              }}
            >
              {title}
            </div>

            {/* Body */}
            {body && (
              <div
                style={{
                  fontSize: dim * 0.026,
                  color: textSecondary,
                  lineHeight: 1.5,
                  marginBottom: dim * 0.014,
                }}
              >
                {body}
              </div>
            )}

            {/* Author */}
            {author && (
              <div
                style={{
                  fontSize: dim * 0.024,
                  color: textSecondary,
                  fontWeight: 500,
                }}
              >
                {author}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
