/**
 * showcase-web — block-shaped browser/tablet product reveal.
 *
 * The template owns the outer scene and caption. SceneBackground owns the
 * atmosphere, WebMockup owns the device entrance, and ProductSurface (inside
 * WebMockup) owns screenshot focus, camera motion, and feature annotations.
 */

import React from "react";
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { TemplateText } from "./template-text";
import type { TextArchetype } from "../typography";
import { WebMockup } from "../primitives/devices/WebMockup";
import { resolveProductSurfaceMotion } from "../primitives/devices/product-surface-config";
import { SceneBackground, getMediaBackgroundProps, hasSceneMedia } from "./scene-background";

export const ShowcaseWebTemplate: React.FC<SceneTemplateProps> = ({
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
  const frame = String(variables.frame || "browser").toLowerCase() === "tablet"
    ? "tablet"
    : "browser";

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

      {/* [slot: caption] Shared top headline. */}
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

      {/* [slot: hero] Device frame + shared ProductSurface treatment. */}
      <WebMockup
        progress={progress}
        width={width}
        height={height}
        frame={frame}
        screenMediaUrl={screenMediaUrl}
        screens={screens}
        addressBarUrl={String(variables.addressBarUrl || "")}
        font={font}
        accent={primary}
        secondary={secondary}
        bg={background.type === "solid" ? background.color : undefined}
        beatIntensity={beatIntensity}
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
