/**
 * ProgressRing
 *
 * Circular progress ring fills 0→targetValue over scene progress 0.05–0.75,
 * with the value counting up in the center. Subtle radial glow behind the
 * ring uses chartColor. Beat pulse on stroke width.
 *
 * chart-progress-ring.tsx is refactored to consume this; both paths render
 * byte-identical DOM.
 */

import { interpolate } from "../../motion";
import { withOpacity } from "../../theme";
import { getResponsiveFontSize, stripPipe } from "../../typography";
import { TOKEN_DEFAULTS } from "../../theme";

// ─── Typed component (direct use from templates) ────────────────

export interface ProgressRingProps {
  progress: number;
  motionProgress?: number;
  /** Target percentage (0-100) the ring fills to */
  targetValue: number;
  /** Optional source precision override, including meaningful trailing zeros. */
  decimalPlaces?: number;
  /** Suffix after the number (e.g. "%", "x") */
  unit?: string;
  /** Ring stroke + accent color (e.g. "#00e5a0"). Default "#ffffff". */
  chartColor?: string;
  /** Center number color. Default "#ffffff". */
  textColor?: string;
  /** Optional caption below the ring. */
  label?: string;
  /** Font used by the caption. */
  font?: string;
  /** Frame width */
  width: number;
  /** Frame height */
  height: number;
  /** Beat pulse 0→1 */
  beatIntensity?: number;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  motionProgress = progress,
  targetValue,
  decimalPlaces,
  unit = "%",
  chartColor = "#ffffff",
  textColor = "#ffffff",
  label: rawLabel = "",
  font = TOKEN_DEFAULTS.font,
  width,
  height,
  beatIntensity = 0,
}) => {
  const s = Math.min(width, height) / 1080;
  const label = stripPipe(String(rawLabel || ""));

  // Ring geometry
  const radius = Math.min(width, height) * 0.2;
  const circumference = 2 * Math.PI * radius;
  const cx = width / 2;
  const cy = height / 2;
  const strokeW = 34 * s;

  // Fill animation
  const fillPercent = interpolate(progress, [0.05, 0.75], [0, targetValue], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dashOffset = circumference * (1 - fillPercent / 100);
  // Fractional targets keep their precision (2.5 → "2.5", 99.9 → "99.9",
  // 99.97 → "99.97" — never round up to a lying "100.0"); integer targets
  // stay clean ("80"). Decimal count follows the target, capped at 2.
  const targetDecimals = Number.isFinite(decimalPlaces)
    ? Math.max(0, Math.min(2, Math.trunc(decimalPlaces ?? 0)))
    : Number.isInteger(targetValue)
      ? 0
      : Math.min(2, (String(targetValue).split(".")[1] || "1").length);
  const displayNumber = targetDecimals === 0
    ? String(Math.round(fillPercent))
    : fillPercent.toFixed(targetDecimals);
  const targetDisplayNumber = targetDecimals === 0
    ? String(Math.round(targetValue))
    : targetValue.toFixed(targetDecimals);
  const semanticValueIsTransient = displayNumber !== targetDisplayNumber;
  const beatStroke = strokeW + beatIntensity * 4 * s;
  const labelFontSize = getResponsiveFontSize(label, width, "subtitle", height) * 1.3;
  const labelOpacity = interpolate(motionProgress, [0.35, 0.55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const labelRise = interpolate(motionProgress, [0.35, 0.55], [16 * s, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      {/* Subtle radial glow behind ring */}
      <div
        style={{
          position: "absolute",
          top: cy - radius * 1.2,
          left: cx - radius * 1.2,
          width: radius * 2.4,
          height: radius * 2.4,
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 50%, ${withOpacity(chartColor, 0.08)} 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          position: "absolute",
          inset: 0,
          width,
          height,
        }}
      >
        {/* Background track ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={withOpacity(chartColor, 0.1)}
          strokeWidth={strokeW}
        />
        {/* Animated fill ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={chartColor}
          strokeWidth={beatStroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90, ${cx}, ${cy})`}
          style={{ transition: "none" }}
        />
      </svg>

      {/* Number in center of ring */}
      <div
        data-transition-semantic={semanticValueIsTransient ? "transient" : undefined}
        style={{
          position: "absolute",
          left: cx - radius,
          top: cy - radius,
          width: radius * 2,
          height: radius * 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          ...(semanticValueIsTransient
            ? { visibility: "var(--vanillasky-transition-semantic-visibility,visible)" as React.CSSProperties["visibility"] }
            : {}),
        }}
      >
        <span
          style={{
            fontSize: 120 * s,
            fontWeight: 800,
            color: textColor,
            lineHeight: 1,
          }}
        >
          {displayNumber}
        </span>
        <span
          style={{
            fontSize: 56 * s,
            fontWeight: 700,
            color: chartColor,
            marginLeft: 4 * s,
          }}
        >
          {unit}
        </span>
      </div>

      {label && (
        <div
          style={{
            position: "absolute",
            top: cy + radius + 48 * s,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontSize: labelFontSize,
              color: withOpacity(textColor, 0.6),
              textTransform: "uppercase",
              letterSpacing: 2 * s,
              textAlign: "center",
              maxWidth: "80%",
              opacity: labelOpacity,
              transform: `translateY(${labelRise}px)`,
              fontFamily: font,
            }}
          >
            {label}
          </div>
        </div>
      )}
    </>
  );
};
