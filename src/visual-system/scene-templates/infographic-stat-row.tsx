/**
 * infographic-stat-row — 3 big stats side by side (portrait: stacked).
 *
 * Each stat has a large number, a short label below, and an optional
 * prefix/unit. Numbers count up from 0. Stats stagger in with bouncy
 * spring. TextOverlay title on top.
 */

import React from "react";
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { TemplateText } from "./template-text";
import { StatBadgeRow } from "../primitives/typography/StatBadgeRow";
import { SceneBackground, getMediaBackgroundProps, hasSceneMedia } from "./scene-background";

export const InfographicStatRowTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  motionProgress = progress,
  beatIntensity,
  width,
  height,
  safeZone,
  sceneDuration,
  backgroundEffect,
  isPlaying = true,
}) => {
  const { foreground, font } = resolveTokens(style);
  const textColor = foreground;
  const textsRaw = String(variables.texts || "");

  const stats = [
    { value: String(variables.stat1Value || ""), label: String(variables.stat1Label || "") },
    { value: String(variables.stat2Value || ""), label: String(variables.stat2Label || "") },
    { value: String(variables.stat3Value || ""), label: String(variables.stat3Label || "") },
  ];

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
      {/* [slot: background] */}
      <SceneBackground
        style={style}
        progress={progress}
        sceneDuration={sceneDuration}
        width={width}
        height={height}
        {...getMediaBackgroundProps(variables)}
        backgroundEffect={backgroundEffect}
        seed={textsRaw}
        isPlaying={isPlaying}
        beatIntensity={beatIntensity}
      />

      {/* [slot: caption] */}
      <TemplateText
        overMedia={hasSceneMedia(variables)}
        motionProgress={motionProgress}
        typeTreatment={resolveTokens(style).preset.type}
        archetype="subtle"
        text={String(variables.texts ?? "")}
        progress={progress}
        sceneDuration={sceneDuration ?? 3}
        width={width}
        height={height}
        position="top"
        sizeRole="headline"
        safeZone={safeZone}
        font={font}
        color={textColor}
        beatIntensity={beatIntensity}
      />

      {/* [slot: hero] */}
      <StatBadgeRow
        progress={motionProgress}
        stats={stats}
        width={width}
        height={height}
        font={font}
        textColor={textColor}
      />
    </div>
  );
};
