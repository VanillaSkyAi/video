/**
 * infographic-before-after — emoji-driven before/after contrast.
 *
 * Layout: a centered "BEFORE" / "AFTER" pill label sits above the
 * centered headline text; emojis distribute across the FULL frame
 * around the central text zone (top band, sides, bottom band). Pill
 * styling matches problemSolution — same shape, scale-pop entry, just
 * BEFORE/AFTER wording with a red→green color shift.
 *
 * Two phases on a brand-color gradient:
 *  1. Before phase: red BEFORE pill + problem headline + scattered
 *     problem emojis with chaos jitter.
 *  2. Transition: problem emojis fall off-screen with gravity (confetti-
 *     style drop) while the pill + headline crossfade.
 *  3. After phase: green AFTER pill + solution headline + solution
 *     emojis pop in with a happy bounce in the same slots.
 *
 * Pick this for symbolic before/after content where the emojis tell the
 * story; `problemSolution` for full-statement text contrast.
 *
 * Block structure (docs/blocks.md):
 *   background — brand gradient (gradientBackground)
 *   hero       — BeforeAfterSplit primitive (both phases: pills, headlines,
 *                emoji scatter/fall/pop — text integral, no caption slot)
 */

import React from "react";
import { parseList } from "../parse-list";
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { gradientBackground } from "../backgrounds";
import { BeforeAfterSplit } from "../primitives/infographic/BeforeAfterSplit";

export const InfographicBeforeAfterTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  beatIntensity,
  width,
  height,
  textArchetype,
  safeZone,
  sceneDuration,
}) => {
  const { background, foreground, font } = resolveTokens(style);
  const textColor = foreground;

  const problemHeadline = String(variables.problemHeadline || "");
  const solutionHeadline = String(variables.solutionHeadline || "");
  const problemTypes = parseList(variables.problemEmojis);
  const solutionTypes = parseList(variables.solutionEmojis);
  const showEmojis = variables.showEmojis !== false && String(variables.showEmojis ?? "true").toLowerCase() !== "false";

  const gradSeed = (problemHeadline + solutionHeadline)
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);

  // textArchetype is intentionally unused — this template uses the
  // problemSolution-style direct text rendering instead of TemplateText.
  void textArchetype;
  void safeZone;

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
      {/* [slot: background] Brand-color gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: gradientBackground({
            colorA: background.type === "solid" ? background.color : background.colors[0],
            colorB: background.type === "solid" ? background.color : background.colors[1],
            solidBg: background.type === "solid" ? background.color : undefined,
            progress,
            sceneDuration,
            seed: gradSeed,
            family: resolveTokens(style).preset.background,
          }),
          pointerEvents: "none",
        }}
      />

      {/* [slot: hero] Two-phase before/after reveal — shared primitive */}
      <BeforeAfterSplit
        progress={progress}
        width={width}
        height={height}
        problemHeadline={problemHeadline}
        solutionHeadline={solutionHeadline}
        problemEmojis={problemTypes}
        solutionEmojis={solutionTypes}
        showEmojis={showEmojis}
        beforeLabel={String(variables.problemLabel || "")}
        afterLabel={String(variables.solutionLabel || "")}
        textColor={textColor}
        font={font}
        beatIntensity={beatIntensity}
      />
    </div>
  );
};
