/**
 * CtaMediaClose
 *
 * The brand-close pair from the cta-media template: optional logo at the
 * top (~13% from top, 60% of frame width, capped at 22% of frame height,
 * with a slow zoom-in "land" curve) and an editable action + address stack
 * above the social-app safe zone (~18% from bottom).
 *
 * The SceneBackground (photo / video / gradient) and the big TemplateText
 * headline stay in the scene composer — this primitive only owns the
 * brand-mark + bottom address-line block so custom scenes can place
 * them over their own backdrops.
 *
 * Prop API:
 *   - progress     : scene progress 0→1 (required)
 *   - width/height : frame dimensions (required)
 *   - brandName    : brand name (required) — used as a text wordmark when
 *                    no `logoUrl` is provided, and as the alt text for the
 *                    logo image
 *   - logoUrl      : optional logo image URL; renders as <img> when set
 *   - url          : optional address shown small at the bottom
 *   - cta          : optional action line (e.g. "Try it free") above the URL
 *   - font         : font family (default "Inter")
 *   - textColor    : color for the wordmark + bottom line (default "#ffffff")
 *   - accent       : reserved brand accent — kept for API parity (default "#00e5a0")
 *   - beatIntensity: beat pulse 0→1 (default 0) — not strongly used; the
 *                    bottom-line scale is driven by the landing curve
 */

import * as React from "react";
import { interpolate, spring, SPRING_SMOOTH } from "../../motion";
import { fitTextSize, stripPipe } from "../../typography";
import { TOKEN_DEFAULTS } from "../../theme";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// ─── Typed component ────────────────────────────────────────────

export interface CtaMediaCloseProps {
  /** Scene progress 0→1 */
  progress: number;
  /** Optional transition-safe entrance/exit clock. */
  motionProgress?: number;
  /** Frame width */
  width: number;
  /** Frame height */
  height: number;
  /** Brand name (rendered as a text wordmark when no logoUrl is set). Required. */
  brandName: string;
  /** Optional logo image URL. When set, renders as an <img> in place of the wordmark. */
  logoUrl?: string;
  /** Optional address shown small at the bottom. */
  url?: string;
  /** Optional action line shown above the URL. */
  cta?: string;
  /** Font family. Default "Inter". */
  font?: string;
  /** Color for wordmark + bottom line. Default "#ffffff". */
  textColor?: string;
  /** Reserved brand accent. Default "#00e5a0". */
  accent?: string;
  /** Beat pulse 0→1 */
  beatIntensity?: number;
  /** Horizontal safe-zone used to fit the bottom URL/CTA. */
  safeZone?: { left: number; right: number };
}

export const CtaMediaClose: React.FC<CtaMediaCloseProps> = ({
  progress,
  motionProgress = progress,
  width,
  height,
  brandName: rawBrandName,
  logoUrl = "",
  url: rawUrl = "",
  cta: rawCta = "",
  font = TOKEN_DEFAULTS.font,
  textColor = "#ffffff",
  safeZone = { left: 0, right: 0 },
}) => {
  const s = Math.min(width, height) / 1080;

  const brandName = stripPipe(String(rawBrandName || ""));
  const url = stripPipe(String(rawUrl || ""));
  const cta = stripPipe(String(rawCta || ""));

  // Unified item entry — fade + tiny scale, lands by 0.30.
  const fadeP = interpolate(motionProgress, [0, 0.30], [0, 1], CLAMP);
  const scaleSpring = spring(fadeP, SPRING_SMOOTH);
  const itemOpacity = fadeP;
  const itemScale = 0.94 + 0.06 * scaleSpring;

  // Shared "land" curve for the logo zoom — slow SPRING_SMOOTH glide
  // over [0, 0.85] so the brand-mark arrives as one unit.
  const landP = spring(
    interpolate(motionProgress, [0, 0.85], [0, 1], CLAMP),
    SPRING_SMOOTH,
  );
  const logoZoom = 0.94 + 0.14 * landP;

  // Logo: 60% of frame width; capped at 22% of height.
  const logoWidth = width * 0.60;
  const logoMaxHeight = height * 0.22;
  const logoTop = height * 0.13;

  // Wordmark sizing — scales with frame so it fills similar visual real
  // estate to the logo image. ~7% of min(w,h) reads as a header-sized
  // wordmark in both orientations.
  const wordmarkFontSize = Math.min(width * 0.10, height * 0.10);

  // Bottom slot: 18% from bottom keeps it clear of TikTok / Reels / Shorts UI.
  const bottomMaxWidth = width - Math.max(safeZone.left, safeZone.right) * 2;
  const ctaFontSize = fitTextSize(cta, 48 * s, bottomMaxWidth);
  const urlFontSize = fitTextSize(url, cta ? 34 * s : 48 * s, bottomMaxWidth);
  const bottomOffset = height * 0.18;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        fontFamily: font,
      }}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={brandName || "logo"}
          style={{
            position: "absolute",
            top: logoTop,
            left: "50%",
            width: logoWidth,
            maxHeight: logoMaxHeight,
            objectFit: "contain",
            transform: `translateX(-50%) scale(${logoZoom})`,
            transformOrigin: "center center",
            opacity: itemOpacity,
          }}
        />
      ) : (
        brandName && (
          <div
            style={{
              position: "absolute",
              top: logoTop,
              left: 0,
              right: 0,
              textAlign: "center",
              color: textColor,
              fontSize: wordmarkFontSize,
              fontWeight: 700,
              letterSpacing: -0.5,
              transform: `scale(${logoZoom})`,
              transformOrigin: "center center",
              opacity: itemOpacity,
              textShadow: "0 2px 12px rgba(0,0,0,0.32)",
            }}
          >
            {brandName}
          </div>
        )
      )}

      {(cta || url) && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: bottomOffset,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12 * s,
            textAlign: "center",
            color: textColor,
            opacity: itemOpacity * 0.92,
            transform: `scale(${itemScale})`,
            transformOrigin: "center center",
            textShadow: "0 1px 4px rgba(0,0,0,0.35)",
          }}
        >
          {cta && (
            <div style={{ fontSize: ctaFontSize, fontWeight: 700, letterSpacing: -0.3 }}>
              {cta}
            </div>
          )}
          {url && (
            <div style={{ fontSize: urlFontSize, fontWeight: 500, letterSpacing: 0.5, opacity: cta ? 0.78 : 1 }}>
              {url}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
