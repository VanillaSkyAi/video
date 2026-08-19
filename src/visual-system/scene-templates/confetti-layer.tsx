/**
 * confetti-layer — reusable confetti burst layer.
 *
 * Extracted from bg-confetti.tsx so any host template can compose the same
 * physics on top of its own backdrop. Used by:
 *  - bg-confetti.tsx (the standalone celebration template — gradient bg)
 *  - bg-media.tsx     (conditional via the `confetti` boolean — confetti
 *    layered over photo / video / gradient)
 *
 * Physics: 200 particles, even angular fan-out (360°) from center.
 * Particles move RADIALLY outward — both x and y follow the burst angle so
 * each particle exits the frame in its launch direction (top, sides, bottom
 * corners). A very gentle gravity tugs them slightly downward over time so
 * the motion still reads as natural, but it's never strong enough to reverse
 * an upward trajectory before the particle exits the frame. 3D tumble
 * approximated via scaleX flip. Progress-driven — deterministic for export.
 */

import React from "react";
import { getCelebrationParticleTiming } from "./celebration-particle-timing";

const PARTICLE_COUNT = 200;

// Confetti palette spans the full hue wheel; filtered at runtime to drop any
// color too close in hue to the background (and would disappear).
const COLORS = ["#ef4444", "#ff6b6b", "#f97316", "#fb923c", "#ffd93d", "#34d399", "#6bcbff", "#818cf8", "#a78bfa", "#f472b6", "#ffffff"];

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Outward sweep — softer ease-out quad. Less front-loaded than cubic so
 *  the burst reads as a graceful arc rather than an explosion-and-stop. */
function easeOutQuad(p: number): number {
  return 1 - (1 - p) * (1 - p);
}

function hexHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return h * 360;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export interface ConfettiLayerProps {
  progress: number;
  width: number;
  height: number;
  beatIntensity?: number;
  /**
   * Optional background tone for hue-filtering. When provided, palette
   * colors within 35° of this hue are dropped so confetti doesn't blend
   * into a same-hue gradient. Pass the bg's dominant color (typically
   * secondary or accent). Omit for media-bg cases (photos/videos have no
   * single dominant color); the full palette will be used.
   */
  bgColor?: string;
}

export const ConfettiLayer: React.FC<ConfettiLayerProps> = ({
  progress,
  width,
  height,
  beatIntensity = 0,
  bgColor,
}) => {
  const s = Math.min(width, height) / 1080;
  /* Radial burst — each particle flies out in its launch direction until
   * it leaves the frame. Reach is sized off the LONG edge so even
   * particles aimed along the long axis (top/bottom in portrait, sides
   * in landscape) clear the frame edge by progress=1. Half-diagonal of
   * a 9:16 frame ≈ 0.61 * longEdge, so 0.95 gives ~35% headroom past
   * the corner — particles exit cleanly with a few hundred px of trail. */
  const BURST_RADIUS = Math.max(width, height) * 0.95;

  // Filter palette only if a bgColor is provided (gradient context). Over
  // photos/videos we keep the full palette since there's no single bg hue.
  let allColors = COLORS;
  if (bgColor) {
    const bgHue = hexHue(bgColor);
    const filtered = COLORS.filter(c => c === "#ffffff" || hueDistance(hexHue(c), bgHue) > 35);
    if (filtered.length >= 4) allColors = filtered;
  }

  return (
    <>
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        const seed = i + 1;

        // Even angular distribution — single biggest "feel" win vs random.
        const angle = (i / PARTICLE_COUNT) * Math.PI * 2;

        // Per-particle variance
        const forceFactor    = 0.75 + seededRandom(seed * 1) * 0.5;   // 0.75..1.25
        const durationFactor = 1.1  + seededRandom(seed * 3) * 0.6;   // 1.1..1.7 — slow arc
        const color          = allColors[i % allColors.length];
        const isCircle       = seededRandom(seed * 4) > 0.85;
        const startRot       = seededRandom(seed * 5) * 360;
        const rotSpeed       = (seededRandom(seed * 6) - 0.5) * 1440;
        const flipSpeed      = 3 + seededRandom(seed * 7) * 4;
        const flipPhase      = seededRandom(seed * 8) * Math.PI * 2;
        const widthFactor    = 0.45 + seededRandom(seed * 9) * 0.6;
        const heightFactor   = 0.7  + seededRandom(seed * 10) * 0.6;

        const timing = getCelebrationParticleTiming(progress, i, durationFactor);
        if (!timing) return null;
        const p = timing.progress;

        // Radial burst — particles fly outward in their launch direction.
        // Outward distance eases out so they decelerate slightly near the
        // frame edge but don't reverse. A small quadratic gravity term tugs
        // them downward over time without overriding upward velocity before
        // they exit the frame.
        const reach   = BURST_RADIUS * forceFactor;
        const radialP = easeOutQuad(p);
        const gravity = height * 0.08 * p * p;
        const x = width * 0.5 + Math.cos(angle) * reach * radialP;
        const y = height * 0.5 + Math.sin(angle) * reach * radialP + gravity;

        const flip = Math.cos(p * Math.PI * flipSpeed + flipPhase);
        const rot  = startRot + rotSpeed * p;

        const baseSize = (8 + seededRandom(seed * 11) * 10) * s;
        const w = baseSize * widthFactor;
        const h = isCircle ? w : baseSize * heightFactor;

        const popScale = Math.min(1, p * 30);
        const particleOpacity = p < 0.85 ? 1 : Math.max(0, 1 - (p - 0.85) / 0.15);
        const opacity = particleOpacity * timing.opacity;
        const beatPulse = 1 + beatIntensity * 0.15;

        if (opacity <= 0) return null;
        if (y > height + 120 || y < -120 || x < -120 || x > width + 120) return null;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - w / 2,
              top: y - h / 2,
              width: w,
              height: h,
              borderRadius: isCircle ? "50%" : 1,
              backgroundColor: color,
              opacity,
              transform: `rotate(${rot}deg) scaleX(${flip}) scale(${popScale * beatPulse})`,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </>
  );
};
