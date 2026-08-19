/**
 * Text archetypes — 7 complete lifecycles (entrance + hold + exit).
 *
 * Each archetype is a single named effect that owns its full lifecycle: how
 * text arrives, how it sits, how it leaves. The AI picks one name and that's
 * the whole package.
 *
 * Motion design principles applied per archetype:
 *  - Distinct easing per phase (entrance ≠ exit, archetype-tuned)
 *  - Anticipation / overshoot where the role calls for it
 *  - Hold-phase breathing — no dead frames, ever
 *  - Compound motion — multiple properties (scale, opacity, translate,
 *    letter-spacing) move together with subtle offsets
 *  - Exits are absolute-timed (in seconds), not a fixed % of scene, so
 *    motion stays readable on long scenes too
 *
 * Filter:blur is unavailable (template determinism), so depth illusions are
 * carried by scale magnitude + letter-spacing + opacity ramp shape.
 */

import {
  interpolate,
  spring,
  Easing,
  SPRING_CRISP,
} from "../motion";

// ─── Archetype names ────────────────────────────────────────────

export const TEXT_ARCHETYPES = [
  "subtle",
  "typewriter",
  "wordStagger",
  "slam",
  "cinematic",
  "heroWord",
] as const;

export type TextArchetype = (typeof TEXT_ARCHETYPES)[number];
export type TextCanvas = "tight" | "open";
export type TextRole = "hook" | "body" | "closer";

/**
 * Normalize an input to a valid TextArchetype. Handles:
 *  - undefined / null / empty → "subtle"
 *  - already-valid archetype name → unchanged
 *  - unknown string → "subtle" fallback
 */
export function normalizeArchetype(input: unknown): TextArchetype {
  if (typeof input !== "string" || input.length === 0) return "subtle";
  if ((TEXT_ARCHETYPES as readonly string[]).includes(input)) return input as TextArchetype;
  return "subtle";
}

// ─── Spec data ──────────────────────────────────────────────────

export interface ArchetypeSpec {
  name: TextArchetype;
  description: string;
  /** Entrance phase duration in seconds. */
  entrance: number;
  /** Exit phase duration in seconds. */
  exit: number;
  /** Where this archetype is allowed to run. */
  allowedCanvas: TextCanvas[];
  /** Suggested role(s) in the video arc. */
  roles: TextRole[];
  /** Font-size multiplier envelope vs. the slot's natural body size. */
  sizeRange: [number, number];
  /**
   * Minimum DURATION the effect itself needs (seconds), with SHORT text.
   * For text-dependent archetypes (typewriter, wordStagger, heroWord) the
   * actual minimum scales with content length — use `minDurationFor()` for
   * an accurate per-text computation.
   */
  minDuration: number;
  /**
   * Maximum DURATION the effect itself uses (seconds). On a longer scene,
   * the effect runs for at most this long, then disappears — leaving the
   * remaining scene time for the AI to fill with another effect. Prevents
   * "ages to build up" on long scenes.
   *
   * If text is so long that `minDurationFor()` exceeds this value, the
   * minimum wins (text needs the time).
   */
  maxDuration: number;
}

