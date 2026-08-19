/**
 * social-tweet — X-style post card on a media background.
 *
 * Card visuals + motion live in the TweetCard primitive
 * (src/visual-system/primitives/social/TweetCard.tsx). This template wires the
 * scene background + variable schema + primitive together.
 */

import * as React from "react";
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { SceneBackground, getMediaBackgroundProps } from "./scene-background";
import { TweetCard } from "../primitives/social/TweetCard";

export const SocialTweetTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  motionProgress = progress,
  beatIntensity,
  width,
  height,
  sceneDuration,
  isPlaying = true,
  backgroundEffect,
}) => {
  const authorName = String(variables.authorName || "Your brand");
  const message = String(variables.message || "");
  const { primary } = resolveTokens(style);
  const seed = (authorName + message).split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);

  /* Boolean field with a defensive string coercion for untyped model output. */
  const verifiedRaw = variables.authorVerified;
  const isVerified = verifiedRaw === true || String(verifiedRaw ?? "").toLowerCase() === "true";

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "#000",
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
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
        backgroundEffect={backgroundEffect}
        seed={seed}
        isPlaying={isPlaying}
        beatIntensity={beatIntensity}
      />

      {/* [slot: hero] Tweet card — TweetCard primitive (post text is the
          content; no separate caption slot) */}
      <TweetCard
        progress={progress}
        motionProgress={motionProgress}
        authorName={authorName}
        authorHandle={String(variables.authorHandle || "")}
        authorVerified={isVerified}
        message={message}
        targetLikes={Number(variables.likes) || 0}
        targetReplies={Number(variables.replies) || 0}
        accent={primary}
        width={width}
        height={height}
        beatIntensity={beatIntensity}
      />
    </div>
  );
};
