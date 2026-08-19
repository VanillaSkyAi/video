/**
 * ctaLogo — Brand-stamp closer.
 *
 * Logo (or brand wordmark when no logo is uploaded) centered in the frame.
 * CTA and URL sit directly below. Background is media when
 * a mediaUrl is provided, otherwise the standard brand-color gradient
 * (same SceneBackground pipeline as `media` and `ctaMedia`).
 *
 * The Apple-style sign-off: identity + address, nothing else. Pick this
 * when the rest of the video did the talking and the close just needs to
 * stamp who and where.
 *
 * FX: shared SPRING_SMOOTH "land" curve over [0, 0.85].
 *  - Logo: fade + zoom 0.94 → 1.08
 *  - Wordmark fallback: same fade + zoom + letter-spacing collapse
 *    (0.4em → -0.02em) — type slowly tightens into place
 *  - URL: fade + scale + matching letter-spacing collapse (0.3em → 0.01em)
 */

import React from "react";
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { SceneBackground, getMediaBackgroundProps } from "./scene-background";
import { WordmarkReveal } from "../primitives/typography/WordmarkReveal";

export const CtaLogoTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  motionProgress = progress,
  width,
  height,
  sceneDuration,
  isPlaying,
}) => {
  const { foreground, font } = resolveTokens(style);
  const textColor = foreground;

  const brandName = style.brand.name ?? "";
  const url = String(variables.url || "");
  const cta = String(variables.cta || "");
  const logoUrl = style.brand.logoUrl ?? "";
  const mediaUrl = String(variables.mediaUrl || "");
  const mediaType = String(variables.mediaType || "auto");

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
      {/* [slot: background] Media when set, brand gradient otherwise. */}
      <SceneBackground
        style={style}
        progress={progress}
        sceneDuration={sceneDuration}
        width={width}
        height={height}
        {...getMediaBackgroundProps(variables)}
        mediaUrl={mediaUrl}
        mediaType={mediaType}
        seed={brandName}
        isPlaying={isPlaying}
      />

      {/* [slot: hero] Centered wordmark stack — WordmarkReveal primitive
          (provides its own positioned wrapper and motion; the brand name IS
          the text, so there is no separate caption slot). */}
      <WordmarkReveal
        progress={motionProgress}
        brandName={brandName}
        url={url}
        cta={cta}
        logoUrl={logoUrl}
        width={width}
        height={height}
        font={font}
        textColor={textColor}
      />
    </div>
  );
};

// Unused import suppression — s was used inline for sizes before extraction,
// now WordmarkReveal computes its own scale factor.
void 0;
