/**
 * SceneBackground — shared backdrop component for any scene template that
 * wants to support both a brand-color gradient and stock media (Pexels
 * photo / video) as an alternate atmosphere.
 *
 * Usage:
 *   <SceneBackground
 *     style={style}
 *     progress={progress}
 *     sceneDuration={sceneDuration}
 *     width={width}
 *     height={height}
 *     mediaUrl={String(variables.mediaUrl || "")}
 *     mediaType={String(variables.mediaType || "auto")}
 *     seed={String(variables.texts || "")}
 *     isPlaying={isPlaying}
 *   />
 *   ... template's content layered on top
 *
 * Behavior:
 *   - Brand gradient is the always-on backdrop (uses BrandGradientOverlay).
 *   - When mediaUrl is set and mediaType isn't "gradient", the photo/video
 *     covers the gradient. Legibility is then split between two instruments:
 *     eased scrims shaped to where the template's copy sits (`textAnchor`),
 *     and a per-glyph halo on the type itself (MEDIA_TEXT_SHADOW). Neither
 *     alone can hold white type over a blown-out highlight without flattening
 *     the picture; together they do it at roughly half the darkening.
 *   - mediaType="gradient" deliberately ignores mediaUrl and renders only
 *     the brand gradient. First-class atmospheric mode.
 *   - When mediaUrl is empty, 404s, is blocked, or Pexels search returned
 *     nothing, the gradient shows through cleanly and no scrim is painted —
 *     a scrim over a bare gradient is just a muddy gradient. Enforced, not
 *     assumed: the media has to load before anything darkens for it.
 *
 * Extracted from bg-media.tsx so any template can compose it. bg-media
 * now uses this component too — its "media is the scene" identity comes
 * from how it positions the title (centered, full-frame), not from
 * duplicated render logic.
 */

import React, { useEffect, useRef, useState } from "react";
import type { TemplateStyle } from "../template-context";
import { BrandGradientOverlay } from "../backgrounds";
import { getBackgroundTransform } from "../backgrounds";

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v", ".avi"];

function isVideoUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    const lower = url.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }
}

export type ResolvedMediaType = "photo" | "video" | "gradient";

export type MediaPosition = "center" | "top" | "bottom" | "left" | "right";
export type MediaTreatment = "subtle" | "cinematic" | "text-safe";

const MEDIA_POSITIONS: Record<MediaPosition, string> = {
  center: "center center",
  top: "center top",
  bottom: "center bottom",
  left: "left center",
  right: "right center",
};

export function resolveMediaPosition(value: string): string {
  return MEDIA_POSITIONS[value as MediaPosition] ?? MEDIA_POSITIONS.center;
}

export function resolveMediaTreatment(value: string): MediaTreatment {
  return value === "subtle" || value === "text-safe" ? value : "cinematic";
}

export interface MediaTreatmentLayer {
  id: "vignette" | "center-scrim" | "bottom-scrim";
  background: string;
  style?: React.CSSProperties;
}

/**
 * Where the template puts its type. The scrim is shaped to the copy, not to
 * the frame: darkening picture the type never touches costs contrast in the
 * photo and buys no legibility. "full" is the conservative default for
 * templates that have not declared an anchor.
 */
export type MediaTextAnchor = "center" | "bottom" | "full";

/**
 * Smoothstep-sampled alpha stops between `start`% and `end`% of the gradient
 * box, held at full strength before `start` and after `end`.
 *
 * A two-stop `rgba(0,0,0,a) → transparent` scrim ramps alpha linearly, so it
 * ends with a constant slope. Lateral inhibition in the eye amplifies that
 * slope discontinuity into a visible band — the grey bar cutting across the
 * frame that makes an overlay read as an overlay. Smoothstep flattens the
 * curve at both ends, so the scrim holds where the type sits and then leaves
 * without an edge: the same peak coverage over the copy, noticeably less of
 * the picture spent getting there.
 */
const SCRIM_STOP_COUNT = 7;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function easedStops(
  peakAlpha: number,
  start: number,
  end: number,
  direction: "fade-out" | "fade-in",
): string {
  const alphaAt = (t: number): string => {
    const eased = direction === "fade-out" ? 1 - smoothstep(t) : smoothstep(t);
    return `rgba(0,0,0,${Number((peakAlpha * eased).toFixed(3))})`;
  };
  const stops: string[] = [];
  if (start > 0) stops.push(`${alphaAt(0)} 0%`);
  for (let i = 0; i < SCRIM_STOP_COUNT; i += 1) {
    const t = i / (SCRIM_STOP_COUNT - 1);
    const position = Number((start + (end - start) * t).toFixed(2));
    stops.push(`${alphaAt(t)} ${position}%`);
  }
  if (end < 100) stops.push(`${alphaAt(1)} 100%`);
  return stops.join(", ");
}

