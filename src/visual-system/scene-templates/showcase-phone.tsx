/**
 * showcase-phone — iPhone mockup with optional sliding screens.
 *
 * Single mode: one phone with screenMediaUrl or placeholder.
 * Slides mode (when screen1Url is set): same big phone, 3 screens slide inside the device.
 */

import React from "react";
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { TemplateText } from "./template-text";
import type { TextArchetype } from "../typography";
import { PhoneFrame } from "../primitives/devices/PhoneFrame";
import { resolveProductSurfaceMotion } from "../primitives/devices/product-surface-config";
import { SceneBackground, getMediaBackgroundProps, hasSceneMedia } from "./scene-background";

// ─── Component ──────────────────────────────────────────────────

export const ShowcasePhoneTemplate: React.FC<SceneTemplateProps> = ({
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
  const tokens = resolveTokens(style);
  const { primary, secondary, foreground, font, background } = tokens;
  const textColor = foreground;

  const screenMediaUrl = String(variables.screenMediaUrl || "");
  const extraScreens = [
    String(variables.screen1Url || ""),
    String(variables.screen2Url || ""),
  ].filter(Boolean);
  const screens = extraScreens.length > 0 && screenMediaUrl
    ? [screenMediaUrl, ...extraScreens]
    : extraScreens;

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
      {/* [slot: background] Brand gradient or cinematic media atmosphere. */}
      <SceneBackground
        style={style}
        progress={progress}
        sceneDuration={sceneDuration}
        width={width}
        height={height}
        {...getMediaBackgroundProps(variables)}
        backgroundEffect={backgroundEffect}
        seed={String(variables.texts || "")}
        isPlaying={isPlaying}
        beatIntensity={beatIntensity}
      />

      {/* [slot: caption] Headline — top text area */}
      <TemplateText
        overMedia={hasSceneMedia(variables)}
        motionProgress={motionProgress}
        typeTreatment={tokens.preset.type}
        archetype={(textArchetype as TextArchetype) ?? "subtle"}
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

      {/* [slot: hero] Phone mockup — PhoneFrame primitive */}
      <PhoneFrame
        progress={progress}
        motionProgress={motionProgress}
        screenMediaUrl={screenMediaUrl}
        screens={screens}
        width={width}
        height={height}
        font={font}
        beatIntensity={beatIntensity}
        accent={primary}
        secondary={secondary}
        bg={background.type === "solid" ? background.color : undefined}
        screenFit={variables.screenFit === "contain" ? "contain" : "cover"}
        screenFocusX={Number(variables.screenFocusX ?? 50)}
        screenFocusY={Number(variables.screenFocusY ?? 50)}
        screenMotion={resolveProductSurfaceMotion(variables.screenMotion)}
        screenCalloutText={String(variables.screenCalloutText || "")}
        screenCalloutX={Number(variables.screenCalloutX ?? 70)}
        screenCalloutY={Number(variables.screenCalloutY ?? 35)}
      />
    </div>
  );
};
