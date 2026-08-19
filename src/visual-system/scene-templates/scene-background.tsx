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
 *     covers the gradient. Vignette + bottom-half darken give the content
 *     contrast against busy footage.
 *   - mediaType="gradient" deliberately ignores mediaUrl and renders only
 *     the brand gradient. First-class atmospheric mode.
 *   - When mediaUrl is empty / 404s / Pexels search returned nothing,
 *     gradient shows through cleanly (matches every other gradient-backed
 *     template).
 *
 * Extracted from bg-media.tsx so any template can compose it. bg-media
 * now uses this component too — its "media is the scene" identity comes
 * from how it positions the title (centered, full-frame), not from
 * duplicated render logic.
 */

import React, { useEffect, useRef } from "react";
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
  id: "vignette" | "full-wash" | "center-scrim" | "bottom-scrim";
  background: string;
  style?: React.CSSProperties;
}

/** Export-safe contrast recipes. Overlays only: SVG capture cannot rely on CSS filters. */
export function getMediaTreatmentLayers(value: string): MediaTreatmentLayer[] {
  const treatment = resolveMediaTreatment(value);
  const vignette: MediaTreatmentLayer = {
    id: "vignette",
    background:
      treatment === "subtle"
        ? "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.28) 100%)"
        : "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 80%, rgba(0,0,0,0.75) 100%)",
  };
  if (treatment === "subtle") return [vignette];

  const cinematic: MediaTreatmentLayer[] = [
    vignette,
    {
      id: "center-scrim",
      background:
        treatment === "text-safe"
          ? "radial-gradient(ellipse 90% 56% at 50% 50%, rgba(0,0,0,0.36) 0%, rgba(0,0,0,0.18) 55%, transparent 84%)"
          : "radial-gradient(ellipse 85% 50% at 50% 50%, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.10) 50%, transparent 80%)",
    },
    {
      id: "bottom-scrim",
      background:
        treatment === "text-safe"
          ? "linear-gradient(to top, rgba(0,0,0,0.68) 0%, transparent 100%)"
          : "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)",
      style: { top: "55%" },
    },
  ];

  if (treatment === "text-safe") {
    cinematic.splice(1, 0, {
      id: "full-wash",
      background: "rgba(0,0,0,0.30)",
    });
  }
  return cinematic;
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
  backgroundEffect,
  seed,
  isPlaying = true,
  beatIntensity = 0,
}) => {
  void _width;
  void _height;
  const resolved = resolveMediaType(mediaType, mediaUrl);
  const showMedia = resolved !== "gradient" && !!mediaUrl;
  const resolvedPosition = resolveMediaPosition(mediaPosition);
  const resolvedTreatment = resolveMediaTreatment(mediaTreatment);
  const treatmentLayers = getMediaTreatmentLayers(resolvedTreatment);

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
