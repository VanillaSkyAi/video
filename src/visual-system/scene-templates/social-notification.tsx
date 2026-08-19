/**
 * social-notification — iOS-style notification card on a media background.
 *
 * Card visuals + motion live in the NotificationCard primitive
 * (src/visual-system/primitives/social/NotificationCard.tsx). This template wires the
 * scene background + variable schema + primitive together.
 */

import * as React from "react";
import type { SceneTemplateProps } from "./types";
import { SceneBackground, getMediaBackgroundProps } from "./scene-background";
import { NotificationCard } from "../primitives/social/NotificationCard";
import { resolveTokens } from "./tokens";

export const SocialNotificationTemplate: React.FC<SceneTemplateProps> = ({
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
  const { font } = resolveTokens(style);
  const message = String(variables.message || "");
  const gradSeed = message.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "#000",
        position: "relative",
        overflow: "hidden",
        fontFamily: font,
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
        seed={gradSeed}
        isPlaying={isPlaying}
        beatIntensity={beatIntensity}
      />

      {/* [slot: hero] Notification card — NotificationCard primitive
          (the message is the content; no separate caption slot) */}
      <NotificationCard
        progress={progress}
        motionProgress={motionProgress}
        appName={String(variables.appName || "Reminder")}
        appIcon={String(variables.appIcon || "🔔")}
        message={message}
        width={width}
        height={height}
        beatIntensity={beatIntensity}
      />
    </div>
  );
};
