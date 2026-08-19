/**
 * WordmarkReveal
 *
 * Renders the brand wordmark (or resolved logo image) + editable CTA and URL
 * below, with the shared SPRING_SMOOTH "land"
 * curve and letter-spacing collapse (0.4em → -0.02em for wordmark, 0.3em →
 * 0.01em for URL).
 *
 * cta-logo.tsx is refactored to import + consume this component so both
 * paths render byte-identical DOM. The primitive owns its positioned
 * wrapper (matches cta-logo's inline wrapper exactly).
 *
 * Two surfaces:
 *   1. <WordmarkReveal {...typedProps} /> — direct use from templates
 *   2. Registered primitive — used by custom scenes via composition JSON
 */

import { interpolate, spring, SPRING_SMOOTH } from "../../motion";
import { fitTextSize } from "../../typography";
import { TOKEN_DEFAULTS } from "../../theme";

// ─── Typed component (direct use from templates) ────────────────

export interface WordmarkRevealProps {
  /** Scene progress 0→1 */
  progress: number;
  /** Brand name — rendered as wordmark when no logoUrl is set */
  brandName: string;
  /** Optional address shown below the action */
  url?: string;
  /** Optional action shown above the address */
  cta?: string;
  /** Optional logo image URL — when set, replaces the wordmark */
  logoUrl?: string;
  /** Frame width */
  width: number;
  /** Frame height */
  height: number;
  /** Font family */
  font?: string;
  /** Text color */
  textColor?: string;
}

/**
 * Centered logo/wordmark + URL stack. Motion ported verbatim from
 * cta-logo.tsx lines 89-205.
 */
export const WordmarkReveal: React.FC<WordmarkRevealProps> = ({
  progress,
  brandName,
  url = "",
  cta = "",
  logoUrl = "",
  width,
  height,
  font = TOKEN_DEFAULTS.font,
  textColor = "#ffffff",
}) => {
  const s = Math.min(width, height) / 1080;
  const actionText = cta.trim();
  const addressText = url.trim();

  // Shared land curve — SPRING_SMOOTH over [0, 0.85]
  const landP = spring(
    interpolate(progress, [0, 0.85], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    SPRING_SMOOTH,
  );
  const logoZoom = 0.94 + 0.14 * landP; // 0.94 → 1.08
  const itemOpacity = interpolate(progress, [0, 0.30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Letter-spacing collapse — type tightens into place
  const wordmarkTracking = `${interpolate(landP, [0, 1], [0.4, -0.02])}em`;
  const actionTracking = `${interpolate(landP, [0, 1], [0.12, -0.01])}em`;
  const urlTracking = `${interpolate(landP, [0, 1], [0.2, 0.01])}em`;

  // Sizing
  const logoWidth = width * 0.60;
  const logoMaxHeight = height * 0.30;
  // Brand wordmark — also shrink-to-fit so very long brand names don't
  // bleed off the frame. The container is ~90% of frame width.
  const wordmarkSize = fitTextSize(brandName, 96 * s, width * 0.90);
  // CTA and URL shrink-to-fit the same safe width. Without this, a long URL
  // like `www.subdomain.companyname.example.com/start` runs off both edges
  // of the 1080px frame at the base 48 × s size.
  const actionFontSize = fitTextSize(actionText, 48 * s, width * 0.90);
  const urlFontSize = fitTextSize(addressText, actionText ? 34 * s : 48 * s, width * 0.90);
  const bottomGap = 48 * s;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: bottomGap,
        padding: `0 ${48 * s}px`,
        fontFamily: font,
      }}
    >
      {/* Logo image when uploaded, else the brand wordmark */}
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={brandName}
          style={{
            width: logoWidth,
            maxHeight: logoMaxHeight,
            objectFit: "contain",
            transform: `scale(${logoZoom})`,
            transformOrigin: "center center",
            opacity: itemOpacity,
            display: "block",
          }}
        />
      ) : (
        <div
          style={{
            fontSize: wordmarkSize,
            fontWeight: 800,
            color: textColor,
            letterSpacing: wordmarkTracking,
            lineHeight: 1.05,
            textAlign: "center",
            transform: `scale(${logoZoom})`,
            transformOrigin: "center center",
            opacity: itemOpacity,
            textShadow: "0 1px 6px rgba(0,0,0,0.25)",
          }}
        >
          {brandName}
        </div>
      )}

      {/* Editable action + address. Either line may be omitted. */}
      {(actionText || addressText) && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12 * s,
            opacity: itemOpacity * 0.92,
            transform: `scale(${0.96 + 0.04 * landP})`,
            transformOrigin: "center center",
          }}
        >
          {actionText && (
            <div style={{
              fontSize: actionFontSize,
              fontWeight: 700,
              color: textColor,
              textAlign: "center",
              letterSpacing: actionTracking,
              textShadow: "0 1px 6px rgba(0,0,0,0.25)",
            }}>
              {actionText}
            </div>
          )}
          {addressText && (
            <div style={{
              fontSize: urlFontSize,
              fontWeight: 500,
              color: textColor,
              textAlign: "center",
              letterSpacing: urlTracking,
              opacity: actionText ? 0.78 : 1,
              textShadow: "0 1px 6px rgba(0,0,0,0.25)",
            }}>
              {addressText}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
