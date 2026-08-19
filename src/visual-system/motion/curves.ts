/**
 * Animation utilities — interpolate, spring, easing.
 * Pure math functions, no external dependencies.
 * Inspired by Remotion's API but fully independent.
 */

// ─── Easing functions ────────────────────────────────────────────

/**
 * CSS-style cubic-bezier curve → easing function (t: 0..1 → eased value).
 * Deterministic Newton-Raphson with bisection fallback — same approach as
 * the browser's cubic-bezier(). y values outside [0, 1] produce overshoot.
 *
 * docs/motion-library.md §1 references curves as `Easing.bezier(...)` —
 * this is that function (also exposed as `Easing.bezier`).
 */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return sampleY(t);
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    // Bisection fallback — sampleX is monotonic on [0, 1] for valid curves.
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 24; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

export const Easing = {
  /** Easing.bezier(0.16, 1, 0.3, 1) — the canonical curve syntax from docs/motion-library.md. */
  bezier: cubicBezier,
  // Curves
  linear: (t: number) => t,
  quad: (t: number) => t * t,
  cubic: (t: number) => t * t * t,
  sin: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  exp: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  circle: (t: number) => 1 - Math.sqrt(1 - t * t),

  // Directional modifiers
  in: (fn: (t: number) => number) => fn,
  out:
    (fn: (t: number) => number) =>
    (t: number) =>
      1 - fn(1 - t),
  inOut:
    (fn: (t: number) => number) =>
    (t: number) =>
      t < 0.5 ? fn(t * 2) / 2 : 1 - fn((1 - t) * 2) / 2,
} as const;

// ─── Interpolate ─────────────────────────────────────────────────

interface InterpolateOptions {
  easing?: (t: number) => number;
  extrapolateLeft?: "clamp" | "extend";
  extrapolateRight?: "clamp" | "extend";
}

/**
 * Maps a value from one range to another with optional easing and clamping.
 *
 * @example
 * interpolate(0.5, [0, 1], [0, 100]) // 50
 * interpolate(progress, [0, 0.7], [0, 10000], { extrapolateRight: "clamp" })
 */
export function interpolate(
  value: number,
  inputRange: readonly [number, ...number[]],
  outputRange: readonly [number, ...number[]],
  options?: InterpolateOptions,
): number {
  const { easing, extrapolateLeft = "extend", extrapolateRight = "extend" } = options ?? {};

  // Find the segment
  let i = 0;
  for (; i < inputRange.length - 2; i++) {
    if (value < inputRange[i + 1]) break;
  }

  const inputMin = inputRange[i];
  const inputMax = inputRange[i + 1];
  const outputMin = outputRange[i];
  const outputMax = outputRange[i + 1];

  // Normalize to 0-1
  let t = inputMax === inputMin ? 0 : (value - inputMin) / (inputMax - inputMin);

  // Clamp
  if (t < 0 && extrapolateLeft === "clamp") t = 0;
  if (t > 1 && extrapolateRight === "clamp") t = 1;

  // Apply easing
  if (easing && t >= 0 && t <= 1) {
    t = easing(t);
  }

  return outputMin + t * (outputMax - outputMin);
}

// ─── Spring ──────────────────────────────────────────────────────

export interface SpringConfig {
  damping?: number;
  stiffness?: number;
  mass?: number;
}

// Presets
export const SPRING_SMOOTH: SpringConfig = { damping: 26, stiffness: 170 };
export const SPRING_SNAPPY: SpringConfig = { damping: 20, stiffness: 300 };
export const SPRING_BOUNCY: SpringConfig = { damping: 10, stiffness: 180 };
// Lower damping than SNAPPY + higher stiffness → subtle overshoot, quick settle.
// Sits between SNAPPY (no overshoot) and BOUNCY (lots) for a "punchy but not silly" feel.
export const SPRING_CRISP: SpringConfig = { damping: 14, stiffness: 320 };

/**
 * Spring physics simulation. Converts linear progress (0→1) to
 * spring-eased progress with overshoot and settle.
 *
 * @param progress - Linear progress 0→1
 * @param config - Spring physical properties
 * @returns Spring-eased value (may overshoot 1 with low damping)
 *
 * @example
 * const scale = spring(progress, SPRING_BOUNCY); // bouncy entrance
 * const opacity = spring(progress, SPRING_SMOOTH); // smooth fade
 */
export function spring(progress: number, config?: SpringConfig): number {
  if (progress <= 0) return 0;
  if (progress >= 1) {
    // For high-damping (no overshoot) configs, settle at 1
    const { damping = 26 } = config ?? {};
    if (damping >= 20) return 1;
  }

  const { damping = 26, stiffness = 170, mass = 1 } = config ?? {};

  // Simulate spring physics at the given progress point
  // We run a fixed number of iterations to find the spring value
  const omega = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  // Scale progress to a time value (spring needs ~1-3s to settle)
  const t = progress * 3.5;

  let value: number;

  if (zeta < 1) {
    // Underdamped (bouncy)
    const omegaD = omega * Math.sqrt(1 - zeta * zeta);
    value = 1 - Math.exp(-zeta * omega * t) * (Math.cos(omegaD * t) + (zeta * omega / omegaD) * Math.sin(omegaD * t));
  } else if (zeta === 1) {
    // Critically damped
    value = 1 - Math.exp(-omega * t) * (1 + omega * t);
  } else {
    // Overdamped
    const s1 = -omega * (zeta + Math.sqrt(zeta * zeta - 1));
    const s2 = -omega * (zeta - Math.sqrt(zeta * zeta - 1));
    value = 1 + (s1 * Math.exp(s2 * t) - s2 * Math.exp(s1 * t)) / (s2 - s1);
  }

  return value;
}

// ─── Stagger helper ──────────────────────────────────────────────

/**
 * Returns a progress value for a staggered animation item.
 * Maps overall progress to per-item progress with delay.
 *
 * @param progress - Overall scene progress (0→1)
 * @param index - Item index (0-based)
 * @param total - Total number of items
 * @param staggerDelay - Delay between items (0→1 scale, default 0.08)
 * @param startAt - When the first item should start appearing (default 0.1)
 *
 * @example
 * items.map((item, i) => {
 *   const itemProgress = stagger(progress, i, items.length);
 *   const opacity = spring(itemProgress, SPRING_SMOOTH);
 *   return <div style={{ opacity }}>{item}</div>;
 * })
 */
export function stagger(
  progress: number,
  index: number,
  total: number,
  staggerDelay = 0.08,
  startAt = 0.1,
): number {
  const itemStart = startAt + index * staggerDelay;
  const available = 1 - startAt - (total - 1) * staggerDelay;
  const itemDuration = Math.max(0.1, available);
  return Math.max(0, Math.min(1, (progress - itemStart) / itemDuration));
}
