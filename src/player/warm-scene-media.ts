/**
 * Loads the backdrop preloader on demand.
 *
 * Warming media is background work — nothing on screen waits for it — so it
 * has no business in the bundle a consumer pays for before first paint. The
 * chunk is fetched the first time a scene with a backdrop appears, still far
 * ahead of that scene playing. Same treatment as control-visibility.
 *
 * A chunk that fails to load costs nothing: SceneBackground's paint gate
 * already handles a cold backdrop by showing the plain brand gradient.
 */
export function warmSceneMedia(variables: Record<string, unknown>): void {
  void import("./preload-media.js")
    .then((module) => module.preloadSceneMedia(variables))
    .catch(() => {});
}
