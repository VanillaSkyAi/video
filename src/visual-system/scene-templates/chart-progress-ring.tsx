/**
 * chart-progress-ring — circular progress indicator with text overlay.
 *
 * Large ring that fills from 0 to the target percentage as progress advances.
 * Big number in the center of the ring counts up to the value.
 * TextOverlay in the top 35% carries a message above the ring.
 * Label fades up below the ring after the draw is underway — same
 * uppercase caption treatment as chart-counter's label.
 */
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { TemplateText } from "./template-text";
import { TOP_TEXT_AREA_RATIO } from "../backgrounds";
import { ProgressRing } from "../primitives/charts/ProgressRing";
import { SceneBackground, getMediaBackgroundProps } from "./scene-background";

// ─── Component ──────────────────────────────────────────────────

export const ChartProgressRingTemplate: React.FC<SceneTemplateProps> = ({
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
  const chartColor = primary;
  const textColor = foreground;
  const textsRaw = String(variables.texts || "");

  const parsedValue = Number(variables.value);
  const targetValue = Math.max(0, Math.min(100, Number.isFinite(parsedValue) ? parsedValue : 75));
  const parsedDecimalPlaces = Number(variables.decimalPlaces);
  const decimalPlaces = Number.isFinite(parsedDecimalPlaces)
    ? Math.max(0, Math.min(2, Math.trunc(parsedDecimalPlaces)))
    : undefined;
  const unit = String(variables.unit ?? "%");
  const label = String(variables.label ?? "");

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
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: height * TOP_TEXT_AREA_RATIO, overflow: "visible" }}>
        <TemplateText
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
      </div>

      {/* [slot: hero] */}
      <ProgressRing
        progress={progress}
        motionProgress={motionProgress}
        targetValue={targetValue}
        decimalPlaces={decimalPlaces}
        unit={unit}
        chartColor={chartColor}
        textColor={textColor}
        label={label}
        font={font}
        width={width}
        height={height}
        beatIntensity={beatIntensity}
      />

    </div>
  );
};
