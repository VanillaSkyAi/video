/**
 * cardList — headline plus reusable feature-card hero.
 *
 * FeatureList owns orientation, two- or three-card layout, emoji rendering,
 * and exit behavior. This template supplies only the background and caption.
 */

import React from "react";
import { parseList } from "../parse-list";
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { TemplateText } from "./template-text";
import { FeatureList } from "../primitives/infographic/FeatureList";
import { SceneBackground, getMediaBackgroundProps } from "./scene-background";

export const InfographicFeatureListTemplate: React.FC<SceneTemplateProps> = ({
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
  const text = String(variables.texts || "");
  const labels = parseList(variables.items, 3);
  const emojis = parseList(variables.itemEmojis);
  const features = labels.map((title, index) => ({ title, icon: emojis[index] || "✦" }));

  return (
    <div style={{ width, height, backgroundColor: "#000", position: "relative", overflow: "hidden", fontFamily: font }}>
      {/* [slot: background] */}
      <SceneBackground
        style={style}
        progress={progress}
        sceneDuration={sceneDuration}
        width={width}
        height={height}
        {...getMediaBackgroundProps(variables)}
        backgroundEffect={backgroundEffect}
        seed={text}
        isPlaying={isPlaying}
        beatIntensity={beatIntensity}
      />

      {/* [slot: caption] */}
      <TemplateText
        motionProgress={motionProgress}
        typeTreatment={resolveTokens(style).preset.type}
        archetype="subtle"
        text={text}
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
      <FeatureList
        progress={motionProgress}
        width={width}
        height={height}
        features={features}
        textColor={textColor}
        font={font}
        beatIntensity={beatIntensity}
      />
    </div>
  );
};
