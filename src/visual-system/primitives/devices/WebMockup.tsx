/**
 * WebMockup
 *
 * Web mockup that can render as a browser window (traffic-light dots +
 * address bar) OR a tablet (clean rounded frame). Same 3D tilt entrance
 * + slide-up pattern as PhoneFrame, but 16:9 instead of 9:16.
 * Single-screen mode or multi-screen slides. Screenshot rendering is
 * delegated to ProductSurface so templates and custom scenes get the same
 * crop, camera-motion, and annotation behavior.
 *
 * Prop API:
 *   - progress       : scene progress 0→1 (required)
 *   - width/height   : frame dimensions (required)
 *   - frame          : "browser" | "tablet" (default "browser")
 *   - screenMediaUrl : single screen URL (used when `screens` is empty)
 *   - screens        : multi-screen slide strip (when set, used as the
 *                      sliding strip; if screenMediaUrl is also set,
 *                      callers should prepend it themselves — matches
 *                      PhoneFrame's contract)
 *   - addressBarUrl  : URL text shown in browser chrome (default "yourapp.com")
 *   - font           : font family for placeholder text (default "Inter")
 *   - accent         : reserved brand accent — not currently used inside
 *                      the device chrome; kept for API parity
 *   - beatIntensity  : beat pulse 0→1 (default 0)
 */

import * as React from "react";
import { interpolate, spring, SPRING_SMOOTH } from "../../motion";
import { stripPipe } from "../../typography";
import { TOKEN_DEFAULTS } from "../../theme";
import { WebScreenFill } from "./DesignedScreenFill";
import { ProductSurface } from "./ProductSurface";
import type { ProductSurfaceFit, ProductSurfaceMotion } from "./product-surface-config";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// ─── Typed component ────────────────────────────────────────────

export interface WebMockupProps {
  /** Scene progress 0→1 */
  progress: number;
  /** Frame width */
  width: number;
  /** Frame height */
  height: number;
  /** Device frame style. Defaults to "browser". */
  frame?: "browser" | "tablet";
  /** Single screen URL (used when `screens` is empty). Leave empty for placeholder. */
  screenMediaUrl?: string;
  /** Multi-screen mode — sliding strip of screens. When set, ignores screenMediaUrl. */
  screens?: string[];
  /** URL shown in browser chrome (browser frame only). Default "yourapp.com". */
  addressBarUrl?: string;
  /** Font family for placeholder text. Default "Inter". */
  font?: string;
  /** Reserved brand accent (not used in chrome today). Default "#00e5a0". */
  accent?: string;
  /** Secondary brand color for the designed empty state. */
  secondary?: string;
  /** Optional brand background for the designed empty state. */
  bg?: string;
  /** Beat pulse 0→1 */
  beatIntensity?: number;
  screenFit?: ProductSurfaceFit;
  screenFocusX?: number;
  screenFocusY?: number;
  screenMotion?: ProductSurfaceMotion;
  screenCalloutText?: string;
  screenCalloutX?: number;
  screenCalloutY?: number;
}

