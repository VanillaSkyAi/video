/**
 * chart-bar — animated labeled values with a headline.
 */
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { TemplateText } from "./template-text";
import { TOP_TEXT_AREA_RATIO } from "../backgrounds";
import { BarChart, type BarChartDatum } from "../primitives/charts/BarChart";
import { SceneBackground, getMediaBackgroundProps, hasSceneMedia } from "./scene-background";

function parseBarDatum(value: unknown): BarChartDatum | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? { label: "", value } : undefined;
  }
  if (typeof value === "object" && value !== null) {
    const datum = value as Record<string, unknown>;
    const numberValue = Number(datum.value);
    if (!Number.isFinite(numberValue)) return undefined;
    return { label: String(datum.label ?? "").trim(), value: numberValue };
  }
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const separator = trimmed.lastIndexOf(":");
  const label = separator >= 0 ? trimmed.slice(0, separator).trim() : "";
  const numberValue = Number(separator >= 0 ? trimmed.slice(separator + 1).trim() : trimmed);
  return Number.isFinite(numberValue) ? { label, value: numberValue } : undefined;
}

function parseBarData(value: unknown): BarChartDatum[] {
  let items: unknown[];
  if (Array.isArray(value)) {
    items = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      items = Array.isArray(parsed) ? parsed : [trimmed];
    } catch {
      items = trimmed.split(",");
    }
  } else {
    items = [value];
  }
  return items.map(parseBarDatum).filter((datum): datum is BarChartDatum => datum !== undefined);
}

export const ChartBarTemplate: React.FC<SceneTemplateProps> = ({
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

  // Structured labeled data is canonical; numeric and Label:value strings
  // remain accepted for already-generated customer templates.
  const data = parseBarData(variables.bars);

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

      {/* [slot: hero] */}
      <BarChart
        progress={progress}
        data={data}
        width={width}
        height={height}
        chartColor={chartColor}
        textColor={textColor}
        beatIntensity={beatIntensity}
      />

      {/* [slot: caption] */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: height * TOP_TEXT_AREA_RATIO, overflow: "visible" }}>
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
      </div>
    </div>
  );
};
