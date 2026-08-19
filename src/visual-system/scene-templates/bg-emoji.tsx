/**
 * bg-emoji — emoji characters bursting outward like fireworks.
 *
 * Progress-driven particle positions for export compatibility.
 * Emojis burst from center, drift outward, then fall with gravity.
 */
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { TemplateText } from "./template-text";
import type { TextArchetype } from "../typography";
import { BrandGradientOverlay } from "../backgrounds";
import { Emoji } from "../emoji";
import { getCelebrationParticleTiming } from "./celebration-particle-timing";

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const EMOJI_LIST = [
  "\u2764\uFE0F",     // red heart
  "\u2B50",           // star
  "\uD83C\uDF89",     // party popper
  "\uD83E\uDD84",     // unicorn
  "\uD83D\uDD25",     // fire
  "\u2728",           // sparkles
  "\uD83D\uDE80",     // rocket
  "\uD83D\uDC9C",     // purple heart
];

const PARTICLE_COUNT = 100;

// Physics: even angular fan-out (360°) from center. Emojis fly radially
// outward in their launch direction until they exit the frame — no falling
// trajectory, which previously read as "celebration failed". A very gentle
// gravity tugs them slightly downward over time so the motion still feels
// natural. No 3D flip — flipped emojis read backwards.

function easeOutQuad(p: number): number {
  return 1 - (1 - p) * (1 - p);
}

export const BgEmojiTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  motionProgress = progress,
  beatIntensity,
  width,
  height,
  textArchetype,
  safeZone,
  sceneDuration,
}) => {
  const s = Math.min(width, height) / 1080;
  /* Radial burst — sized off the long edge so even particles launched
   * along the long axis exit the frame by progress=1. Half-diagonal of
   * a 9:16 frame ≈ 0.61 * longEdge; 0.95 leaves ~35% headroom past the
   * corner so emojis are clearly travelling, not parked at the edge. */
  const BURST_RADIUS = Math.max(width, height) * 0.95;
  const { foreground, font } = resolveTokens(style);
  const textColor = foreground;

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
      {/* [slot: background] Atomic brand backdrop; no stock media by design. */}
      <BrandGradientOverlay style={style} progress={progress} sceneDuration={sceneDuration} seed={String(variables.texts || "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)} />

      {/* [slot: badge] Emoji fan-out is the celebration layer. */}
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        const seed = i + 1;
        const angle = (i / PARTICLE_COUNT) * Math.PI * 2;

        const forceFactor    = 0.75 + seededRandom(seed * 1) * 0.5;             // 0.75..1.25
        const durationFactor = 1.1  + seededRandom(seed * 3) * 0.6;             // 1.1..1.7 — slow arc
        const emoji          = EMOJI_LIST[i % EMOJI_LIST.length];
        const startRot       = seededRandom(seed * 5) * 60 - 30;                // small initial tilt
        const rotSpeed       = (seededRandom(seed * 6) - 0.5) * 540;            // gentle Z-spin only
        const sizeJitter     = 0.7 + seededRandom(seed * 7) * 0.7;              // 0.7..1.4

        const timing = getCelebrationParticleTiming(motionProgress, i, durationFactor);
        if (!timing) return null;
        const p = timing.progress;

        const reach   = BURST_RADIUS * forceFactor;
        const radialP = easeOutQuad(p);
        const gravity = height * 0.08 * p * p;
        const x = width * 0.5 + Math.cos(angle) * reach * radialP;
        const y = height * 0.5 + Math.sin(angle) * reach * radialP + gravity;

        const baseSize = (28 + seededRandom(seed * 11) * 24) * s;
        const size = baseSize * sizeJitter;

        const popScale = Math.min(1, p * 30);
        const particleOpacity = p < 0.85 ? 1 : Math.max(0, 1 - (p - 0.85) / 0.15);
        const opacity = particleOpacity * timing.opacity;
        const beatPulse = 1 + beatIntensity * 0.2;
        const rot = startRot + rotSpeed * p;

        if (opacity <= 0) return null;
        if (y > height + 100 || y < -100 || x < -100 || x > width + 100) return null;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              fontSize: size * 0.8,
              lineHeight: 1,
              textAlign: "center",
              opacity,
              transform: `rotate(${rot}deg) scale(${popScale * beatPulse})`,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Emoji char={emoji} size={size * 0.8} verticalAlign="baseline" />
          </div>
        );
      })}

      {/* [slot: caption] */}
      <TemplateText
        motionProgress={motionProgress}
        typeTreatment={resolveTokens(style).preset.type}
        archetype={(textArchetype as TextArchetype) ?? "subtle"}
        text={String(variables.texts ?? "")}
        progress={progress}
        sceneDuration={sceneDuration ?? 3}
        width={width}
        height={height}
        position="center"
        sizeRole="headline"
        safeZone={safeZone}
        font={font}
        color={textColor}
        beatIntensity={beatIntensity}
      />
    </div>
  );
};
