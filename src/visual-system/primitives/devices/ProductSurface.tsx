/**
 * ProductSurface — shared screenshot treatment for product mockups.
 *
 * Device primitives own their chrome and entrance. ProductSurface owns what
 * happens inside the screen: crop/focus, subtle camera motion, and an optional
 * feature callout. This keeps phone and web mockups visually consistent while
 * leaving every user-facing choice editable through a spreadable schema.
 */

import type { ReactNode } from "react";
import { interpolate, spring, SPRING_SMOOTH } from "../../motion";
import { stripPipe } from "../../typography";
import { renderWithEmoji } from "../../emoji/emoji-text";
import { TOKEN_DEFAULTS } from "../../theme";
import {
  resolveProductSurfaceMotion,
  type ProductSurfaceFit,
  type ProductSurfaceMotion,
} from "./product-surface-config";

export interface ProductSurfaceProps {
  mediaUrl?: string;
  progress: number;
  width: number;
  height: number;
  fit?: ProductSurfaceFit;
  focusX?: number;
  focusY?: number;
  motion?: ProductSurfaceMotion;
  calloutText?: string;
  calloutX?: number;
  calloutY?: number;
  accent?: string;
  font?: string;
  placeholder?: ReactNode;
}

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, value));
}

export const ProductSurface: React.FC<ProductSurfaceProps> = ({
  mediaUrl = "",
  progress,
  width,
  height,
  fit = "cover",
  focusX = 50,
  focusY = 50,
  motion = "pushIn",
  calloutText = "",
  calloutX = 70,
  calloutY = 35,
  accent = TOKEN_DEFAULTS.primary,
  font = TOKEN_DEFAULTS.font,
  placeholder,
}) => {
  const resolvedFit: ProductSurfaceFit = fit === "contain" ? "contain" : "cover";
  const resolvedMotion = resolveProductSurfaceMotion(motion);
  const resolvedFocusX = clampPercent(Number(focusX), 50);
  const resolvedFocusY = clampPercent(Number(focusY), 50);
  const resolvedCalloutX = clampPercent(Number(calloutX), 70);
  const resolvedCalloutY = clampPercent(Number(calloutY), 35);
  const cleanCallout = stripPipe(String(calloutText || "")).trim();
  const s = Math.min(width, height) / 1080;

  const cameraProgress = interpolate(progress, [0.12, 0.94], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cameraTransform = resolvedMotion === "pushIn"
    ? `scale(${1 + cameraProgress * 0.06})`
    : resolvedMotion === "pan"
      ? `translateX(${2.5 - cameraProgress * 5}%) scale(1.08)`
      : "none";

  const calloutProgress = spring(
    interpolate(progress, [0.42, 0.62], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    SPRING_SMOOTH,
  );
  const calloutPointsLeft = resolvedCalloutX > 58;
  const calloutFontSize = Math.max(18, 36 * s);
  const dotSize = Math.max(11, 22 * s);
  const labelOffset = Math.max(18, 34 * s);

  return (
    <div
      data-product-surface="true"
      data-camera-motion={resolvedMotion}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        backgroundColor: "#0b1020",
      }}
    >
      {mediaUrl ? (
        <img
          src={mediaUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: resolvedFit,
            objectPosition: `${resolvedFocusX}% ${resolvedFocusY}%`,
            transform: cameraTransform,
            transformOrigin: `${resolvedFocusX}% ${resolvedFocusY}%`,
          }}
        />
      ) : placeholder ?? null}

      {mediaUrl && cleanCallout ? (
        <div
          style={{
            position: "absolute",
            left: `${resolvedCalloutX}%`,
            top: `${resolvedCalloutY}%`,
            opacity: calloutProgress,
            transform: `translate(-50%, -50%) scale(${0.82 + calloutProgress * 0.18})`,
            transformOrigin: "center",
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          <div
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: "50%",
              backgroundColor: accent,
              border: `${Math.max(2, 4 * s)}px solid #ffffff`,
              boxShadow: `0 0 0 ${Math.max(3, 8 * s)}px ${accent}55, 0 ${Math.max(4, 10 * s)}px ${Math.max(10, 26 * s)}px rgba(0,0,0,0.32)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "50%",
              ...(calloutPointsLeft ? { right: labelOffset } : { left: labelOffset }),
              transform: "translateY(-50%)",
              maxWidth: width * 0.48,
              padding: `${Math.max(5, 10 * s)}px ${Math.max(8, 16 * s)}px`,
              borderRadius: Math.max(7, 14 * s),
              backgroundColor: "rgba(7,10,18,0.82)",
              border: "1px solid rgba(255,255,255,0.22)",
              boxShadow: `0 ${Math.max(5, 12 * s)}px ${Math.max(14, 34 * s)}px rgba(0,0,0,0.28)`,
              color: "#ffffff",
              fontFamily: font,
              fontSize: calloutFontSize,
              fontWeight: 650,
              lineHeight: 1.05,
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
            }}
          >
            {renderWithEmoji(cleanCallout, calloutFontSize)}
          </div>
        </div>
      ) : null}
    </div>
  );
};
