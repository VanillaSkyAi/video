/**
 * bg-confetti — colorful confetti particles bursting and falling.
 *
 * Progress-driven particle positions for export compatibility.
 * Particles burst from center, drift outward, then fall with gravity.
 */
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { TemplateText } from "./template-text";
import type { TextArchetype } from "../typography";
import { BrandGradientOverlay } from "../backgrounds";
import { ConfettiLayer } from "./confetti-layer";

export const BgConfettiTemplate: React.FC<SceneTemplateProps> = ({
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
}) => {
  const { background, foreground, font } = resolveTokens(style);
  const textColor = foreground;

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
      {/* [slot: background] Atomic brand backdrop; no stock media by design. */}
      <BrandGradientOverlay
        style={style}
        progress={progress}
        sceneDuration={sceneDuration}
        seed={String(variables.texts || "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)}
      />

      {/* [slot: badge] Shared particle layer, hue-filtered against the bg gradient. */}
      <ConfettiLayer
        progress={motionProgress}
        width={width}
        height={height}
        beatIntensity={beatIntensity}
        bgColor={background.type === "solid" ? background.color : background.colors[1]}
      />

      {/* [slot: caption] */}
      <TemplateText
        motionProgress={motionProgress}
        typeTreatment={resolveTokens(style).preset.type}
        archetype={(textArchetype as TextArchetype) ?? "subtle"}
        text={String(variables.texts ?? "")}
        progress={progress}
        sceneDuration={sceneDuration ?? 3}
        width={width}
        height={height}
        position="center"
        sizeRole="headline"
        safeZone={safeZone}
        font={font}
        color={textColor}
        beatIntensity={beatIntensity}
      />
    </div>
  );
};
