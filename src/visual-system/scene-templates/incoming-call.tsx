/** incomingCall — cinematic backdrop plus reusable iOS call hero. */

import * as React from "react";
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { IncomingCallCard } from "../primitives/social/IncomingCallCard";
import { SceneBackground, getMediaBackgroundProps } from "./scene-background";

export const IncomingCallTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  beatIntensity,
  width,
  height,
  sceneDuration,
  isPlaying = true,
  safeZone,
  backgroundEffect,
}) => {
  const { primary, foreground } = resolveTokens(style);
  const callerName = String(variables.callerName || "Your brand");
  const subtitle = String(variables.subtitle || "is calling....");

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "#000",
        position: "relative",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* [slot: background] */}
      <SceneBackground
        style={style}
        progress={progress}
        sceneDuration={sceneDuration}
        width={width}
        height={height}
        {...getMediaBackgroundProps(variables)}
        backgroundEffect={backgroundEffect}
        seed={`${callerName}${subtitle}`}
        isPlaying={isPlaying}
        beatIntensity={beatIntensity}
      />

      {/* [slot: hero] */}
      <IncomingCallCard
        progress={progress}
        width={width}
        height={height}
        sceneDuration={sceneDuration ?? 4}
        safeZone={{ top: safeZone.top, bottom: safeZone.bottom }}
        callerName={callerName}
        subtitle={subtitle}
        declineLabel={String(variables.declineLabel || "Decline")}
        acceptLabel={String(variables.acceptLabel || "Accept")}
        textColor={foreground}
        accent={primary}
        beatIntensity={beatIntensity}
      />
    </div>
  );
};
