/**
 * Warms a scene's backdrop bytes before the scene is on screen.
 *
 * SceneBackground holds its scrim back until the media actually paints, so a
 * cold backdrop degrades to a clean brand gradient rather than a muddy one.
 * That is the safety net. This is the part that keeps the net from being
 * needed: by the time the scene mounts the image is usually in the browser
 * cache, decodes synchronously, and the first frame is already the picture.
 *
 * Videos are deliberately not fetched here. Their poster is, which is what
 * paints the first frame; pre-mounting or pre-buffering video streams is the
 * recipe that leaks decoder buffers on iOS Safari (see SceneBackground's
 * unmount cleanup for the same hazard).
 */
import { resolveMediaType } from "../visual-system/scene-templates/media-source.js";

/** URLs already warmed this session. Preloading twice costs a request. */
const warmed = new Set<string>();

function warm(url: string): void {
  const trimmed = url.trim();
  if (!trimmed || warmed.has(trimmed)) return;
  warmed.add(trimmed);
  const image = new Image();
  // Failures are the scene's problem, not the preloader's — it falls back to
  // the gradient on its own. Swallow here so an unhandled error never
  // surfaces from a background warm.
  image.onerror = () => {};
  image.src = trimmed;
}

/**
 * Preload whatever will paint this scene's backdrop first. Safe to call for
 * every scene, repeatedly, and on any template: scenes without media do
 * nothing.
 */
export function preloadSceneMedia(variables: Record<string, unknown>): void {
  if (typeof window === "undefined" || typeof Image === "undefined") return;

  const mediaUrl = String(variables.mediaUrl || "").trim();
  if (!mediaUrl) return;

  const resolved = resolveMediaType(String(variables.mediaType || "auto"), mediaUrl);
  if (resolved === "gradient") return;

  if (resolved === "video") {
    warm(String(variables.mediaPoster || ""));
    return;
  }
  warm(mediaUrl);
}