// Timings tuned to research findings (Material 3 motion tokens, AE motion-design
// conventions, "exits faster than entrances by 60–75%" rule). Values target
// 2.5s scene by default; phase math scales for longer scenes.
export const ARCHETYPE_SPECS: Record<TextArchetype, ArchetypeSpec> = {
  subtle: {
    name: "subtle",
    description: "Quiet caption. Visual is the star, text supports.",
    entrance: 0.5,
    exit: 0.7,
    allowedCanvas: ["tight", "open"],
    roles: ["body", "closer"],
    sizeRange: [0.7, 1.0],
    minDuration: 1.5,
    maxDuration: 5,
  },
  typewriter: {
    name: "typewriter",
    description: "Char-by-char reveal with blinking cursor. Slide-left cascade exit, top line first.",
    entrance: 1.2,
    exit: 0.85,
    allowedCanvas: ["tight", "open"],
    roles: ["body", "hook"],
    sizeRange: [0.8, 1.0],
    minDuration: 1.8,
    maxDuration: 6,
  },
  wordStagger: {
    name: "wordStagger",
    description: "Sequential word build with active-word focus. Slide-left cascade exit, top line first.",
    entrance: 1.4,
    exit: 0.7,
    allowedCanvas: ["tight", "open"],
    roles: ["body"],
    sizeRange: [0.8, 1.0],
    minDuration: 1.8,
    maxDuration: 6,
  },
  slam: {
    name: "slam",
    description: "In-place impact with violent squash-and-stretch, frame shake, and letter crunch.",
    entrance: 0.5,
    exit: 0.5,
    allowedCanvas: ["tight", "open"],
    roles: ["hook", "body"],
    sizeRange: [0.9, 1.2],
    minDuration: 1.2,
    maxDuration: 4,
  },
  cinematic: {
    name: "cinematic",
    description: "Trailer FlyIn from depth → recedes back into background.",
    entrance: 0.7,
    exit: 0.8,
    allowedCanvas: ["open"],
    roles: ["hook", "body", "closer"],
    sizeRange: [0.9, 1.1],
    minDuration: 1.8,
    maxDuration: 6,
  },
  heroWord: {
    name: "heroWord",
    description: "Single word fills frame. Simple fast exit so words get the most time.",
    entrance: 0.35,
    exit: 0.25,
    allowedCanvas: ["open"],
    roles: ["hook", "body", "closer"],
    sizeRange: [2.0, 3.0],
    minDuration: 1.0,
    maxDuration: 5,
  },
};

// ─── Lifecycle constants ────────────────────────────────────────

const ENTRANCE_START = 0.02;
// Phase caps prevent very short scenes from making in/out exceed the scene.
const ENTRANCE_PHASE_CAP = 0.4;
const EXIT_PHASE_CAP = 0.4;

// ─── Render output shapes ───────────────────────────────────────

export interface BlockStyle {
  opacity: number;
  transform: string;
  letterSpacing?: string;
  /**
   * `willChange` hint to keep the layer GPU-composited during animation.
   * Used by cinematic where the scale-collapse needs to stay smooth on
   * mobile Safari (which otherwise downgrades the layer mid-animation).
   */
  willChange?: string;
}

export interface PerWordStyle {
  text: string;
  style: BlockStyle;
}

export type ArchetypeRender =
  | { kind: "block"; block: BlockStyle; text: string }
  | {
      kind: "typewriter";
      visibleChars: number;
      cursor: boolean;
      opacity: number;
      transform: string;
      /**
       * Per-character exit overrides — present during the exit phase to
       * drive a slide-left cascade in reading order. One entry per char
       * in `text`. Undefined during entrance/hold.
       */
      charExits?: { opacity: number; translateX: number }[];
    }
  | {
      kind: "words";
      words: PerWordStyle[];
      blockOpacity: number;
      blockTransform: string;
    }
  | {
      kind: "hero";
      word: string;
      index: number;
      total: number;
      opacity: number;
      transform: string;
      letterSpacing?: string;
    };

// ─── Phase + timing helpers ─────────────────────────────────────

interface Phases {
  entrancePhase: number;
  exitPhase: number;
  exitStart: number;
  inExit: boolean;
}

function computePhases(
  spec: ArchetypeSpec,
  sceneDuration: number,
  progress: number,
  phaseScale = 1,
): Phases {
  // `phaseScale` is style.motion (calm 1.4 / normal 1 / punchy 0.7). It
  // stretches or compresses how much of the scene the entrance and exit
  // occupy; the caps below still bound them, so a calm video never spends
  // the whole scene animating in.
  const entrancePhase = Math.min(ENTRANCE_PHASE_CAP, (spec.entrance * phaseScale) / sceneDuration);
  const exitPhase = Math.min(EXIT_PHASE_CAP, (spec.exit * phaseScale) / sceneDuration);
  const exitStart = 1 - exitPhase;
  return { entrancePhase, exitPhase, exitStart, inExit: progress >= exitStart };
}

