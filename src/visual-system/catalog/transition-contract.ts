import type { SceneTemplateMetadata, TemplateTransitionTiming } from "./catalog-types.js";

const TRANSITION_TIMING_KEYS = new Set(["entryReadyProgress", "holdProgress"]);

export function assertTemplateTransitionMetadata(
  template: Pick<SceneTemplateMetadata, "id" | "usesGlobalTransition" | "transitionTiming">,
): void {
  const timing = template.transitionTiming;
  if (!template.usesGlobalTransition) {
    if (timing !== undefined) {
      throw new Error(`${template.id}.transitionTiming requires usesGlobalTransition: true`);
    }
    return;
  }
  if (!timing || typeof timing !== "object" || Array.isArray(timing)) {
    throw new Error(`${template.id}.transitionTiming is required when usesGlobalTransition is true`);
  }
  for (const key of Object.keys(timing)) {
    if (!TRANSITION_TIMING_KEYS.has(key)) throw new Error(`${template.id}.transitionTiming.${key} is not supported`);
  }
  const { entryReadyProgress, holdProgress } = timing as TemplateTransitionTiming;
  if (
    !Number.isFinite(entryReadyProgress) ||
    !Number.isFinite(holdProgress) ||
    entryReadyProgress < 0 ||
    holdProgress > 1 ||
    entryReadyProgress >= holdProgress
  ) {
    throw new Error(
      `${template.id}.transitionTiming must satisfy 0 <= entryReadyProgress < holdProgress <= 1`,
    );
  }
}
