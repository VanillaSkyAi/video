/**
 * social-review-stack — stacked review cards with staggered spring entrance.
 *
 * Converted from Remotion AppStoreReviews. Three review cards stacked with
 * slight rotations, each sliding in with a spring delay. Gold star ratings,
 * dark cards on dark background.
 *
 * Block structure (docs/blocks.md):
 *   background — SceneBackground (brand gradient / Pexels media + scrims)
 *   hero       — ReviewStack primitive (the card stack IS the scene; no
 *                separate caption slot — review titles carry the text)
 */
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { SceneBackground, getMediaBackgroundProps } from "./scene-background";
import { ReviewStack } from "../primitives/social/ReviewStack";

/** Build reviews array from individual variable fields */
function buildReviews(variables: Record<string, unknown>): { title: string; body: string; author: string }[] {
  const reviews: { title: string; body: string; author: string }[] = [];
  for (let i = 1; i <= 3; i++) {
    const title = String(variables[`review${i}Title`] || "");
    if (!title) continue;
    reviews.push({
      title,
      body: String(variables[`review${i}Body`] || ""),
      author: String(variables[`review${i}Author`] || ""),
    });
  }
  return reviews;
}

export const SocialReviewStackTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  beatIntensity,
  width,
  height,
  sceneDuration,
  isPlaying = true,
}) => {
  const { font, foreground, surfaceElevated, muted } = resolveTokens(style);
  const starColor = "#facc15";

  const reviews = buildReviews(variables);
  const gradSeed = String(variables.review1Title || "review").split("").reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);

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
      {/* [slot: hero] Stacked review cards — shared primitive */}
      <ReviewStack
        progress={progress}
        width={width}
        height={height}
        reviews={reviews}
        starColor={starColor}
        surfaceElevated={surfaceElevated}
        foreground={foreground}
        muted={muted}
        beatIntensity={beatIntensity}
      />
    </div>
  );
};
