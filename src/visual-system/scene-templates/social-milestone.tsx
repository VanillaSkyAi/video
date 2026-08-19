/**
 * social-milestone — follower/subscriber count rolling up to a milestone with celebration.
 *
 * Converted from Remotion FollowerMilestone. Counter rolls up to target number,
 * glow intensifies, then confetti burst + celebration badge pop on hit.
 *
 * Block structure (docs/blocks.md):
 *   background — SceneBackground (brand gradient / Pexels media + scrims)
 *   hero       — MilestoneBadge primitive (rolling number + glow + confetti
 *                + celebration pill)
 *   caption    — the uppercase label inside MilestoneBadge (no TemplateText)
 */
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { SceneBackground, getMediaBackgroundProps } from "./scene-background";
import { stripPipe } from "../typography";
import { MilestoneBadge } from "../primitives/social/MilestoneBadge";

export const SocialMilestoneTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  beatIntensity,
  width,
  height,
  sceneDuration,
  isPlaying = true,
  backgroundEffect,
}) => {
  // Use the canonical semantic accent token.
  const { primary, secondary, foreground, surfaceElevated, font } = resolveTokens(style);

  const label = stripPipe(String(variables.label || "Followers"));
  const gradSeed = label.split("").reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
  const targetNumber = Number(variables.targetNumber) || 10000;
  const rawStart = variables.startNumber != null ? Number(variables.startNumber) : undefined;
  const badgeText = stripPipe(String(variables.badgeText || ""));
  const badgeEmoji = String(variables.badgeEmoji || "🎉");

  // Media-mode legibility: when a Pexels photo/video is behind, MilestoneBadge
  // forces the label to full white and stacks a stronger drop-shadow on
  // number + label so they punch through busy footage. SceneBackground
  // already adds a vignette + bottom scrim. Mirrors bigNumber's treatment.
  const hasMedia = !!String(variables.mediaUrl || "").trim() &&
    String(variables.mediaType || "auto") !== "gradient";

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
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* [slot: background] Gradient background — supports Pexels media when mediaUrl is set */}
      <SceneBackground
        style={style}
        progress={progress}
        sceneDuration={sceneDuration}
        width={width}
        height={height}
        {...getMediaBackgroundProps(variables)}
        backgroundEffect={backgroundEffect}
        seed={gradSeed}
        isPlaying={isPlaying}
        beatIntensity={beatIntensity}
      />
      {/* [slot: hero] Rolling counter + label + confetti + celebration pill —
          shared primitive (owns the milestone timing windows) */}
      <MilestoneBadge
        progress={progress}
        width={width}
        height={height}
        targetNumber={targetNumber}
        label={label}
        startNumber={rawStart}
        badgeText={badgeText}
        badgeEmoji={badgeEmoji}
        accent={primary}
        hasMedia={hasMedia}
        foreground={foreground}
        surfaceElevated={surfaceElevated}
        beatIntensity={beatIntensity}
        confettiBgColor={secondary}
      />
    </div>
  );
};
