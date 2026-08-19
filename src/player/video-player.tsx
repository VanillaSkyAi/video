import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { VideoEvent } from "../protocol/events.js";
import type { Video, VideoOrientation } from "../protocol/types.js";
import {
  applyVideoEvent,
  createVideoState,
  type VideoState,
} from "../protocol/state.js";
import { getDimensions } from "../visual-system/layout.js";
import { fontStack } from "../visual-system/scene-templates/tokens.js";
import { VideoFrame } from "./video-frame.js";
import { getVideoDuration, resolveVideoTimeline } from "../protocol/timeline.js";
import { parseVideo } from "../protocol/persistence.js";
import { overlayTemplateRegistry, type TemplateRegistry } from "../visual-system/catalog/kit.js";
import { BUILTIN_TEMPLATE_KIT, preloadBuiltinTemplate } from "../visual-system/catalog/builtin.js";

interface VideoPlayerRuntimeProps {
  kit: TemplateRegistry;
  stream?: AsyncIterable<VideoEvent>;
  video?: Video;
  /** Initial playback state. Reduced-motion preferences take precedence. */
  autoPlay?: boolean;
  startMuted?: boolean;
  /** Fixed display width. Omit to observe and fill the parent width. */
  width?: number;
  /** Override the streamed orientation, or switch at the container breakpoint. */
  orientation?: VideoOrientation | "auto";
  /** Container width at or below which auto orientation uses portrait. */
  responsiveBreakpoint?: number;
  className?: string;
  style?: CSSProperties;
  /** Accessible name for the player region. */
  ariaLabel?: string;
  onComplete?: (state: VideoState) => void;
  onError?: (error: Error, state: VideoState) => void;
  onStateChange?: (state: VideoState) => void;
}

interface VideoPlayerSharedProps {
  /** Initial playback state. Reduced-motion preferences take precedence. */
  autoPlay?: boolean;
  startMuted?: boolean;
  /** Fixed display width. Omit to observe and fill the parent width. */
  width?: number;
  /** Override the streamed orientation, or switch at the container breakpoint. */
  orientation?: VideoOrientation | "auto";
  /** Container width at or below which auto orientation uses portrait. */
  responsiveBreakpoint?: number;
  className?: string;
  style?: CSSProperties;
  /** Accessible name for the player region. */
  ariaLabel?: string;
  onComplete?: (video: Video) => void;
  onError?: (error: Error) => void;
}

export type VideoPlayerProps = VideoPlayerSharedProps & (
  | { video: Video; stream?: never; templates?: TemplateRegistry }
  | { stream?: AsyncIterable<VideoEvent>; video?: never; templates: TemplateRegistry }
);

function savedVideoState(video: Video): VideoState {
  return {
    ...createVideoState(),
    status: "complete",
    config: video,
  };
}

