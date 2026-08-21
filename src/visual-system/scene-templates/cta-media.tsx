/** ctaMedia — cinematic backdrop, shared headline, and reusable brand close. */

import React from "react";
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import type { TextArchetype } from "../typography";
import { TemplateText } from "./template-text";
import { CtaMediaClose } from "../primitives/typography/CtaMediaClose";
import { SceneBackground, getMediaBackgroundProps, hasSceneMedia } from "./scene-background";

export const CtaMediaTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  motionProgress = progress,
  width,
  height,
  sceneDuration,
  beatIntensity,
  textArchetype,
  safeZone,
  isPlaying = true,
  backgroundEffect,
}) => {
  const { primary, foreground, font } = resolveTokens(style);
  const textColor = foreground;
  const headline = String(variables.headline || "");

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
        seed={headline}
        isPlaying={isPlaying}
        beatIntensity={beatIntensity}
      />

      {/* [slot: caption] */}
      <TemplateText
        overMedia={hasSceneMedia(variables)}
        motionProgress={motionProgress}
        typeTreatment={resolveTokens(style).preset.type}
        archetype={(textArchetype as TextArchetype) || "subtle"}
        text={headline}
        progress={progress}
        sceneDuration={sceneDuration ?? 4}
        width={width}
        height={height}
        position="center"
        sizeRole="headline"
        safeZone={safeZone}
        font={font}
        color={textColor}
        beatIntensity={beatIntensity}
      />

      {/* [slot: hero] Brand mark + bottom address line. */}
      <CtaMediaClose
        progress={progress}
        motionProgress={motionProgress}
        width={width}
        height={height}
        brandName={style.brand.name ?? ""}
        logoUrl={style.brand.logoUrl ?? ""}
        url={String(variables.url || "")}
        cta={String(variables.cta || "")}
        font={font}
        textColor={textColor}
        accent={primary}
        beatIntensity={beatIntensity}
        safeZone={{ left: safeZone.left, right: safeZone.right }}
      />
    </div>
  );
};
