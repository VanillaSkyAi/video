/**
 * Background motion effects for templates.
 *
 * Applied to the background layer (media, gradient) throughout the entire scene.
 * Continuous motion — not tied to text timing.
 *
 * Templates with usesGlobalBackgroundEffect: true consume the video-level default.
 *
 * 9 effects, each with a distinct mood:
 * - static:        No motion — intentional stillness
 * - slow-zoom-in:  Draw attention inward, build focus
 * - slow-zoom-out: Reveal, establish, pull back
 * - ken-burns:     Classic cinematic photo motion (zoom + pan, direction alternates per scene)
 * - drift:         Gentle lateral pan (direction alternates per scene)
 * - pulse:         Beat-synced energy
 * - breathe:       Ambient dreamy float
 * - slow-tilt:     Tension, Dutch angle drift
 * - camera-shake:  Intensity, handheld drama
 */

import { interpolate } from "../motion";

export interface BackgroundTransform {
  transform: string;
  transformOrigin: string;
}

export const BACKGROUND_EFFECTS = [
  "static",
  "slow-zoom-in",
  "slow-zoom-out",
  "ken-burns",
  "drift",
  "pulse",
  "breathe",
  "slow-tilt",
  "camera-shake",
] as const;

// ─── Directional variant helpers ────────────────────────────────
// Ken Burns and Drift have internal direction variants that alternate
// by scene index to create visual variety across a video.

type Direction = "right" | "left" | "up" | "down";
const DIRECTIONS: Direction[] = ["right", "left", "up", "down"];

function getKenBurnsTransform(progress: number, direction: Direction): BackgroundTransform {
  const scale = interpolate(progress, [0, 1], [1.05, 1.15]);
  const mainAxis = direction === "right" || direction === "left";
  const sign = direction === "right" || direction === "down" ? 1 : -1;
  const primary = interpolate(progress, [0, 1], [-2 * sign, 2 * sign]);
  const secondary = interpolate(progress, [0, 1], [-0.5, 0.5]);

  const x = mainAxis ? primary : secondary;
  const y = mainAxis ? secondary : primary;

  return {
    transform: `scale(${scale}) translate(${x}%, ${y}%)`,
    transformOrigin: "center",
  };
}

function getDriftTransform(progress: number, direction: Direction): BackgroundTransform {
  const horizontal = direction === "right" || direction === "left";
  const sign = direction === "right" || direction === "down" ? 1 : -1;
  const offset = interpolate(progress, [0, 1], [-2 * sign, 2 * sign]);

  return {
    transform: horizontal
      ? `scale(1.1) translateX(${offset}%)`
      : `scale(1.1) translateY(${offset}%)`,
    transformOrigin: "center",
  };
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Get background transform for the current progress.
 *
 * @param effect — background effect name
 * @param progress — scene progress 0→1
 * @param beatIntensity — 0→1 for beat-reactive effects
 * @param sceneIndex — used to alternate direction for ken-burns/drift
 */
export function getBackgroundTransform(
  effect: string | undefined,
  progress: number,
  beatIntensity = 0,
  sceneIndex = 0,
): BackgroundTransform {
  const dir = DIRECTIONS[sceneIndex % DIRECTIONS.length];

  // Undefined falls through to slow-zoom-in. Previously the missing
  // case landed in the `default:` branch alongside `"static"`, returning
  // `transform: "none"` — so every video where the AI didn't set
  // backgroundEffect (i.e. nearly all of them) rendered with zero
  // motion while the editor UI displayed "Slow zoom in" as default.
  // Now renderer and UI agree: `undefined` means motion, `"static"`
  // is the explicit opt-out. Slow zoom in (scale 1.00 → 1.12, no
  // translate) is the safest default for 2-4 s scenes — visible
  // enough to register, gentle enough not to pull focus from text.
  // Ken Burns adds translate that's too fast on short clips; reserve
  // for longer photo scenes via an explicit opt-in.
  const resolved = effect ?? "slow-zoom-in";

  switch (resolved) {
    case "slow-zoom-in":
      return {
        transform: `scale(${interpolate(progress, [0, 1], [1, 1.12])})`,
        transformOrigin: "center",
      };

    case "slow-zoom-out":
      return {
        transform: `scale(${interpolate(progress, [0, 1], [1.12, 1])})`,
        transformOrigin: "center",
      };

    case "ken-burns":
      return getKenBurnsTransform(progress, dir);

    case "drift":
      return getDriftTransform(progress, dir);

    case "pulse": {
      // Subtle scale pulse synced to beat
      const base = 1 + beatIntensity * 0.04;
      const breathe = 1 + Math.sin(progress * Math.PI * 2) * 0.02;
      return {
        transform: `scale(${base * breathe})`,
        transformOrigin: "center",
      };
    }

    case "breathe": {
      // Slow ambient float — gentle scale + vertical drift, not beat-synced
      const s = 1 + Math.sin(progress * Math.PI) * 0.03;
      const y = Math.sin(progress * Math.PI) * 0.5;
      return {
        transform: `scale(${s}) translateY(${y}%)`,
        transformOrigin: "center",
      };
    }

    case "slow-tilt": {
      // Subtle Dutch angle drift
      const angle = interpolate(progress, [0, 1], [0, 2.5]);
      return {
        transform: `scale(1.08) rotate(${angle}deg)`,
        transformOrigin: "center",
      };
    }

    case "camera-shake": {
      // Rapid small offsets for handheld/dramatic feel
      // Deterministic noise based on progress for reproducibility
      const t = progress * 40;
      const sx = Math.sin(t * 2.3) * 0.4 + Math.sin(t * 5.7) * 0.2;
      const sy = Math.cos(t * 3.1) * 0.3 + Math.cos(t * 4.9) * 0.15;
      const sr = Math.sin(t * 1.7) * 0.3;
      return {
        transform: `scale(1.05) translate(${sx}%, ${sy}%) rotate(${sr}deg)`,
        transformOrigin: "center",
      };
    }

    case "static":
    default:
      return {
        transform: "none",
        transformOrigin: "center",
      };
  }
}
