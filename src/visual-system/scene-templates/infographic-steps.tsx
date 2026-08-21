/**
 * infographic-steps — vertical step-by-step process visualization.
 *
 * Two or three steps form a connected vertical timeline in portrait or a
 * horizontal row in landscape. Animation: the connector draws in reading order,
 * the circles pop in together, and the editable labels follow. Exit cascade
 * slides each step left and fades in reading order.
 *
 * Block structure (docs/blocks.md):
 *   background — brand atmosphere or supplied/stock media (SceneBackground)
 *   caption    — TemplateText headline in the top text area (subtle archetype)
 *   hero       — StepsList primitive (timeline + labels + cascade exit)
 */

import React from "react";
import { parseList } from "../parse-list";
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { TemplateText } from "./template-text";
import { StepsList } from "../primitives/infographic/StepsList";
import { SceneBackground, getMediaBackgroundProps, hasSceneMedia } from "./scene-background";

export const InfographicStepsTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  motionProgress = progress,
  beatIntensity,
  width,
  height,
  textArchetype,
  safeZone,
  sceneDuration,
  backgroundEffect,
  isPlaying,
}) => {
  const { primary, foreground, font } = resolveTokens(style);
  const textColor = foreground;
  const textsRaw = String(variables.texts || "");

  const stepLabels = parseList(variables.steps, 3);
  const stepEmojis = parseList(variables.stepEmojis, 3);

  // textArchetype is intentionally unused — the headline always uses the
  // subtle archetype so the step cascade carries the motion.
  void textArchetype;

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
      {/* [slot: background] Brand atmosphere or cinematic supplied/stock media. */}
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

      {/* [slot: caption] Headline — top text area */}
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

      {/* [slot: hero] Step circles + titles — shared primitive */}
      <StepsList
        progress={motionProgress}
        width={width}
        height={height}
        steps={stepLabels.map((title) => ({ title }))}
        stepEmojis={stepEmojis}
        accent={primary}
        textColor={textColor}
        font={font}
        beatIntensity={beatIntensity}
        safeZone={safeZone}
      />
    </div>
  );
};
