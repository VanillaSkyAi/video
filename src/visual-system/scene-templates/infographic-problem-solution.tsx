/**
 * problemSolution — a two-phase pain-to-fix story.
 *
 * The template only composes the scene slots. ProblemSolution owns the
 * complete pill, statement, transition, and celebration lifecycle so the
 * same hero can be used by built-in and custom scenes without drift.
 */

import React from "react";
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { ProblemSolution } from "../primitives/infographic/ProblemSolution";
import { SceneBackground, getMediaBackgroundProps } from "./scene-background";

export const InfographicProblemSolutionTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  beatIntensity,
  width,
  height,
  sceneDuration,
  backgroundEffect,
  isPlaying = true,
}) => {
  const { foreground, font } = resolveTokens(style);
  const textColor = foreground;
  const problemText = String(variables.problemText || "");
  const solutionText = String(variables.solutionText || "");

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
        seed={`${problemText}${solutionText}`}
        isPlaying={isPlaying}
        beatIntensity={beatIntensity}
      />

      {/* [slot: hero] */}
      <ProblemSolution
        progress={progress}
        width={width}
        height={height}
        problemLabel={String(variables.problemLabel || "THE PROBLEM")}
        problemText={problemText}
        solutionLabel={String(variables.solutionLabel || "THE SOLUTION")}
        solutionText={solutionText}
        textColor={textColor}
        font={font}
        beatIntensity={beatIntensity}
      />
    </div>
  );
};