export const WebMockup: React.FC<WebMockupProps> = ({
  progress,
  width,
  height,
  frame = "browser",
  screenMediaUrl = "",
  screens = [],
  addressBarUrl = "yourapp.com",
  font = TOKEN_DEFAULTS.font,
  accent = TOKEN_DEFAULTS.primary,
  secondary = "#00b5e5",
  bg,
  beatIntensity = 0,
  screenFit = "cover",
  screenFocusX = 50,
  screenFocusY = 50,
  screenMotion = "pushIn",
  screenCalloutText = "",
  screenCalloutX = 70,
  screenCalloutY = 35,
}) => {
  const s = Math.min(width, height) / 1080;
  const isBrowser = frame !== "tablet";
  const addressBarUrlClean = stripPipe(String(addressBarUrl || "yourapp.com"));

  const slidesMode = screens.length > 0;

  // ── Device dimensions — fit in both orientations ──────────────
  const deviceWidth = Math.min(width * 0.85, height * 0.55 * (16 / 9));
  const chromeHeight = isBrowser ? 44 * s : 0;
  const contentHeight = deviceWidth * (9 / 16);
  const deviceHeight = chromeHeight + contentHeight;
  const borderRadius = isBrowser ? 12 * s : 24 * s;
  const borderWidth = isBrowser ? 0 : 6 * s;

  // ── 3D perspective tilt entrance ────────────────────────────────
  const enterRange: [number, number] = slidesMode ? [0.02, 0.35] : [0.02, 0.85];
  const enterP = spring(
    interpolate(progress, enterRange, [0, 1], CLAMP),
    { damping: 28, stiffness: 80 },
  );
  const rotateX = (1 - enterP) * 70;
  const deviceY = (1 - enterP) * 150 * s;
  const deviceScale = interpolate(enterP, [0, 1], [0.85, 1]);
  const deviceOpacity = interpolate(progress, [0.02, 0.1], [0, 1], CLAMP);

  // ── Screen slide offsets (slides mode only) ───────────────────
  const slideCount = screens.length;
  let slideOffset = 0;
  if (slidesMode && slideCount >= 2) {
    const transitionWidth = 0.1;

    let totalSlides = 0;
    for (let i = 1; i < slideCount; i++) {
      const boundary = i / slideCount;
      const start = boundary - transitionWidth / 2;
      const end = boundary + transitionWidth / 2;
      totalSlides += spring(
        interpolate(progress, [start, end], [0, 1], CLAMP),
        SPRING_SMOOTH,
      );
    }
    slideOffset = -totalSlides * deviceWidth;
  }

  const beatScale = slidesMode ? 1 + beatIntensity * 0.01 : 1 + beatIntensity * 0.015;

  // ── Traffic light dot sizes ───────────────────────────────────
  const dotSize = 12 * s;
  const dotGap = 8 * s;

  const placeholder = (
    <WebScreenFill
      accent={accent}
      secondary={secondary}
      bg={bg}
      font={font}
      s={s}
      w={deviceWidth}
      h={contentHeight}
      progress={progress}
    />
  );

  return (
    <div
      style={{
        position: "absolute",
        top: height * 0.35,
        left: (width - deviceWidth) / 2,
        width: deviceWidth,
        height: deviceHeight,
        perspective: `${1200 * s}px`,
      }}
    >
      <div
        style={{
          width: deviceWidth,
          height: deviceHeight,
          transform: `rotateX(${rotateX}deg) translateY(${deviceY}px) scale(${deviceScale * beatScale})`,
          transformOrigin: "center bottom",
          opacity: deviceOpacity,
        }}
      >
        {/* Browser frame */}
        <div
          style={{
            width: deviceWidth,
            height: deviceHeight,
            borderRadius,
            overflow: "hidden",
            position: "relative",
            boxShadow: `0 ${20 * s}px ${60 * s}px rgba(0,0,0,0.35)`,
          }}
        >
          {/* Chrome bar — browser frame only */}
          {isBrowser && (
            <div
              style={{
                width: "100%",
                height: 44 * s,
                backgroundColor: "#e8e8e8",
                display: "flex",
                alignItems: "center",
                paddingLeft: 16 * s,
                paddingRight: 16 * s,
                gap: 0,
                position: "relative",
                zIndex: 2,
              }}
            >
              {/* Traffic light dots */}
              <div style={{ display: "flex", gap: dotGap, flexShrink: 0 }}>
                <div style={{ width: dotSize, height: dotSize, borderRadius: "50%", backgroundColor: "#ff5f57" }} />
                <div style={{ width: dotSize, height: dotSize, borderRadius: "50%", backgroundColor: "#febc2e" }} />
                <div style={{ width: dotSize, height: dotSize, borderRadius: "50%", backgroundColor: "#28c840" }} />
              </div>

              {/* Address bar */}
              <div
                style={{
                  flex: 1,
                  marginLeft: 16 * s,
                  height: 28 * s,
                  backgroundColor: "#ffffff",
                  borderRadius: 6 * s,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 12 * s,
                  paddingRight: 12 * s,
                  overflow: "hidden",
                }}
              >
                {/* Lock icon */}
                <svg
                  width={14 * s}
                  height={14 * s}
                  viewBox="0 0 14 14"
                  fill="none"
                  style={{ flexShrink: 0, marginRight: 6 * s }}
                >
                  <rect x="2" y="6" width="10" height="7" rx="1.5" fill="#999" />
                  <path d="M4.5 6V4.5a2.5 2.5 0 015 0V6" stroke="#999" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
                <span
                  style={{
                    fontSize: 13 * s,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    color: "#666",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {addressBarUrlClean}
                </span>
              </div>
            </div>
          )}

          {/* Tablet border frame overlay — tablet frame only */}
          {!isBrowser && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius,
                border: `${borderWidth * 1.5}px solid rgba(220,220,220,0.6)`,
                pointerEvents: "none",
                zIndex: 2,
              }}
            />
          )}

          {/* Screen content */}
          {slidesMode ? (
            <div
              style={{
                position: "absolute",
                top: chromeHeight,
                left: 0,
                width: deviceWidth * screens.length,
                height: contentHeight,
                display: "flex",
                transform: `translateX(${slideOffset}px)`,
              }}
            >
              {screens.map((url, i) => (
                <div
                  key={i}
                  style={{
                    width: deviceWidth,
                    height: contentHeight,
                    flexShrink: 0,
                  }}
                >
                  <ProductSurface
                    mediaUrl={url}
                    progress={progress}
                    width={deviceWidth}
                    height={contentHeight}
                    fit={screenFit}
                    focusX={screenFocusX}
                    focusY={screenFocusY}
                    motion="still"
                    accent={accent}
                    font={font}
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ position: "absolute", top: chromeHeight, left: 0, width: deviceWidth, height: contentHeight }}>
              <ProductSurface
                mediaUrl={screenMediaUrl}
                progress={progress}
                width={deviceWidth}
                height={contentHeight}
                fit={screenFit}
                focusX={screenFocusX}
                focusY={screenFocusY}
                motion={screenMotion}
                calloutText={screenCalloutText}
                calloutX={screenCalloutX}
                calloutY={screenCalloutY}
                accent={accent}
                font={font}
                placeholder={placeholder}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
