/**
 * social-testimonial — animated quote card with word-by-word text reveal.
 *
 * Converted from Remotion TestimonialCard pattern. Dark card with large
 * quotation mark, word-by-word quote reveal, horizontal divider, and
 * author avatar + name section. No TextOverlay — text is integral to the visual.
 *
 * Block structure (docs/blocks.md):
 *   background — SceneBackground + accent radial glow behind the card
 *   hero       — TestimonialCard primitive (quote mark, word-by-word quote,
 *                divider, author row; text integral — no caption slot)
 */
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { withOpacity } from "../theme";
import { SceneBackground, getMediaBackgroundProps } from "./scene-background";
import { stripPipe } from "../typography";
import { TestimonialCard } from "../primitives/social/TestimonialCard";

export const SocialTestimonialTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  beatIntensity,
  width,
  height,
  sceneDuration,
  isPlaying = true,
}) => {
  const dim = Math.min(width, height);
  const { primary, foreground, font, surfaceElevated, muted } = resolveTokens(style);

  const quote = stripPipe(String(variables.quote || ""));
  const gradSeed = quote.split("").reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
  const authorName = String(variables.authorName || "Jessica Torres");
  const authorRole = String(variables.authorRole || "");
  const avatarBg = primary;

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "#000",
        position: "relative",
        overflow: "hidden",
        fontFamily: font,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* [slot: background] Gradient / media backdrop */}
      <SceneBackground
        style={style}
        progress={progress}
        sceneDuration={sceneDuration}
        width={width}
        height={height}
        {...getMediaBackgroundProps(variables)}
        seed={gradSeed}
        isPlaying={isPlaying}
        beatIntensity={beatIntensity}
      />
      {/* [slot: background] Glow behind card — large radial gradient (replaces filter: blur) */}
      <div
        style={{
          position: "absolute",
          width: dim * 0.9,
          height: dim * 0.7,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${withOpacity(primary, 0.15)} 0%, ${withOpacity(primary, 0.05)} 40%, transparent 70%)`,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      {/* [slot: hero] Quote card — shared primitive */}
      <TestimonialCard
        progress={progress}
        quote={quote}
        authorName={authorName}
        authorRole={authorRole}
        avatarColor={avatarBg}
        accent={primary}
        surfaceElevated={surfaceElevated}
        foreground={foreground}
        muted={muted}
        width={width}
        height={height}
        beatIntensity={beatIntensity}
      />
    </div>
  );
};
