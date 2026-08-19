/**
 * BarChart
 *
 * Animated labeled bars for exact value comparisons.
 */

import { interpolate, spring, SPRING_SNAPPY } from "../../motion";
import { withOpacity } from "../../theme";

export interface BarChartDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  progress: number;
  width: number;
  height: number;
  /** Labeled values. At most six are rendered to preserve readability. */
  data: readonly BarChartDatum[];
  /** Bar fill, border, and ambient glow color. */
  chartColor?: string;
  /** Value and category label color. */
  textColor?: string;
  beatIntensity?: number;
}

const MAX_BAR_ITEMS = 6;

function exactValue(value: number): string {
  return String(value);
}

export const BarChart: React.FC<BarChartProps> = ({
  progress,
  data,
  width,
  height,
  chartColor = "#ffffff",
  textColor = "#ffffff",
  beatIntensity = 0,
}) => {
  const values = data
    .filter(({ value }) => Number.isFinite(value))
    .slice(0, MAX_BAR_ITEMS);
  const s = Math.min(width, height) / 1080;
  const portrait = height > width;
  const chartWidth = width * (portrait ? 0.88 : 0.84);
  const chartHeight = height * (portrait ? 0.56 : 0.52);
  const bottom = (portrait ? 112 : 60) * s;
  const labelHeight = (portrait ? 94 : 66) * s;
  const valueReserve = (portrait ? 52 : 44) * s;
  const maxBarHeight = chartHeight - labelHeight - valueReserve;
  const gap = (portrait ? 14 : 20) * s;
  const barCount = Math.max(values.length, 1);
  const itemWidth = (chartWidth - gap * (barCount - 1)) / barCount;
  const barWidth = Math.max(itemWidth * 0.68, 2 * s);
  const maxValue = Math.max(1, ...values.map(({ value }) => Math.max(0, value)));
  const beatScale = 1 + beatIntensity * 0.03;

  return (
    <>
      <div
        role="img"
        aria-label={values.map(({ label, value }) => `${label || "Value"}: ${exactValue(value)}`).join(", ")}
        style={{
          position: "absolute",
          bottom,
          left: (width - chartWidth) / 2,
          width: chartWidth,
          height: chartHeight,
          display: "flex",
          alignItems: "flex-end",
          gap,
        }}
      >
        {values.map(({ label, value }, index) => {
          // All bars settle by 65% progress, leaving a useful final hold.
          const barStart = 0.06 + index * 0.05;
          const barProgress = interpolate(progress, [barStart, barStart + 0.34], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const springValue = spring(barProgress, SPRING_SNAPPY);
          const targetHeight = (Math.max(0, value) / maxValue) * maxBarHeight;

          return (
            <div
              key={`${label}-${index}`}
              data-bar-chart-item="true"
              style={{
                width: itemWidth,
                height: chartHeight,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                alignItems: "center",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: maxBarHeight + valueReserve,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: barWidth,
                    height: springValue * targetHeight,
                    background: `linear-gradient(to top, ${withOpacity(chartColor, 0.82)}, ${withOpacity(chartColor, 0.42)})`,
                    border: `1px solid ${withOpacity(chartColor, 0.7)}`,
                    borderRadius: `${10 * s}px ${10 * s}px 0 0`,
                    boxShadow: `0 0 ${24 * s}px ${withOpacity(chartColor, 0.18)}`,
                    transform: `scaleY(${beatScale})`,
                    transformOrigin: "bottom",
                  }}
                >
                  <div
                    data-bar-chart-value="true"
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      left: "50%",
                      transform: `translate(-50%, ${-10 * s}px)`,
                      color: textColor,
                      fontSize: (portrait ? 34 : 30) * s,
                      lineHeight: 1,
                      fontWeight: 750,
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                      opacity: barProgress,
                      textShadow: `0 ${2 * s}px ${8 * s}px rgba(0,0,0,0.55)`,
                    }}
                  >
                    {exactValue(value)}
                  </div>
                </div>
              </div>
              <div
                data-bar-chart-label="true"
                style={{
                  width: "100%",
                  height: labelHeight,
                  paddingTop: 14 * s,
                  boxSizing: "border-box",
                  color: withOpacity(textColor, 0.9),
                  fontSize: (portrait ? 24 : 22) * s,
                  lineHeight: 1.15,
                  fontWeight: 650,
                  textAlign: "center",
                  overflow: "hidden",
                  overflowWrap: "anywhere",
                  opacity: barProgress,
                }}
              >
                {label}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: chartHeight * 0.7,
          background: `linear-gradient(to top, ${withOpacity(chartColor, 0.07)}, transparent)`,
          pointerEvents: "none",
        }}
      />
    </>
  );
};
