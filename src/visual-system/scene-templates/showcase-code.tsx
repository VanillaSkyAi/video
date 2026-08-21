/**
 * showcase-code — code editor window with syntax-highlighted snippet.
 *
 * macOS-style editor frame with traffic-light dots and filename in
 * the title bar. Code lines appear with staggered fade-in. Simple
 * syntax coloring for keywords, strings, comments, and numbers.
 * Same frame style as showcase-terminal.
 *
 * The editor frame itself lives in the CodeEditor primitive
 * (src/visual-system/primitives/devices/CodeEditor.tsx) — shared with custom
 * scenes. It owns shrink-to-fit + ellipsis for long lines so code never
 * clips mid-token at the frame edge.
 */

import React from "react";
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { TemplateText } from "./template-text";
import { CodeEditor } from "../primitives/devices/CodeEditor";
import { SceneBackground, getMediaBackgroundProps, hasSceneMedia } from "./scene-background";

export const ShowcaseCodeTemplate: React.FC<SceneTemplateProps> = ({
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
  const { primary, foreground, font } = resolveTokens(style);
  const textColor = foreground;
  const textsRaw = String(variables.texts || "");

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
      <CodeEditor
        progress={progress}
        code={String(variables.code || "")}
        filename={String(variables.filename || "app.ts")}
        width={width}
        height={height}
        accent={primary}
        beatIntensity={beatIntensity}
      />
    </div>
  );
};