export function VideoPlayerRuntime({
  kit,
  stream,
  video,
  autoPlay = true,
  startMuted = true,
  width,
  orientation: orientationOverride,
  responsiveBreakpoint = 520,
  className,
  style,
  ariaLabel = "Video response",
  onComplete,
  onError,
  onStateChange,
}: VideoPlayerRuntimeProps): ReactElement {
  const [reducedMotion] = useState(() =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [isPlaying, setIsPlaying] = useState(() => autoPlay && !reducedMotion);
  const [isMuted, setIsMuted] = useState(startMuted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [state, setState] = useState<VideoState>(() => video ? savedVideoState(video) : createVideoState());
  const [currentTime, setCurrentTime] = useState(0);
  const [observedWidth, setObservedWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const timeRef = useRef(currentTime);
  const audioRef = useRef<HTMLAudioElement>(null);
  const callbacksRef = useRef({ onComplete, onError, onStateChange });

  stateRef.current = state;
  timeRef.current = currentTime;
  callbacksRef.current = { onComplete, onError, onStateChange };

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) setIsPlaying(false);
    };
    preference.addEventListener?.("change", handleChange);
    return () => preference.removeEventListener?.("change", handleChange);
  }, []);

  useEffect(() => setIsMuted(startMuted), [startMuted]);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let started = false;
    const reset = video ? savedVideoState(video) : createVideoState();
    stateRef.current = reset;
    timeRef.current = 0;
    setState(reset);
    setCurrentTime(0);

    if (video) {
      for (const scene of video.scenes) preloadBuiltinTemplate(scene.templateId);
      return;
    }
    if (!stream) return;

    const consume = async () => {
      try {
        for await (const event of stream) {
          if (cancelled) return;
          const current = stateRef.current;
          const mutableSceneIds = new Set(
            current.config
              ? resolveVideoTimeline(current.config)
                  .filter((range) => range.end > timeRef.current + 0.001)
                  .map((range) => range.scene.id)
              : [],
          );
          const next = applyVideoEvent(current, event, {
            ...(current.config ? { mutableSceneIds } : {}),
          });
          stateRef.current = next;
          setState(next);
          callbacksRef.current.onStateChange?.(next);
          if (next.status === "complete" && current.status !== "complete") {
            callbacksRef.current.onComplete?.(next);
          } else if (next.status === "error" && current.status !== "error") {
            callbacksRef.current.onError?.(new Error("Video response could not finish"), next);
          }
        }
      } catch {
        if (!cancelled) {
          callbacksRef.current.onError?.(new Error("Video playback stream failed"), stateRef.current);
        }
      }
    };

    queueMicrotask(() => {
      if (cancelled) return;
      started = true;
      void consume();
    });
    return () => {
      cancelled = true;
      if (started) {
        (stream as AsyncIterable<VideoEvent> & { cancel?: () => void }).cancel?.();
      }
    };
  }, [stream, video]);

  useEffect(() => {
    if (width != null) return;
    const container = containerRef.current;
    if (!container) return;
    const update = () => setObservedWidth(container.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [width]);

  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const current = stateRef.current;
      const config = current.config;
      const delta = Math.max(0, (now - previous) / 1000);
      previous = now;
      if (config?.scenes.length) {
        const duration = getVideoDuration(config);
        const nextTime = Math.min(timeRef.current + delta, duration);
        if (nextTime !== timeRef.current) {
          timeRef.current = nextTime;
          setCurrentTime(nextTime);
        }
        const audio = audioRef.current;
        if (audio && (current.status === "complete" || current.status === "error")) {
          const fadeSeconds = Math.max(0, (config.audio?.fadeOutMs ?? 3000) / 1000);
          const remaining = Math.max(0, duration - nextTime);
          const baseVolume = config.audio?.volume ?? 1;
          audio.volume = fadeSeconds > 0
            ? baseVolume * Math.min(1, remaining / fadeSeconds)
            : baseVolume;
          if (remaining <= 0) audio.pause();
        }
      }
      const terminal = current.status === "complete" || current.status === "error" || current.status === "aborted";
      const duration = current.config ? getVideoDuration(current.config) : 0;
      if (!terminal || timeRef.current < duration) frame = requestAnimationFrame(tick);
      else setIsPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = state.config?.audio?.volume ?? 1;
  }, [state.config?.audio?.audioUrl, state.config?.audio?.volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      void audio.play().catch(() => {
        // Do not let visuals silently run ahead when a browser blocks audible
        // autoplay. Pause so the visible play control can provide the required
        // user gesture and restart audio and motion together.
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, state.config?.audio?.audioUrl]);

  const streamOrientation = state.config?.orientation ?? "portrait";
  const responsiveWidth = width ?? observedWidth;
  const orientation = orientationOverride === "auto"
    ? responsiveWidth > 0
      ? responsiveWidth <= responsiveBreakpoint ? "portrait" : "landscape"
      : streamOrientation
    : orientationOverride ?? streamOrientation;
  const dimensions = getDimensions(orientation);
  const displayWidth = (width ?? observedWidth) || dimensions.width;
  const displayHeight = displayWidth * dimensions.height / dimensions.width;
  const scale = displayWidth / dimensions.width;
  const config = state.config;
  const displayConfig = config && config.orientation !== orientation
    ? { ...config, orientation }
    : config;
  const duration = config ? getVideoDuration(config) : 0;
  const terminal = state.status === "complete" || state.status === "error" || state.status === "aborted";
  const ended = terminal && duration > 0 && currentTime >= duration - 0.001;
  const togglePlayback = () => {
    if (!isPlaying && ended) {
      timeRef.current = 0;
      setCurrentTime(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
      setIsPlaying(true);
      return;
    }
    setIsPlaying((playing) => !playing);
  };
  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement === container) await document.exitFullscreen?.();
    else await container.requestFullscreen?.();
  };
  const controlButtonStyle: CSSProperties = {
    display: "inline-grid",
    placeItems: "center",
    flex: "0 0 auto",
    minWidth: 44,
    minHeight: 44,
    padding: "6px 9px",
    border: 0,
    borderRadius: 8,
    backgroundColor: "rgba(9, 7, 18, 0.88)",
    color: "#ffffff",
    font: "600 13px/1 system-ui, sans-serif",
    cursor: "pointer",
  };
  const generationCoverVisible = state.status === "streaming" && !config?.scenes.length;
  const coverBackground = config?.style.brand.background;
  const coverText = config?.style.brand.colors.foreground ?? "#ffffff";
  const coverBackgroundCss = coverBackground?.type === "solid"
    ? coverBackground.color
    : `linear-gradient(135deg, ${coverBackground?.colors[0] ?? "#8711C1"}, ${coverBackground?.colors[1] ?? "#2167E3"})`;

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === " " || event.key === "Enter")) {
          event.preventDefault();
          togglePlayback();
        }
      }}
      data-testid="video-player"
      data-status={state.status}
      data-finish-reason={state.finishReason}
      data-scenes={config?.scenes.length ?? 0}
      data-orientation={orientation}
      data-current-time={currentTime.toFixed(3)}
      data-playing={isPlaying}
      data-ended={ended}
      className={className}
      style={{
        width: width ?? "100%",
        height: displayHeight,
        position: "relative",
        overflow: "hidden",
        background: "#090712",
        ...style,
      }}
    >
      {generationCoverVisible ? (
        <div
          data-testid="video-generation-cover"
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            padding: "12%",
            textAlign: "center",
            color: coverText,
            background: coverBackgroundCss,
            fontFamily: fontStack(config?.style.brand.font),
          }}
        >
          <div>
            <div aria-hidden="true" style={{ fontSize: "clamp(28px, 8vw, 72px)", opacity: 0.9 }}>✦</div>
            <strong style={{ display: "block", marginTop: 18, fontSize: "clamp(24px, 5vw, 56px)", lineHeight: 1.08 }}>
              Creating your video…
            </strong>
            <span style={{ display: "block", marginTop: 14, fontSize: "clamp(14px, 2vw, 22px)", lineHeight: 1.4, opacity: 0.78 }}>
              Choosing the best scenes for your content.
            </span>
          </div>
        </div>
      ) : config?.scenes.length ? (
        <VideoFrame
          kit={kit}
          config={displayConfig!}
          time={currentTime}
          width={dimensions.width}
          height={dimensions.height}
          playing={isPlaying}
          style={{
            position: "absolute",
            inset: 0,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      ) : null}
      {config?.audio ? (
        <audio
          ref={audioRef}
          src={config.audio.audioUrl}
          autoPlay={isPlaying}
          muted={isMuted}
          preload="auto"
          loop={state.status === "streaming"}
        />
      ) : null}
      {!generationCoverVisible ? <div
        data-testid="video-controls"
        style={{
          position: "absolute",
          right: 10,
          bottom: 10,
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          gap: 6,
          minHeight: 48,
          padding: "6px 8px",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          borderRadius: 12,
          backgroundColor: "rgba(9, 7, 18, 0.82)",
          backdropFilter: "blur(12px)",
          color: "#ffffff",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.35)",
        }}
      >
        <button
          type="button"
          aria-label={ended ? "Replay video response" : isPlaying ? "Pause video response" : "Play video response"}
          onClick={togglePlayback}
          style={controlButtonStyle}
        >
          {ended ? "↻" : isPlaying ? "Ⅱ" : "▶"}
        </button>
        {config?.audio ? (
          <button
            type="button"
            aria-label={isMuted ? "Unmute video response" : "Mute video response"}
            aria-pressed={!isMuted}
            onClick={() => setIsMuted((muted) => !muted)}
            style={controlButtonStyle}
          >
            {isMuted ? "🔇" : "🔊"}
          </button>
        ) : null}
        <button
          type="button"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          onClick={() => void toggleFullscreen()}
          style={controlButtonStyle}
        >
          {isFullscreen ? "↙" : "⛶"}
        </button>
      </div> : null}
    </div>
  );
}

export function VideoPlayer({
  templates,
  stream,
  video,
  onComplete,
  onError,
  ...props
}: VideoPlayerProps): ReactElement | null {
  const savedVideo = useMemo(() => video ? parseVideo(video) : undefined, [video]);
  const kit = useMemo(
    () => templates ? overlayTemplateRegistry(BUILTIN_TEMPLATE_KIT, templates) : BUILTIN_TEMPLATE_KIT,
    [templates],
  );
  if (!stream && !savedVideo) return null;
  return <VideoPlayerRuntime
    {...props}
    kit={kit}
    stream={stream}
    video={savedVideo}
    onComplete={(state) => {
      if (state.config) onComplete?.(state.config);
    }}
    onError={(error) => onError?.(error)}
  />;
}
