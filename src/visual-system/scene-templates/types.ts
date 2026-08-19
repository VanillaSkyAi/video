/**
 * Scene template types.
 *
 * A template is a reusable React component that defines how a scene looks.
 * It declares the variables an editor or model may provide
 * and receives universal settings as props.
 *
 * Templates are searchable by AI via description, category, jobs, register,
 * and useWhen guidance.
 * The variable schema enables any LLM to fill in template variables via JSON.
 */

import type { ResolvedTokens } from "../theme";
import type { SafeZone, TemplateStyle } from "../template-context";

/**
 * Props passed to every scene template component.
 *
 * All animation must be driven by `progress` (0→1). No CSS animations,
 * no Framer Motion, no requestAnimationFrame. Use interpolate/spring
 * from animation-utils.ts.
 *
 * Scale factor: use `Math.min(width, height) / 1080` — normalizes to
 * the short edge so visuals are consistent across portrait and landscape.
 */
export interface SceneTemplateProps {
  variables: Record<string, unknown>;
  style: TemplateStyle;
  /** 0→1 through the scene's duration */
  progress: number;
  /** Presentation clock. Active templates receive the same complete 0→1 timeline as progress. */
  motionProgress?: number;
  /** 0→1 beat pulse intensity */
  beatIntensity: number;
  /** 1080 (portrait) or 1920 (landscape) */
  width: number;
  /** 1920 (portrait) or 1080 (landscape) */
  height: number;
  /** Video-level default text effect (for templates that opt in via usesGlobalTextEffect) */
  textArchetype?: string;
  /** How text leaves the scene (fade / shrink / pop / blur-scale). Falls back to a sensible default per textArchetype when undefined. */
  /** Video-level default background effect (for templates that opt in via usesGlobalBackgroundEffect) */
  backgroundEffect?: string;
  /** Platform-aware safe zone insets in pixels — use for text placement */
  safeZone: SafeZone;
  /** Scene duration in seconds — use for time-based (not progress-based) animations */
  sceneDuration?: number;
  /**
   * Brand tokens already resolved from `style`. Built-in templates import
   * resolveTokens directly; an ejected `custom_*` scene can't import anything,
   * so without this it has no way to reach the same values and ends up
   * hardcoding white, black and shadows — the body then looks generic next to
   * a frame that IS using the brand.
   */
  tokens?: ResolvedTokens;
  /**
   * True when the preview player is actively advancing progress; false when paused.
   * Templates that play HTML5 <video> elements should pause them when this is false.
   * Undefined (export capture path) is treated as true.
   */
  isPlaying?: boolean;
}
