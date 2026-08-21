/**
 * showcase-terminal — terminal window with typing animation.
 *
 * macOS-style terminal frame with traffic-light dots. Command types
 * out character by character, then output lines stagger in below.
 * All animation progress-driven. Cursor blinks via progress.
 *
 * The terminal frame itself lives in the TerminalOutput primitive
 * (src/visual-system/primitives/devices/TerminalOutput.tsx) — shared with
 * custom scenes. It owns shrink-to-fit + ellipsis for long commands
 * and output lines so they never clip mid-token at the frame edge.
 */

import React from "react";
import { parseList } from "../parse-list";
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { TemplateText } from "./template-text";
import { TerminalOutput } from "../primitives/devices/TerminalOutput";
import { SceneBackground, getMediaBackgroundProps, hasSceneMedia } from "./scene-background";

export const ShowcaseTerminalTemplate: React.FC<SceneTemplateProps> = ({
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
  const command = String(variables.command || "");
  const promptPrefix = String(variables.promptPrefix || "$");
  const outputLines = parseList(variables.output);

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
      <TerminalOutput
        progress={progress}
        command={command}
        outputLines={outputLines}
        promptPrefix={promptPrefix}
        width={width}
        height={height}
        accent={primary}
        beatIntensity={beatIntensity}
      />
    </div>
  );
};
