/**
 * prompt-input — AI prompt-field demo, centered.
 *
 * A small pill with an AI-sparkles icon springs in, expands horizontally
 * into a full-width prompt bar, then types out a sample prompt character
 * by character. Use to showcase HOW a user prompts the product — the
 * prompt UX itself becomes the focal element. Pairs with any modern
 * "ask the AI" / "describe what you want" / "type your prompt" affordance.
 *
 * Centered on a solid background (or media if the user sets one). No
 * other text — the prompt form is the entire scene.
 */

import * as React from "react";
import type { SceneTemplateProps } from "./types";
import { SceneBackground, getMediaBackgroundProps } from "./scene-background";
import { stripPipe } from "../typography";
import { PromptInputPill } from "../primitives/typography/PromptInputPill";
import { resolveTokens } from "../theme";

export const PromptInputTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  beatIntensity,
  width,
  height,
  sceneDuration,
  isPlaying = true,
  backgroundEffect,
}) => {
  const { font } = resolveTokens(style);

  const promptText = stripPipe(String(variables.promptText || "Make a launch video for our app"));
  const pillBg = "#FFFFFF";
  const pillTextColor = "#374151";
  const seed = promptText.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#000",
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
        seed={seed}
        isPlaying={isPlaying}
        beatIntensity={beatIntensity}
      />

      {/* [slot: hero] Centered pill — PromptInputPill primitive (typed
          prompt is the content; no separate caption slot) */}
      <PromptInputPill
        progress={progress}
        sceneDuration={sceneDuration ?? 4}
        promptText={promptText}
        pillBg={pillBg}
        pillTextColor={pillTextColor}
        width={width}
        height={height}
      />
    </div>
  );
};