/**
 * Export-safe contrast recipes. Overlays only: SVG capture cannot rely on CSS
 * filters, so a blur-behind-text plate is off the table.
 *
 * The scrims deliberately stop short of solving legibility on their own. A
 * uniform darkening strong enough to carry white type over a blown-out sky
 * needs roughly 0.8 alpha — at that point the photo is a texture, not a
 * picture. The cheaper half of the job belongs to the type: a per-glyph halo
 * (MEDIA_TEXT_SHADOW) buys local contrast exactly where it is needed and
 * costs the image nothing. Scrim for the plate, halo for the glyph.
 */
export function getMediaTreatmentLayers(
  value: string,
  anchor: MediaTextAnchor = "full",
): MediaTreatmentLayer[] {
  const treatment = resolveMediaTreatment(value);
  const vignette: MediaTreatmentLayer = {
    id: "vignette",
    background:
      treatment === "subtle"
        ? `radial-gradient(ellipse at center, ${easedStops(0.28, 45, 100, "fade-in")})`
        : `radial-gradient(ellipse at center, ${easedStops(0.72, 32, 100, "fade-in")})`,
  };
  if (treatment === "subtle") return [vignette];

  const textSafe = treatment === "text-safe";
  const layers: MediaTreatmentLayer[] = [vignette];

  if (anchor !== "bottom") {
    layers.push({
      id: "center-scrim",
      background: textSafe
        ? `radial-gradient(ellipse 92% 58% at 50% 50%, ${easedStops(0.46, 34, 90, "fade-out")})`
        : `radial-gradient(ellipse 88% 52% at 50% 50%, ${easedStops(0.26, 30, 88, "fade-out")})`,
    });
  }

  if (anchor !== "center") {
    layers.push({
      id: "bottom-scrim",
      background: `linear-gradient(to top, ${easedStops(textSafe ? 0.64 : 0.5, 8, 100, "fade-out")})`,
      style: { top: "55%" },
    });
  }

  return layers;
}

export function resolveMediaType(
  mediaType: string,
  mediaUrl: string,
): ResolvedMediaType {
  if (mediaType === "gradient") return "gradient";
  if (mediaType === "video") return "video";
  if (mediaType === "photo") return "photo";
  // "auto" — detect from URL extension
  return mediaUrl && isVideoUrl(mediaUrl) ? "video" : "photo";
}

/**
 * True when the scene actually renders a photo or video backdrop — i.e. a
 * mediaUrl is set and the template has not been pinned to the brand gradient.
 * Templates use it to switch their type onto the media legibility recipe.
 */
export function hasSceneMedia(variables: Record<string, unknown>): boolean {
  return (
    String(variables.mediaUrl || "").trim() !== "" &&
    String(variables.mediaType || "auto") !== "gradient"
  );
}

export function getMediaBackgroundProps(variables: Record<string, unknown>) {
  return {
    mediaUrl: String(variables.mediaUrl || ""),
    mediaType: String(variables.mediaType || "auto"),
    mediaPoster: String(variables.mediaPoster || ""),
    mediaPosition: String(variables.mediaPosition || "center"),
    mediaTreatment: String(variables.mediaTreatment || "cinematic"),
  };
}

export interface SceneBackgroundProps {
  style: TemplateStyle;
  progress: number;
  sceneDuration?: number;
  width: number;
  height: number;
  mediaUrl?: string;
  mediaType?: string;
  /** Still image URL shown while the <video> backdrop decodes its first
   *  frame. Without it the element renders transparent during the
   *  ~50–400ms decode window and the gradient flashes through. */
  mediaPoster?: string;
  /** Cover-crop focal anchor. Keeps the important edge/subject visible. */
  mediaPosition?: string;
  /** Overlay recipe: subtle, cinematic, or stronger text-safe contrast. */
  mediaTreatment?: string;
  /** Where this template's copy sits, so the scrim is shaped to the type
   *  instead of to the frame. Defaults to "full" (scrim both the middle and
   *  the lower third) for templates that have not declared an anchor. */
  textAnchor?: MediaTextAnchor;
  /** Background motion effect (drift / pulse / Ken Burns). Applied to the photo/video. */
  backgroundEffect?: string;
  /** Stable seed for the gradient breathing animation. Pass the scene's
   *  text content (or any stable string) — it's hashed deterministically. */
  seed?: number | string;
  /** Pause video when preview is paused. Defaults to true (export path). */
  isPlaying?: boolean;
  beatIntensity?: number;
}