function rawEntrance(progress: number, entrancePhase: number, startAt = ENTRANCE_START): number {
  return interpolate(progress, [startAt, startAt + entrancePhase], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function rawExit(progress: number, exitStart: number): number {
  if (progress < exitStart) return 0;
  return interpolate(progress, [exitStart, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

// Normalized hold time 0→1 over the hold phase; 0 outside.
function holdT(
  progress: number,
  entrancePhase: number,
  exitStart: number,
  startAt = ENTRANCE_START,
): number {
  const holdStart = startAt + entrancePhase;
  if (progress < holdStart || progress > exitStart || exitStart <= holdStart) return 0;
  return (progress - holdStart) / (exitStart - holdStart);
}

// Sine breathe — returns offset around 0; magnitude is peak-to-peak.
function breathe(t: number, magnitude: number, cycles = 1): number {
  return (Math.sin(t * Math.PI * 2 * cycles) * magnitude) / 2;
}

// ─── Renderer ───────────────────────────────────────────────────

export function renderArchetype(
  archetypeRaw: TextArchetype | string | undefined,
  progress: number,
  scale: number,
  text: string,
  sceneDuration: number,
  /** style.motion's phase multiplier. 1 (the default) is the authored timing. */
  phaseScale = 1,
  /** Optional transition-safe clock for entrance/exit motion only. */
  motionProgress = progress,
): ArchetypeRender {
  const archetype = normalizeArchetype(archetypeRaw);
  const spec = ARCHETYPE_SPECS[archetype];
  const phases = computePhases(spec, sceneDuration, motionProgress, phaseScale);
  // Semantic reveals stay on raw time even if a custom host supplies a
  // different presentation clock. VideoFrame itself preserves the same
  // complete 0→1 timeline for both clocks.
  const presentationProgress = Math.max(progress, motionProgress);

  switch (archetype) {
    case "subtle":
      return renderSubtle(motionProgress, scale, text, phases);
    case "typewriter":
      return renderTypewriter(presentationProgress, motionProgress, scale, text, phases, sceneDuration);
    case "wordStagger":
      return renderWordStagger(presentationProgress, motionProgress, scale, text, sceneDuration);
    case "slam":
      return renderSlam(motionProgress, scale, text, phases);
    case "cinematic":
      return renderCinematic(motionProgress, scale, text, phases);
    case "heroWord":
      return renderHeroWord(presentationProgress, motionProgress, text, phases);
  }
}

// ─── subtle ─────────────────────────────────────────────────────
// Pure fade in / fade out — true to the name. No translation, no breathe,
// no transition jump. The supporting caption that doesn't compete with the
// visual. Only thing animating is opacity.
function renderSubtle(
  progress: number,
  _scale: number,
  text: string,
  phases: Phases,
): ArchetypeRender {
  const raw = rawEntrance(progress, phases.entrancePhase);
  const ex = rawExit(progress, phases.exitStart);

  const opacityIn = Easing.out(Easing.cubic)(raw);
  const opacityOut = 1 - Easing.in(Easing.cubic)(ex);
  const opacity = opacityIn * (phases.inExit ? opacityOut : 1);

  return {
    kind: "block",
    block: {
      opacity,
      transform: "none",
    },
    text,
  };
}

// ─── typewriter ─────────────────────────────────────────────────
// Char reveal with deterministic cursor blink. Exit slides each char off
// the left edge in reading order — same cascade pattern as wordStagger
// (top line clears first by virtue of reading-order index ascending).
function renderTypewriter(
  progress: number,
  motionProgress: number,
  scale: number,
  text: string,
  phases: Phases,
  sceneDuration: number,
): ArchetypeRender {
  const raw = rawEntrance(progress, phases.entrancePhase);

  // Constant typing pace — linear, no easing. Decelerating eases make the
  // last chars feel sluggish, which kills the typewriter rhythm.
  const visibleChars = Math.max(0, Math.floor(raw * text.length));

  // Time-based 1.5Hz blink (OS terminal convention). Stays consistent
  // regardless of scene length.
  const seconds = progress * sceneDuration;
  const cursorOn = Math.sin(seconds * Math.PI * 3) > 0;
  const stillTyping = visibleChars < text.length;

  // Entry opacity ramps fast (we want chars solid as they appear).
  const opacityIn = Math.min(1, raw * 8);

  // Cursor visible during typing and the tail of the hold; gone on exit.
  const cursor = cursorOn && (stillTyping || (!phases.inExit && opacityIn > 0.5));

  // Per-character exit cascade — slides each char left, staggered by
  // reading-order index. Compresses if the exit window can't fit the full
  // sequence (very long text on a short scene).
  let charExits: { opacity: number; translateX: number }[] | undefined;
  if (phases.inExit && text.length > 0) {
    const STAGGER_OUT = 0.025;
    const PER_CHAR_OUT = 0.30;
    const SLIDE_LEFT_DISTANCE = 350 * scale;
    const actualExitSec = phases.exitPhase * sceneDuration;
    const idealExitSec = (text.length - 1) * STAGGER_OUT + PER_CHAR_OUT;
    const outScale = Math.min(1, actualExitSec / idealExitSec);
    const stagOutNorm = (STAGGER_OUT * outScale) / sceneDuration;
    const perCharOutNorm = (PER_CHAR_OUT * outScale) / sceneDuration;

    charExits = Array.from({ length: text.length }, (_, i) => {
      const charExitStart = phases.exitStart + i * stagOutNorm;
      const charExitEnd = charExitStart + perCharOutNorm;
      const charExitRaw = interpolate(motionProgress, [charExitStart, charExitEnd], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const charExitEased = Easing.in(Easing.cubic)(charExitRaw);
      return {
        opacity: 1 - charExitEased,
        translateX: -charExitEased * SLIDE_LEFT_DISTANCE,
      };
    });
  }

  return {
    kind: "typewriter",
    visibleChars,
    cursor,
    opacity: opacityIn,
    transform: "none",
    charExits,
  };
}

// ─── wordStagger ────────────────────────────────────────────────
// Dynamic entrance: total time depends on word count (more words = more
// time to read each one), bounded so it doesn't run forever on long scenes
// or get crammed on short ones. As the NEXT word arrives, prior words dim
// to ~45% opacity — the kinetic-typography "active word" focus.
// Exit slides each word off the left edge in reading order. Words wrap via
// CSS so we never know line breaks at render time, but indices ARE in
// reading order — staggering by index gives a top-line-first cascade for
// free: words on line 1 occupy the lowest indices, so they exit before
// any word on line 2.
function renderWordStagger(
  progress: number,
  motionProgress: number,
  scale: number,
  text: string,
  sceneDuration: number,
): ArchetypeRender {
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = Math.max(words.length, 1);

  // Per-word timing constants (seconds). Min/max stagger keeps the cadence
  // in the Hollywood-typography sweet spot (~280–450ms per word land)
  // regardless of scene length.
  const STAGGER_MIN = 0.28;
  const STAGGER_MAX = 0.45;
  const PER_WORD_ANIM = 0.5;

  // Floor entrance using the minimum stagger.
  const minEntrance = (wordCount - 1) * STAGGER_MIN + PER_WORD_ANIM;

  // Target: ~55% of the scene for entrance, so longer scenes get a longer
  // build-up. Without this the entrance feels rushed against the long hold.
  const TARGET_ENTRANCE_FRACTION = 0.55;
  const targetEntrance = sceneDuration * TARGET_ENTRANCE_FRACTION;

  // Ceiling: leave room for exit + meaningful hold so the FINAL word sits
  // as the focal point.
  const exitSec = ARCHETYPE_SPECS.wordStagger.exit;
  const minHold = 0.5;
  const maxEntrance = Math.max(0.6, sceneDuration - exitSec - minHold);

  // Pick proportional target, bounded by [minEntrance, maxEntrance].
  let entranceSec = Math.min(maxEntrance, Math.max(minEntrance, targetEntrance));

  // Cap the implied per-word stagger at STAGGER_MAX so words don't sit too
  // long between lands on very long scenes.
  if (wordCount > 1) {
    const impliedStagger = (entranceSec - PER_WORD_ANIM) / (wordCount - 1);
    if (impliedStagger > STAGGER_MAX) {
      entranceSec = (wordCount - 1) * STAGGER_MAX + PER_WORD_ANIM;
    }
  }

  // Recompute phases for this archetype (overrides default phases).
  const entrancePhase = entranceSec / sceneDuration;
  const exitPhase = Math.min(0.4, exitSec / sceneDuration);
  const exitStart = 1 - exitPhase;

  // Word entrance window: each word's own animation gets PER_WORD_ANIM
  // seconds, the rest of entrancePhase is the staggered offset distribution.
  const staggerIn =
    wordCount > 1 ? (entranceSec - PER_WORD_ANIM) / (wordCount - 1) / sceneDuration : 0;
  const wordEntranceDur = PER_WORD_ANIM / sceneDuration;

  // Per-word exit cadence. STAGGER_OUT is short so words within a single
  // wrapped line clear nearly together — the perceived gap between lines
  // comes from the words *between* line breaks, not the per-word delay.
  // Compress proportionally if the scene's exit window can't fit the full
  // cascade (e.g. very short scene with many words).
  const STAGGER_OUT = 0.06;
  const PER_WORD_OUT = 0.32;
  const SLIDE_LEFT_DISTANCE = 350 * scale;
  const actualExitSec = exitPhase * sceneDuration;
  const idealExitSec = (wordCount - 1) * STAGGER_OUT + PER_WORD_OUT;
  const outScale = Math.min(1, actualExitSec / idealExitSec);
  const stagOutNorm = (STAGGER_OUT * outScale) / sceneDuration;
  const perWordOutNorm = (PER_WORD_OUT * outScale) / sceneDuration;

  const ht = holdT(motionProgress, entrancePhase, exitStart);

  // Active-word focus: previous words dim to ACTIVE_DIM as the next word
  // arrives — reads as a "grey" handoff via opacity reduction, directs
  // attention to the latest word without making prior ones unreadable.
  // Bumped from 0.70 → 0.85: 70% became muddy on busy photo backgrounds
  // (especially mid-tone areas where the dimmed white blends into the bg).
  // 85% keeps the active-word hierarchy while staying legible on media.
  const ACTIVE_DIM = 0.85;

  const perWord = words.map((w, i) => {
    // Entrance window for THIS word
    const wordStart = ENTRANCE_START + i * staggerIn;
    const wordEnd = wordStart + wordEntranceDur;
    const wordRaw = interpolate(progress, [wordStart, wordEnd], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const sp = spring(wordRaw, SPRING_CRISP);
    const yIn = interpolate(sp, [0, 1], [55 * scale, 0]);
    const rotIn = interpolate(sp, [0, 1], [-3, 0]);
    const opacityIn = Math.min(1, wordRaw * 7);

    // Subtle hold breathe (won't even register but keeps each word "alive")
    const yBreathe = breathe(ht, 1 * scale, 1) * Math.cos((i / wordCount) * Math.PI);

    // Dim instantly when the NEXT word starts entering — tiny 50ms ramp so
    // the transition isn't a hard cut, but visually reads as "snaps to grey
    // the moment the new word appears."
    let dimProgress = 0;
    if (i < words.length - 1) {
      const nextStart = ENTRANCE_START + (i + 1) * staggerIn;
      const SNAP_RAMP = 0.02; // ~50ms at 2.5s scene
      dimProgress = interpolate(progress, [nextStart, nextStart + SNAP_RAMP], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
    const focusOpacity = 1 - dimProgress * (1 - ACTIVE_DIM);

    // Per-word exit: each word starts sliding left at exitStart + i*stagOut,
    // accelerates with ease-in-cubic so it feels yanked off-frame.
    const wordExitStart = exitStart + i * stagOutNorm;
    const wordExitEnd = wordExitStart + perWordOutNorm;
    const wordExitRaw = interpolate(motionProgress, [wordExitStart, wordExitEnd], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const wordExitEased = Easing.in(Easing.cubic)(wordExitRaw);
    const exitX = -wordExitEased * SLIDE_LEFT_DISTANCE;
    const isExiting = wordExitRaw > 0;

    // Final composition
    const opacity = opacityIn * focusOpacity * (1 - wordExitEased);
    const y = yIn + (isExiting ? 0 : yBreathe);
    const rot = isExiting ? 0 : rotIn;

    return {
      text: w,
      style: {
        opacity,
        transform: `translate(${exitX}px, ${y}px) rotate(${rot}deg)`,
      },
    };
  });

  return {
    kind: "words",
    words: perWord,
    blockOpacity: 1,
    blockTransform: "none",
  };
}

// ─── slam ──────────────────────────────────────────────────
// In-place impact, NOT a depth/zoom motion (cinematic already owns that
// lane). Word appears at readable size and HITS — drama lives in the
// squash-and-stretch arc:
//   approach pose (vertically stretched, scaleY > 1, scaleX < 1)
//   → impact (violent horizontal pancake, scaleX 1.22 / scaleY 0.74,
//     frame shake + letter crunch firing simultaneously)
//   → rebound (counter-stretched scaleY 1.12 / scaleX 0.94)
//   → damped settle to 1.0
// No vertical translation — the squash arc + camera shake + tilt kick
// carry the impact without any top-to-bottom drop.
function renderSlam(
  progress: number,
  scale: number,
  text: string,
  phases: Phases,
): ArchetypeRender {
  const raw = rawEntrance(progress, phases.entrancePhase);
  const ex = rawExit(progress, phases.exitStart);
  const ht = holdT(progress, phases.entrancePhase, phases.exitStart);

  // Squash-and-stretch arc. Keyframes (raw): 0 = approach pose, 0.30 =
  // impact, 0.45 = rebound, 0.60 = secondary oscillation, 1.0 = rest.
  // scaleX/scaleY are anti-correlated at every keyframe — that's what
  // sells "weight" vs. cinematic's uniform scale collapse.
  const sxIn = interpolate(raw, [0, 0.30, 0.45, 0.60, 1.0], [0.92, 1.22, 0.94, 1.02, 1.0]);
  const syIn = interpolate(raw, [0, 0.30, 0.45, 0.60, 1.0], [1.18, 0.74, 1.12, 0.99, 1.0]);
  // Tilt-and-correct: small entry tilt, levels at impact, micro overshoot.
  const rotIn = interpolate(raw, [0, 0.30, 0.45, 1.0], [-1.5, 0, 0.8, 0]);
  // Transient letter crunch AT impact, releases open by rebound. Distinct
  // from cinematic's wide→tight gradual tracking collapse.
  const lsInEm = interpolate(raw, [0, 0.20, 0.30, 0.45, 1.0], [0, -0.04, -0.06, 0, 0]);

  // Camera shake — full intensity at impact, fast decay over the next 20%
  // of entrance. Sin/cos at offset frequencies feel noisy while staying
  // deterministic for export.
  const shakeWindow = Math.max(0, 1 - Math.max(0, raw - 0.30) / 0.20);
  const shakeX = Math.sin(raw * 70) * 14 * scale * shakeWindow;
  const shakeY = Math.cos(raw * 80) * 10 * scale * shakeWindow;

  // Punchy opacity ramp so text is solid through the size change.
  const opacityIn = Math.min(1, raw * 8);

  // Hold: gentle 0.8% uniform scale breathe.
  const sBreathe = 1 + breathe(ht, 0.008, 1);

  // Exit: ease-in-expo shrink + late-bias fade — decisive leave.
  const easedExit = Easing.in(Easing.exp)(ex);
  const sOut = interpolate(easedExit, [0, 1], [1, 0.85]);
  const opacityOut = interpolate(ex, [0, 0.55, 1], [1, 0.8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const sx = phases.inExit ? sOut : sxIn * sBreathe;
  const sy = phases.inExit ? sOut : syIn * sBreathe;
  const tx = phases.inExit ? 0 : shakeX;
  const ty = phases.inExit ? 0 : shakeY;
  const rot = phases.inExit ? 0 : rotIn;
  const ls = phases.inExit ? 0 : lsInEm;
  const opacity = opacityIn * (phases.inExit ? opacityOut : 1);

  return {
    kind: "block",
    block: {
      opacity,
      transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${sx}, ${sy})`,
      letterSpacing: `${ls}em`,
    },
    text,
  };
}

// ─── cinematic ──────────────────────────────────────────────────
// Hollywood Movie-Trailer FlyIn (vuild-style without filter:blur).
// Entry: ease-out-circ — weighty deceleration, classic cinema arrival.
//        Scale 3.0 → 1.0, tracking +40 → 0 (letters wide-spaced from depth
//        collapse to readable). Slow opacity ramp finishes by progress 0.4
//        so text becomes "real" as it nears the camera plane.
// Hold:  ±0.6px tracking wobble + 1% scale breathe.
// Exit:  ease-in-expo — text holds, then RECEDES into the background.
//        Scale 1.0 → 0.4 (zooms out / shrinks away), tracking spreads back
//        out (0 → +24) like objects dissipating into the distance, opacity
//        holds high then drops late so the recede motion stays visible.
function renderCinematic(
  progress: number,
  scale: number,
  text: string,
  phases: Phases,
): ArchetypeRender {
  const raw = rawEntrance(progress, phases.entrancePhase);
  const ex = rawExit(progress, phases.exitStart);

  // Entry: ease-out-circle — slow start (text far away), strong deceleration into place
  const easedIn = Easing.out(Easing.circle)(raw);
  const sIn = interpolate(easedIn, [0, 1], [3.0, 1]);
  const yIn = interpolate(easedIn, [0, 1], [18 * scale, 0]);
  // Slow opacity ramp — text becomes "real" only as it approaches the camera
  const opacityIn = interpolate(raw, [0, 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // No hold-phase breathing — subpixel rendering on tiny scale changes
  // reads as jitter on stable text. Cinematic holds dead-still during the
  // visible phase.

  // Exit: ease-in-expo — held, then RECEDES into the background
  const easedExit = Easing.in(Easing.exp)(ex);
  const sOut = interpolate(easedExit, [0, 1], [1, 0.4]);
  // Subtle drift back/up to reinforce "going away"
  const yOut = interpolate(easedExit, [0, 1], [0, -10 * scale]);
  // Opacity holds 100% for first 50% of exit, then drops to 0
  const opacityOut = interpolate(ex, [0, 0.5, 1], [1, 0.85, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const s = phases.inExit ? sOut : sIn;
  const y = phases.inExit ? yOut : yIn;
  const opacity = opacityIn * (phases.inExit ? opacityOut : 1);

  // No CSS filter. Earlier iterations layered a ~2.5px gaussian blur at the
  // lifecycle edges for a Hollywood motion-blur feel, but iOS Safari is
  // notoriously bad at compositing `filter` with an animating `transform` —
  // the zoom would stall mid-motion on mobile while desktop and the
  // server-side Puppeteer export rendered fine. The cinematic effect's
  // identity is the scale collapse + slow opacity ramp + ease-out-circ
  // timing, all of which work without the filter. willChange hints both
  // properties are animating so the browser keeps the layer GPU-composited.
  return {
    kind: "block",
    block: {
      opacity,
      transform: `translateY(${y}px) scale(${s})`,
      willChange: "transform, opacity",
    },
    text,
  };
}

// ─── heroWord ───────────────────────────────────────────────────
// One word at a time, each lands with anticipation overshoot. Mid-sequence
// words hand off with brief brightness flash before fade. Final word's exit
// participates in the global exit window — scales up + fades for the finale.
function renderHeroWord(
  progress: number,
  motionProgress: number,
  text: string,
  phases: Phases,
): ArchetypeRender {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return { kind: "hero", word: "", index: 0, total: 0, opacity: 0, transform: "scale(1)" };
  }

  // Words occupy the time between entrance start and exit start.
  const sequenceStart = ENTRANCE_START + phases.entrancePhase * 0.2;
  const sequenceEnd = phases.exitStart;
  const sequenceDur = Math.max(0.01, sequenceEnd - sequenceStart);
  // Determine active word.
  const localProgress = Math.max(0, Math.min(0.999, (progress - sequenceStart) / sequenceDur));
  const idx = Math.min(words.length - 1, Math.floor(localProgress / (1 / words.length)));
  const local = (localProgress * words.length) - idx;
  const isLast = idx === words.length - 1;

  // Per-word entrance: anticipation + spring overshoot
  const ENTER_FRAC = 0.28;
  const HOLD_FRAC = 0.55;
  const HANDOFF_FRAC = 0.85;

  let scale: number;
  let opacity: number;

  if (local < ENTER_FRAC) {
    const entRaw = local / ENTER_FRAC;
    const sp = spring(entRaw, SPRING_CRISP);
    // Overshoot: 0.5 → 1.06 → 1.0
    scale = sp < 0.7 ? interpolate(sp, [0, 0.7], [0.5, 1.06]) : interpolate(sp, [0.7, 1], [1.06, 1.0]);
    opacity = Math.min(1, entRaw * 6);
  } else if (local < HOLD_FRAC) {
    // Hold: 0.5% breathe per word
    const ht = (local - ENTER_FRAC) / (HOLD_FRAC - ENTER_FRAC);
    scale = 1 + breathe(ht, 0.01, 1);
    opacity = 1;
  } else if (local < HANDOFF_FRAC && !isLast) {
    // Brief brightness pulse + fade for handoff to next word
    const handoffRaw = (local - HOLD_FRAC) / (HANDOFF_FRAC - HOLD_FRAC);
    scale = interpolate(handoffRaw, [0, 1], [1, 1.04]);
    // Pulse: 1 → 1.15 (brightness via opacity > 1 is faked by holding 1) → fade
    opacity = handoffRaw < 0.3 ? 1 : interpolate(handoffRaw, [0.3, 1], [1, 0]);
  } else if (!isLast) {
    // Trailing nothing-frame for non-last words
    scale = 1.04;
    opacity = 0;
  } else {
    // Last word: hold until global exit kicks in
    scale = 1;
    opacity = 1;
  }

  // Last word participates in the global exit — simple fast fade with a
  // tiny scale lift. No anticipation, no tracking compression: the goal is
  // to give the WORDS the most time, not the exit animation.
  if (isLast && phases.inExit) {
    const ex = rawExit(motionProgress, phases.exitStart);
    const easedExit = Easing.in(Easing.cubic)(ex);
    scale = interpolate(easedExit, [0, 1], [1, 1.08]);
    opacity = 1 - easedExit;
  }

  return {
    kind: "hero",
    word: words[idx],
    index: idx,
    total: words.length,
    opacity,
    transform: `scale(${scale})`,
  };
}

// ─── Effect duration helpers ────────────────────────────────────
//
// Per-archetype min/max DURATION (seconds) — the time the effect itself
// uses, not the scene length. On long scenes the effect runs at most for
// `maxDuration` and then disappears, signaling the AI to fill the rest
// with another effect.
//
//  - minDurationFor(archetype, text): minimum effect duration accounting
//    for text length (text-dependent archetypes scale up).
//  - effectiveDuration(archetype, text, sceneDuration): how long the
//    effect actually runs in the given scene — bounded by [minFor, max].
//  - canFit(items, sceneSeconds): whether a sequence of (archetype, text)
//    plays fits within a scene.

const TYPEWRITER_SEC_PER_CHAR = 0.08; // matches the linear char reveal pace
const HEROWORD_PER_WORD_SLOT = 0.6; // each word in heroWord needs ~0.6s on screen
const WORDSTAGGER_MIN_HOLD = 0.5; // matches renderWordStagger's minHold

/**
 * Compute the minimum DURATION (seconds) the effect needs for this text.
 * Text-dependent archetypes scale up; others return their static
 * spec.minDuration.
 */
export function minDurationFor(archetype: TextArchetype, text: string): number {
  const spec = ARCHETYPE_SPECS[archetype];
  const wordCount = Math.max(1, text.split(/\s+/).filter(Boolean).length);

  switch (archetype) {
    case "typewriter": {
      const revealSec = Math.max(0.6, text.length * TYPEWRITER_SEC_PER_CHAR);
      return revealSec + 0.3 + spec.exit;
    }
    case "wordStagger": {
      return (wordCount - 1) * 0.28 + 0.5 + WORDSTAGGER_MIN_HOLD + spec.exit;
    }
    case "heroWord": {
      return wordCount * HEROWORD_PER_WORD_SLOT + spec.exit;
    }
    default:
      return spec.minDuration;
  }
}

/**
 * How long the effect actually runs inside a given scene. The effect uses
 * at most spec.maxDuration; if the scene is shorter than that, it uses
 * the scene length; if the text needs more (long typewriter, many words),
 * the minimum wins.
 *
 * On long scenes, sceneDuration > effectiveDuration(...) means the AI
 * has remaining time to fill with another effect.
 */
export function effectiveDuration(
  archetype: TextArchetype,
  text: string,
  sceneDuration: number,
): number {
  const spec = ARCHETYPE_SPECS[archetype];
  const minFor = minDurationFor(archetype, text);
  const cappedMax = Math.max(spec.maxDuration, minFor);
  return Math.min(sceneDuration, cappedMax);
}

export interface ArchetypePlay {
  archetype: TextArchetype;
  text: string;
}

/**
 * Whether a sequence of archetype plays fits in the given scene duration.
 * Used by the AI/tool layer to validate before committing to a plan.
 *
 * @example
 *   canFit(
 *     [
 *       { archetype: "subtle", text: "Hi" },
 *       { archetype: "heroWord", text: "Launch" },
 *     ],
 *     4.0,
 *   ); // → true if both fit; false otherwise
 */
export function canFit(items: ArchetypePlay[], sceneSeconds: number): boolean {
  const total = items.reduce(
    (sum, item) => sum + minDurationFor(item.archetype, item.text),
    0,
  );
  return total <= sceneSeconds;
}

/**
 * Total minimum seconds for a sequence — useful when canFit returns false
 * and you need to know how much time is missing.
 */
export function totalMinDurationFor(items: ArchetypePlay[]): number {
  return items.reduce(
    (sum, item) => sum + minDurationFor(item.archetype, item.text),
    0,
  );
}
