/**
 * PhoneFrame
 *
 * Vertical phone mockup with 3D tilt entrance (lying flat → standing up).
 * Single screen mode or multi-screen slides. Beat-reactive scale. Screenshot
 * rendering is delegated to ProductSurface so phone and web scenes share the
 * same crop, camera-motion, and annotation behavior.
 */

import { interpolate, spring, SPRING_SMOOTH } from "../../motion";
import { PhoneScreenFill } from "./DesignedScreenFill";
import { TOKEN_DEFAULTS } from "../../theme";
import { ProductSurface } from "./ProductSurface";
import type { ProductSurfaceFit, ProductSurfaceMotion } from "./product-surface-config";

// ─── Typed component (direct use from templates) ────────────────

export interface PhoneFrameProps {
  progress: number;
  motionProgress?: number;
  /** Single screen URL (used when `screens` is empty). Leave empty for the designed default fill. */
  screenMediaUrl?: string;
  /** Multi-screen mode — sliding strip of screens (1-3). When set, ignores screenMediaUrl. */
  screens?: string[];
  width: number;
  height: number;
  font?: string;
  beatIntensity?: number;
  /** Brand colors for the designed default app-screen fill (empty-slot case). */
  accent?: string;
  secondary?: string;
  bg?: string;
  screenFit?: ProductSurfaceFit;
  screenFocusX?: number;
  screenFocusY?: number;
  screenMotion?: ProductSurfaceMotion;
  screenCalloutText?: string;
  screenCalloutX?: number;
  screenCalloutY?: number;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({
  progress,
  motionProgress = progress,
  screenMediaUrl = "",
  screens = [],
  width,
  height,
  font = TOKEN_DEFAULTS.font,
  beatIntensity = 0,
  accent = TOKEN_DEFAULTS.primary,
  secondary = "#00b5e5",
  bg,
  screenFit = "cover",
  screenFocusX = 50,
  screenFocusY = 50,
  screenMotion = "pushIn",
  screenCalloutText = "",
  screenCalloutX = 70,
  screenCalloutY = 35,
}) => {
  const s = Math.min(width, height) / 1080;
  const slidesMode = screens.length > 0;

  // Landscape caps phone height at 60% of the frame (CLAUDE.md mockup rule):
  // the old height*0.35 bound gave phoneHeight = 0.7*height, which pushed the
  // phone bottom past the frame edge below top = height*0.32. Width derives
  // from the fixed 1:2 aspect. Portrait keeps the original sizing untouched.
  const maxPhoneH = height * 0.6;
  const phoneWidth =
    width > height
      ? Math.min(width * 0.55, maxPhoneH / 2)
      : Math.min(width * 0.55, height * 0.35);
  const phoneHeight = phoneWidth * 2;
  const borderRadius = 40 * s;
  const borderWidth = 6 * s;

  const enterRange: [number, number] = slidesMode ? [0.02, 0.35] : [0.02, 0.85];
  const enterP = spring(
    interpolate(motionProgress, enterRange, [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    { damping: 26, stiffness: 80 },
  );
  const phoneRotateX = (1 - enterP) * 60;
  const phoneY = (1 - enterP) * 180 * s;
  const phoneScale = interpolate(enterP, [0, 1], [0.85, 1]);
  const phoneOpacity = interpolate(motionProgress, [0.02, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const slide1to2 = slidesMode && screens.length >= 2 ? spring(interpolate(progress, [0.28, 0.48], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), SPRING_SMOOTH) : 0;
  const slide2to3 = slidesMode && screens.length >= 3 ? spring(interpolate(progress, [0.58, 0.78], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), SPRING_SMOOTH) : 0;
  const slideOffset = -(slide1to2 + slide2to3) * phoneWidth;

  const beatScale = 1 + beatIntensity * (slidesMode ? 0.01 : 0.015);

  const renderScreen = (url: string, key?: number, withCallout = false) => (
      <div key={key} style={{ position: "relative", width: phoneWidth, height: phoneHeight, flexShrink: 0 }}>
        <ProductSurface
          mediaUrl={url}
          progress={progress}
          width={phoneWidth}
          height={phoneHeight}
          fit={screenFit}
          focusX={screenFocusX}
          focusY={screenFocusY}
          motion={withCallout ? screenMotion : "still"}
          calloutText={withCallout ? screenCalloutText : ""}
          calloutX={screenCalloutX}
          calloutY={screenCalloutY}
          accent={accent}
          font={font}
          placeholder={
        <PhoneScreenFill
          accent={accent}
          secondary={secondary}
          bg={bg}
          font={font}
          s={s}
          w={phoneWidth}
          h={phoneHeight}
          progress={progress}
        />
          }
        />
      </div>
    );

  return (
    <div
      style={{
        position: "absolute",
        top: height * 0.32,
        left: (width - phoneWidth) / 2,
        width: phoneWidth,
        height: phoneHeight,
        perspective: `${1600 * s}px`,
        transformStyle: "preserve-3d",
      }}
    >
      <div
        style={{
          width: phoneWidth,
          height: phoneHeight,
          transform: `translateY(${phoneY}px) rotateX(${phoneRotateX}deg) scale(${phoneScale * beatScale})`,
          transformOrigin: "center bottom",
          opacity: phoneOpacity,
        }}
      >
        <div
          style={{
            width: phoneWidth,
            height: phoneHeight,
            borderRadius,
            overflow: "hidden",
            position: "relative",
            boxShadow: `0 ${20 * s}px ${60 * s}px rgba(0,0,0,0.35)`,
          }}
        >
          {slidesMode ? (
            <div
              data-phone-screen-progress={Number((slide1to2 + slide2to3).toFixed(6))}
              style={{
                display: "flex",
                width: phoneWidth * screens.length,
                height: phoneHeight,
                transform: `translateX(${slideOffset}px)`,
              }}
            >
              {screens.map((url, i) => renderScreen(url, i))}
            </div>
          ) : (
            renderScreen(screenMediaUrl, undefined, true)
          )}

          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius,
              border: `${borderWidth * 1.5}px solid rgba(220,220,220,0.6)`,
              boxShadow: `inset 0 0 0 ${1 * s}px rgba(255,255,255,0.1)`,
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
        </div>
      </div>
    </div>
  );
};
