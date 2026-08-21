/**
 * CountUpNumber
 *
 * Renders the count-up number + label block exactly as chart-counter does.
 * chart-counter is refactored to import and use this component so both
 * paths render pixel-identical output.
 *
 * Two surfaces:
 *   1. `<CountUpNumber {...typedProps} />` — direct use from templates
 *   2. Registered primitive — used by custom scenes via composition JSON
 */

import { interpolate, spring } from "../../motion";
import { MEDIA_TEXT_SHADOW, TOKEN_DEFAULTS } from "../../theme";

// ─── Typed component (for direct use from templates) ────────────

export interface CountUpNumberProps {
  /** Scene progress 0→1 */
  progress: number;
  motionProgress?: number;
  /** Number to count up to */
  target: number;
  /** Optional source precision override, including meaningful trailing zeros. */
  decimalPlaces?: number;
  /** Optional prefix (e.g. "$", "€") — rendered in chartColor */
  prefix?: string;
  /** Optional unit suffix (e.g. "%", "k", "M") — rendered in chartColor */
  unit?: string;
  /** Label rendered below the number — fades in 0.2→0.4 progress */
  label: string;
  /** Frame width */
  width: number;
  /** Frame height */
  height: number;
  /** Color for the number digits */
  numberColor?: string;
  /** Color for the label below */
  labelColor?: string;
  /** Color for prefix/unit accents — defaults to numberColor */
  chartColor?: string;
  /** Font family */
  font?: string;
  /** When true, applies stronger text-shadow for media backgrounds */
  hasMediaShadow?: boolean;
  /** Beat pulse 0→1 */
  beatIntensity?: number;
  /** Optional override for label font size (default: getResponsiveFontSize × 1.3) */
  labelFontSize?: number;
}

function suppliedDecimalPlaces(value: number): number {
  if (!Number.isFinite(value) || Number.isInteger(value)) return 0;
  const normalized = String(value).toLowerCase();
  if (normalized.includes("e-")) {
    const [coefficient, exponentText] = normalized.split("e-");
    const coefficientDecimals = coefficient.split(".")[1]?.length ?? 0;
    return Math.min(6, Number(exponentText) + coefficientDecimals);
  }
  return Math.min(6, normalized.split(".")[1]?.length ?? 0);
}

/**
 * The number + label block extracted from chart-counter.tsx lines 121-302.
 * Motion math is identical: same count-up curve, same spring config, same
 * breath equation, same beat scale, same label opacity ramp.
 */
export const CountUpNumber: React.FC<CountUpNumberProps> = ({
  progress,
  motionProgress = progress,
  target,
  decimalPlaces: decimalPlacesOverride,
  prefix = "",
  unit = "",
  label,
  width,
  height,
  numberColor = "#ffffff",
  labelColor = "rgba(255,255,255,0.6)",
  font = TOKEN_DEFAULTS.font,
  hasMediaShadow = false,
  beatIntensity = 0,
  labelFontSize,
}) => {
  const s = Math.min(width, height) / 1080;

  // Count-up: interpolate from 0 to target over 0-0.55 progress, then hold.
  // (verbatim from chart-counter)
  const displayValue = interpolate(
    progress,
    [0, 0.55] as const,
    [0, target] as const,
    { extrapolateRight: "clamp" },
  );
  const decimalPlaces = Number.isFinite(decimalPlacesOverride)
    ? Math.max(0, Math.min(6, Math.trunc(decimalPlacesOverride ?? 0)))
    : suppliedDecimalPlaces(target);
  const formattedNumber = displayValue.toLocaleString("en-US", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });
  const formattedTarget = target.toLocaleString("en-US", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });
  const semanticValueIsTransient = formattedNumber !== formattedTarget;

  // Responsive font size for the number based on string length
  const fullNumberStr = `${prefix}${formattedNumber}${unit}`;
  const baseSize = 140 * s;
  const charCount = fullNumberStr.length;
  const numberFontSize = charCount <= 6 ? baseSize : baseSize * Math.max(0.35, 6 / charCount);

  // Number entrance — bouncy spring scale-pop
  const numberSpring = spring(
    interpolate(motionProgress, [0, 0.22] as const, [0, 1] as const, {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    { damping: 9, stiffness: 200 },
  );
  const numberScale = interpolate(numberSpring, [0, 1] as const, [0.3, 1] as const);

  // Subtle breathing once settled
  const numberSettled = numberSpring > 0.99;
  const breathe = numberSettled ? 1 + Math.sin(progress * Math.PI * 4) * 0.008 : 1;

  // Beat pulse on number
  const beatScale = 1 + beatIntensity * 0.03;

  // Label fade-in: progress 0.2 -> 0.4
  const labelOpacity = interpolate(
    motionProgress,
    [0.2, 0.4] as const,
    [0, 1] as const,
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const mediaTextShadow = hasMediaShadow ? MEDIA_TEXT_SHADOW : undefined;

  const finalLabelFontSize = labelFontSize ?? 36 * s * 1.3;

  // Self-contained wrapper — matches chart-counter's counter-block wrapper
  // byte-for-byte. The primitive renders this when consumed by chart-counter
  // (replacing the inline wrapper) AND when rendered by composed.tsx for
  // composition JSON — both produce identical DOM.
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        // font is intentionally NOT set here — caller's outer wrapper
        // (chart-counter root div or composed.tsx root) sets fontFamily
        // and the children inherit. void to silence unused-arg lint.
        ...((void font, {}) as React.CSSProperties),
      }}
    >
      {/* Number */}
      <div
        data-transition-semantic={semanticValueIsTransient ? "transient" : undefined}
        style={{
          fontSize: numberFontSize,
          fontWeight: 800,
          color: numberColor,
          textAlign: "center",
          lineHeight: 1.1,
          position: "relative",
          zIndex: 1,
          maxWidth: "90%",
          overflow: "visible",
          ...(semanticValueIsTransient
            ? { visibility: "var(--vanillasky-transition-semantic-visibility,visible)" as React.CSSProperties["visibility"] }
            : {}),
          transform: `scale(${numberScale * beatScale * breathe})`,
          ...(mediaTextShadow ? { textShadow: mediaTextShadow } : {}),
        }}
      >
        {prefix}
        {formattedNumber}
        {unit}
      </div>

      {/* Label */}
      <div
        style={{
          opacity: labelOpacity,
          fontSize: finalLabelFontSize,
          color: labelColor,
          textTransform: "uppercase",
          letterSpacing: 2 * s,
          textAlign: "center",
          marginTop: 12 * s,
          position: "relative",
          zIndex: 1,
          ...(mediaTextShadow ? { textShadow: mediaTextShadow } : {}),
        }}
      >
        {label}
      </div>
    </div>
  );
};