export const SceneBackground: React.FC<SceneBackgroundProps> = ({
  style,
  progress,
  sceneDuration,
  width: _width, // accepted for symmetry; not currently used in render
  height: _height,
  mediaUrl = "",
  mediaType = "auto",
  mediaPoster,
  mediaPosition = "center",
  mediaTreatment = "cinematic",
  textAnchor = "full",
  backgroundEffect,
  seed,
  isPlaying = true,
  beatIntensity = 0,
}) => {
  void _width;
  void _height;
  const resolved = resolveMediaType(mediaType, mediaUrl);
  const wantsMedia = resolved !== "gradient" && !!mediaUrl;

  // A scrim exists to hold type against footage. When the footage never
  // arrives — dead URL, blocked host, empty stock search — the scrim is left
  // darkening the brand gradient it was never meant to touch, and the scene
  // reads as a muddy, vignetted version of the gradient scenes next to it.
  // So the media has to prove it painted before anything darkens for it.
  //
  // Optimistic default: static and export renders never run effects, so they
  // keep today's output byte for byte. Only a browser that observes a real
  // failure drops back to the clean gradient.
  const [mediaFailed, setMediaFailed] = useState(false);
  useEffect(() => {
    setMediaFailed(false);
    if (!wantsMedia || resolved !== "photo") return;
    if (typeof Image === "undefined") return;
    let cancelled = false;
    const probe = new Image();
    probe.onerror = () => {
      if (!cancelled) setMediaFailed(true);
    };
    probe.src = mediaUrl;
    return () => {
      cancelled = true;
      probe.onerror = null;
    };
  }, [mediaUrl, resolved, wantsMedia]);

  const showMedia = wantsMedia && !mediaFailed;
  const resolvedPosition = resolveMediaPosition(mediaPosition);
  const resolvedTreatment = resolveMediaTreatment(mediaTreatment);
  const treatmentLayers = getMediaTreatmentLayers(resolvedTreatment, textAnchor);

  const gradSeed =
    typeof seed === "number"
      ? seed
      : typeof seed === "string"
        ? seed.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
        : 0;

  const bgTransform = getBackgroundTransform(
    backgroundEffect,
    progress,
    beatIntensity,
  );

  // Video playback control — same pause/seek logic bg-media used pre-extract.
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastProgress = useRef(progress);
  const videoStarted = useRef(false);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (!isPlaying) {
      vid.pause();
      videoStarted.current = false;
      return;
    }
    const progressChanged = Math.abs(progress - lastProgress.current) > 0.001;
    lastProgress.current = progress;
    if (progressChanged && !videoStarted.current) {
      vid.playbackRate = 1;
      vid.currentTime = 0;
      vid.play().catch(() => {});
      videoStarted.current = true;
    } else if (!progressChanged && videoStarted.current) {
      vid.pause();
      videoStarted.current = false;
    }
  }, [progress, isPlaying]);

  // Release the decoder on unmount. Without this, iOS Safari keeps the
  // video's decoder buffer alive after the React node is gone — each
  // scene transition (or play/pause/play cycle that remounts the active
  // scene) leaks one decoder, eventually crossing the renderer's memory
  // ceiling and triggering "A problem repeatedly occurred." Same recipe
  // as #409's CanvasPreview preload cleanup: pause → clear src → load().
  // Capture the ref at mount-time so the cleanup uses the same node we
  // mounted (the ref's .current is stale by unmount).
  useEffect(() => {
    const vid = videoRef.current;
    return () => {
      if (!vid) return;
      vid.pause();
      vid.removeAttribute("src");
      vid.load();
    };
  }, []);

  return (
    <>
      <BrandGradientOverlay
        style={style}
        progress={progress}
        sceneDuration={sceneDuration}
        seed={gradSeed}
      />

      {showMedia &&
        (resolved === "video" ? (
          <video
            ref={videoRef}
            src={mediaUrl}
            // Poster paints during the decode window so the user sees the
            // (still) first frame instead of a transparent <video> letting
            // the brand gradient show through. Pexels returns a thumbnail
            // image alongside each video; fillPexelsUrls stores it in
            // `variables.mediaPoster`. Layered defense alongside preload="auto"
            // below: on desktop the byte preloader makes decode fast, on
            // mobile (where the preloader skips video pre-mounting to dodge
            // the iOS Safari memory crash) the poster is the primary shield.
            poster={mediaPoster || undefined}
            muted
            loop
            playsInline
            // preload="auto" — without it, browsers default to "metadata":
            // they only load the container/dimensions, not the byte stream
            // needed to decode frames. The element then renders transparent
            // until the first decoded frame arrives, letting the brand
            // gradient flash through whenever a scene mid-playback transitions
            // to a media backdrop. The parent preloader caches the bytes, but
            // decoder state is per-element, so the active mount still has to
            // decode the first frame; "auto" kicks that work off the instant
            // the element mounts.
            preload="auto"
            onError={() => setMediaFailed(true)}
            data-media-position={mediaPosition}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: resolvedPosition,
              transform: bgTransform.transform,
              transformOrigin: bgTransform.transformOrigin,
            }}
          />
        ) : (
          <div
            data-media-position={mediaPosition}
            style={{
              position: "absolute",
              inset: 0,
              transform: bgTransform.transform,
              transformOrigin: bgTransform.transformOrigin,
              backgroundImage: `url(${mediaUrl})`,
              backgroundSize: "cover",
              backgroundPosition: resolvedPosition,
            }}
          />
        ))}

      {showMedia &&
        treatmentLayers.map((layer) => (
          <div
            key={layer.id}
            data-media-treatment={resolvedTreatment}
            data-media-overlay={layer.id}
            style={{
              position: "absolute",
              inset: 0,
              background: layer.background,
              pointerEvents: "none",
              ...layer.style,
            }}
          />
        ))}
    </>
  );
};
