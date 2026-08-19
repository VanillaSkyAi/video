/**
 * TweetCard
 *
 * X-style post card: avatar + name + verified + handle on the left, X logo
 * top-right, tweet text below, footer with comment + heart counter rolls.
 * Card scales in via spring; counters roll up from 0 over the back half.
 *
 * social-tweet.tsx is refactored to consume this primitive; both paths
 * render byte-identical DOM.
 */

import * as React from "react";
import { interpolate, spring, SPRING_SMOOTH } from "../../motion";
import { autoTextColor } from "../../theme";
import { stripPipe } from "../../typography";
import { renderWithEmoji } from "../../emoji/emoji-text";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

const X = {
  cardBg: "#16181c",
  cardBorder: "#2f3336",
  text: "rgb(230, 230, 230)",
  muted: "#71767b",
  verified: "#1d9bf0",
};

export function formatCount(n: number): string {
  // Boundary rule: never let the leading number reach 4 digits — promote
  // to the next unit. Without this, 999,999 likes rounded to "1000K"
  // (mathematically right but breaks the K-suffix convention). Each
  // branch double-checks the rounded value: if rounding would push it
  // ≥1000, fall through to the next unit so 999,500 ≤ n < 1,000,000
  // displays as "1M" not "1000K".
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs < 1_000) return n.toLocaleString();
  if (abs < 10_000) {
    const v = abs / 1_000;
    const rounded = Number(v.toFixed(1));
    if (rounded < 10) return `${sign}${rounded.toString().replace(/\.0$/, "")}K`;
    // falls through to the integer-K branch
  }
  if (abs < 1_000_000) {
    const k = Math.round(abs / 1_000);
    if (k < 1_000) return `${sign}${k}K`;
    // falls through to M
  }
  if (abs < 10_000_000) {
    const v = abs / 1_000_000;
    const rounded = Number(v.toFixed(1));
    if (rounded < 10) return `${sign}${rounded.toString().replace(/\.0$/, "")}M`;
  }
  if (abs < 1_000_000_000) {
    const m = Math.round(abs / 1_000_000);
    if (m < 1_000) return `${sign}${m}M`;
  }
  const v = abs / 1_000_000_000;
  return `${sign}${v.toFixed(1).replace(/\.0$/, "")}B`;
}

export function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

export function deriveHandle(brandName: string): string {
  const slug = brandName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return slug ? `@${slug}` : "";
}

const XLogo: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 1200 1227" fill="none">
    <path
      d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z"
      fill={X.text}
    />
  </svg>
);

const VerifiedBadge: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none">
    <path
      d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44C12.276 1.819 11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85L6.8 12.46l1.41-1.42 2.262 2.26 4.798-5.23 1.47 1.36-6.198 6.77z"
      fill={X.verified}
    />
  </svg>
);

const CommentIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={X.muted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const HeartIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={X.muted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

// ─── Typed component (direct use from templates) ────────────────

export interface TweetCardProps {
  progress: number;
  motionProgress?: number;
  authorName: string;
  authorHandle?: string;
  authorVerified?: boolean;
  message: string;
  /** Decorative engagement counter. Default 0 (counter just rolls to 0). */
  targetLikes?: number;
  /** Decorative engagement counter. Default 0. */
  targetReplies?: number;
  /** Avatar background tint (defaults to hashed hue of authorName) */
  accent?: string;
  width: number;
  height: number;
  beatIntensity?: number;
}

export const TweetCard: React.FC<TweetCardProps> = ({
  progress,
  motionProgress = progress,
  authorName: rawName,
  authorHandle: rawHandle,
  authorVerified,
  message: rawMessage,
  targetLikes = 0,
  targetReplies = 0,
  accent,
  width,
  height,
  beatIntensity = 0,
}) => {
  const dim = Math.min(width, height);
  const s = dim / 1080;
  const resolvedAccent = accent || `hsl(${hashHue(String(rawName))}, 60%, 55%)`;

  const authorName = stripPipe(rawName);
  const customHandle = stripPipe(rawHandle || "").trim();
  const authorHandle = customHandle || deriveHandle(authorName);
  const isVerified = authorVerified !== false;
  const message = stripPipe(rawMessage);

  const initialChar = authorName.charAt(0).toUpperCase() || "•";

  const cardScale = spring(interpolate(motionProgress, [0, 0.24], [0, 1], CLAMP), SPRING_SMOOTH);
  const cardOpacity = interpolate(motionProgress, [0, 0.18], [0, 1], CLAMP);
  const replyCount = Math.round(interpolate(progress, [0.30, 0.75], [0, targetReplies], CLAMP));
  const likeCount = Math.round(interpolate(progress, [0.35, 0.80], [0, targetLikes], CLAMP));
  const replyDisplay = formatCount(replyCount);
  const likeDisplay = formatCount(likeCount);
  const replyIsTransient = replyDisplay !== formatCount(Math.round(targetReplies));
  const likeIsTransient = likeDisplay !== formatCount(Math.round(targetLikes));
  const beatScale = 1 + beatIntensity * 0.01;

  const cardWidth = Math.min(width * 0.92, dim * 0.95);
  const cardPad = dim * 0.05;
  const cardRadius = dim * 0.026;
  const avatarSize = dim * 0.09;
  const xLogoSize = dim * 0.072;
  const verifiedSize = dim * 0.028;
  const nameFontSize = dim * 0.04;
  const handleFontSize = dim * 0.030;
  const messageFontSize = dim * 0.046;
  const footerIconSize = dim * 0.032;
  const footerFontSize = dim * 0.030;
  const headerToBodyGap = dim * 0.028;
  const bodyToFooterGap = dim * 0.032;

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
      <div
        style={{
          width: cardWidth,
          backgroundColor: X.cardBg,
          borderRadius: cardRadius,
          padding: cardPad,
          border: `1px solid ${X.cardBorder}`,
          boxShadow: [
            `0 ${1 * s}px ${3 * s}px 0 rgba(0,0,0,0.1)`,
            `0 ${1 * s}px ${2 * s}px ${-1 * s}px rgba(0,0,0,0.1)`,
            `0 ${20 * s}px ${60 * s}px rgba(0,0,0,0.45)`,
          ].join(", "),
          opacity: cardOpacity,
          transform: `scale(${cardScale * beatScale})`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: dim * 0.018 }}>
          <div
            style={{
              width: avatarSize,
              height: avatarSize,
              borderRadius: "50%",
              flexShrink: 0,
              overflow: "hidden",
              backgroundColor: resolvedAccent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ color: autoTextColor(resolvedAccent), fontSize: avatarSize * 0.46, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1 }}>
              {initialChar}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: dim * 0.002 }}>
            <div style={{ display: "flex", alignItems: "center", gap: dim * 0.006 }}>
              <span style={{ color: X.text, fontSize: nameFontSize, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {authorName}
              </span>
              {isVerified && <VerifiedBadge size={verifiedSize} />}
            </div>
            <span style={{ color: X.muted, fontSize: handleFontSize, fontWeight: 400, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {authorHandle}
            </span>
          </div>

          <div style={{ flexShrink: 0 }}>
            <XLogo size={xLogoSize} />
          </div>
        </div>

        <div style={{ color: X.text, fontSize: messageFontSize, lineHeight: 1.4, letterSpacing: -0.1, marginTop: headerToBodyGap, wordBreak: "break-word" }}>
          {renderWithEmoji(message, messageFontSize)}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: dim * 0.04, marginTop: bodyToFooterGap }}>
          <div style={{ display: "flex", alignItems: "center", gap: dim * 0.008 }}>
            <CommentIcon size={footerIconSize} />
            <span
              data-transition-semantic={replyIsTransient ? "transient" : undefined}
              style={{
                color: X.muted,
                fontSize: footerFontSize,
                fontVariantNumeric: "tabular-nums",
                ...(replyIsTransient
                  ? { visibility: "var(--vanillasky-transition-semantic-visibility,visible)" as React.CSSProperties["visibility"] }
                  : {}),
              }}
            >
              {replyDisplay}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: dim * 0.008 }}>
            <HeartIcon size={footerIconSize} />
            <span
              data-transition-semantic={likeIsTransient ? "transient" : undefined}
              style={{
                color: X.muted,
                fontSize: footerFontSize,
                fontVariantNumeric: "tabular-nums",
                ...(likeIsTransient
                  ? { visibility: "var(--vanillasky-transition-semantic-visibility,visible)" as React.CSSProperties["visibility"] }
                  : {}),
              }}
            >
              {likeDisplay}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
