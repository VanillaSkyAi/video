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

export type VideoPlaybackMode =
  | "manual"
  | "muted-autoplay"
  | "autoplay-with-sound"
  | "autoplay-after-interaction";

const MINIMUM_GENERATION_INTRO_MS = 3_000;

interface VideoPlayerRuntimeProps {
  kit: TemplateRegistry;
  stream?: AsyncIterable<VideoEvent>;
  video?: Video;
  /** High-level startup policy. When set, this overrides autoPlay and startMuted. */
  playbackMode?: VideoPlaybackMode;
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
  /** High-level startup policy. When set, this overrides autoPlay and startMuted. */
  playbackMode?: VideoPlaybackMode;
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

type PlayerIconName = "enter-fullscreen" | "exit-fullscreen" | "pause" | "play" | "replay" | "volume" | "volume-off";
type FullscreenMode = "none" | "native" | "fallback";

function PlayerIcon({ name, size = 22 }: { name: PlayerIconName; size?: number }): ReactElement {
  const shared = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "play") {
    return <svg {...shared}><path d="M8 5v14l11-7z" fill="currentColor" stroke="none" /></svg>;
  }
  if (name === "pause") {
    return <svg {...shared}><path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor" stroke="none" /></svg>;
  }
  if (name === "replay") {
    return <svg {...shared}><path d="M4.5 9A8 8 0 1 1 5 16" /><path d="M4.5 4.5V9H9" /></svg>;
  }
  if (name === "volume-off") {
    return <svg {...shared}><path d="M11 5 6.5 9H3v6h3.5L11 19z" /><path d="m16 9 5 5M21 9l-5 5" /></svg>;
  }
  if (name === "volume") {
    return <svg {...shared}><path d="M11 5 6.5 9H3v6h3.5L11 19z" /><path d="M15 9.5a4 4 0 0 1 0 5M17.8 7a7.5 7.5 0 0 1 0 10" /></svg>;
  }
  if (name === "exit-fullscreen") {
    return <svg {...shared}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>;
  }
  return <svg {...shared}><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></svg>;
}

export function VideoPlayerRuntime({
  kit,
  stream,
  video,
  playbackMode,
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
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const resolvedStartMuted = playbackMode === "muted-autoplay"
    ? true
    : playbackMode
      ? false
      : startMuted;
  const shouldAutoPlay = playbackMode === "manual"
    ? false
    : playbackMode === "autoplay-after-interaction"
      ? audioUnlocked
      : playbackMode === "muted-autoplay" || playbackMode === "autoplay-with-sound"
        ? true
        : autoPlay;
  const autoStartGeneration = Boolean(playbackMode && stream && shouldAutoPlay && !reducedMotion);
  const [isPlaying, setIsPlaying] = useState(() => shouldAutoPlay && !reducedMotion && !autoStartGeneration);
  const [isMuted, setIsMuted] = useState(resolvedStartMuted);
  const [fullscreenMode, setFullscreenMode] = useState<FullscreenMode>("none");
  const [state, setState] = useState<VideoState>(() => video ? savedVideoState(video) : createVideoState());
  const [currentTime, setCurrentTime] = useState(0);
  const [activeStream, setActiveStream] = useState(stream);
  const [replacementPending, setReplacementPending] = useState(false);
  const [startRequested, setStartRequested] = useState(autoStartGeneration);
  const [introPlaying, setIntroPlaying] = useState(autoStartGeneration);
  const [generationIntroComplete, setGenerationIntroComplete] = useState(() => !playbackMode || !stream);
  const [observedWidth, setObservedWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const timeRef = useRef(currentTime);
  const audioRef = useRef<HTMLAudioElement>(null);
  const introStartedAtRef = useRef<number | null>(autoStartGeneration ? performance.now() : null);
  const callbacksRef = useRef({ onComplete, onError, onStateChange });

  stateRef.current = state;
  timeRef.current = currentTime;
  callbacksRef.current = { onComplete, onError, onStateChange };

  const primeSoundtrack = () => {
    const audio = audioRef.current;
    if (!audio || audio.dataset.audioOutput) return;
    const Context = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    context.resume().catch(Boolean);
    import("./control-visibility.js").then((output) => output.default(audio, context)).catch(() => context.close());
  };

  if (stream !== activeStream) {
    const autoStartReplacement = Boolean(playbackMode && stream && shouldAutoPlay && !reducedMotion);
    setActiveStream(stream);
    setReplacementPending(stream != null);
    setState(video ? savedVideoState(video) : createVideoState());
    setCurrentTime(0);
    setIsMuted(resolvedStartMuted);
    setIsPlaying(shouldAutoPlay && !reducedMotion && !autoStartReplacement);
    setStartRequested(autoStartReplacement);
    setIntroPlaying(autoStartReplacement);
    setGenerationIntroComplete(!playbackMode || !stream);
    introStartedAtRef.current = autoStartReplacement ? performance.now() : null;
  }

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
      if (event.matches) {
        introStartedAtRef.current = null;
        setStartRequested(false);
        setIntroPlaying(false);
        setIsPlaying(false);
      }
    };
    preference.addEventListener?.("change", handleChange);
    return () => preference.removeEventListener?.("change", handleChange);
  }, []);

  useEffect(() => {
    import("./control-visibility.js");
  }, []);

  useEffect(() => setIsMuted(resolvedStartMuted), [resolvedStartMuted]);

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
          setReplacementPending(false);
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
    const update = () => {
      setObservedWidth(container.clientWidth);
    };
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
    if (isPlaying || introPlaying) {
      void audio.play()
        .then(() => {
          if (!audio.muted) setAudioUnlocked(true);
        })
        .catch(() => {
          // Do not let visuals silently run ahead when a browser blocks audible
          // autoplay. Return to the poster so a visible play control can provide
          // the required user gesture and restart audio and motion together.
          audio.currentTime = 0;
          timeRef.current = 0;
          setCurrentTime(0);
          setStartRequested(false);
          setIntroPlaying(false);
          setIsPlaying(false);
        });
    } else {
      audio.pause();
    }
  }, [introPlaying, isPlaying, state.config?.audio?.audioUrl]);

  useEffect(() => {
    if (!state.config?.scenes.length) {
      const terminalWithoutVideo = state.status === "complete" || state.status === "error" || state.status === "aborted";
      if (terminalWithoutVideo) {
        audioRef.current?.pause();
        introStartedAtRef.current = null;
        setStartRequested(false);
        setIntroPlaying(false);
        setGenerationIntroComplete(true);
      }
      return;
    }
    if (!startRequested) return;

    if (state.config.scenes[0]?.id === "supplied-opening") {
      timeRef.current = 0;
      setCurrentTime(0);
      if (audioRef.current) audioRef.current.volume = state.config.audio?.volume ?? 1;
      introStartedAtRef.current = null;
      setStartRequested(false);
      setIntroPlaying(false);
      setGenerationIntroComplete(true);
      setIsPlaying(true);
      return;
    }

    const startedAt = introStartedAtRef.current ?? performance.now();
    introStartedAtRef.current = startedAt;
    const remaining = Math.max(0, MINIMUM_GENERATION_INTRO_MS - (performance.now() - startedAt));
    const startGeneratedVideo = () => {
      timeRef.current = 0;
      setCurrentTime(0);
      if (audioRef.current) audioRef.current.volume = state.config?.audio?.volume ?? 1;
      introStartedAtRef.current = null;
      setStartRequested(false);
      setIntroPlaying(false);
      setGenerationIntroComplete(true);
      setIsPlaying(true);
    };
    if (remaining <= 0) {
      startGeneratedVideo();
      return;
    }
    const timer = setTimeout(startGeneratedVideo, remaining);
    return () => clearTimeout(timer);
  }, [startRequested, state.config?.audio?.volume, state.config?.scenes.length, state.status]);

  const streamOrientation = state.config?.orientation ?? "portrait";
  const isFullscreen = fullscreenMode !== "none";
  const responsiveWidth = isFullscreen ? window.innerWidth : width ?? observedWidth;
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
  const generationIntroWaiting = Boolean(playbackMode && stream && !generationIntroComplete);
  const firstSceneRange = config ? resolveVideoTimeline(config)[0] : undefined;
  const hasSuppliedOpening = firstSceneRange?.scene.id === "supplied-opening";
  const showStartPoster = (!generationIntroWaiting || hasSuppliedOpening) && !startRequested && !isPlaying && !ended && currentTime <= 0.001 && Boolean(config?.scenes.length);
  const firstSceneHoldProgress = firstSceneRange
    ? kit.getTemplateMetadata(firstSceneRange.scene.templateId)?.transitionTiming?.holdProgress ?? 0.7
    : 0;
  const posterTime = firstSceneRange
    ? firstSceneRange.start + Math.max(0, firstSceneRange.end - firstSceneRange.start) * firstSceneHoldProgress
    : currentTime;
  const startPlayback = () => {
    setGenerationIntroComplete(true);
    containerRef.current?.setAttribute("data-touch-controls", "false");
    const audio = audioRef.current;
    if (audio) {
      void audio.play()
        .then(() => {
          if (!audio.muted) setAudioUnlocked(true);
        })
        .catch(() => {
          audio.currentTime = 0;
          timeRef.current = 0;
          setCurrentTime(0);
          setIsPlaying(false);
        });
    }
    setIsPlaying(true);
  };
  const armPlayback = () => {
    introStartedAtRef.current = performance.now();
    setStartRequested(true);
    setIntroPlaying(true);
    const audio = audioRef.current;
    if (!audio) return;

    const volume = stateRef.current.config?.audio?.volume ?? 1;
    audio.volume = volume;
    void audio.play()
      .then(() => {
        if (!audio.muted) setAudioUnlocked(true);
      })
      .catch(() => {
        audio.volume = volume;
        audio.currentTime = 0;
        timeRef.current = 0;
        setCurrentTime(0);
        introStartedAtRef.current = null;
        setStartRequested(false);
        setIntroPlaying(false);
        setIsPlaying(false);
      });
  };
  const togglePlayback = () => {
    if (startRequested) return;
    if (!stateRef.current.config?.scenes.length) {
      armPlayback();
      return;
    }
    if (!isPlaying && ended) {
      timeRef.current = 0;
      setCurrentTime(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
      startPlayback();
      return;
    }
    if (isPlaying) setIsPlaying(false);
    else startPlayback();
  };
  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    void import("./control-visibility.js").then((output) => output.togglePlayerFullscreen(container, setFullscreenMode));
  };
  const controlSize = Math.max(40, Math.min(52, Math.round(displayWidth * 0.15)));
  const controlInset = Math.max(10, Math.min(20, Math.round(displayWidth * 0.056)));
  const controlButtonStyle: CSSProperties = {
    display: "inline-grid",
    placeItems: "center",
    width: controlSize,
    height: controlSize,
    minWidth: controlSize,
    minHeight: controlSize,
    padding: 0,
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    color: "#ffffff",
    boxShadow: "0 5px 18px rgba(0, 0, 0, 0.16)",
    backdropFilter: "blur(12px)",
    cursor: "pointer",
  };
  const startButtonStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    minHeight: 60,
    padding: "14px 22px",
    border: "1px solid rgba(9, 7, 18, 0.08)",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: "#090712",
    boxShadow: "0 8px 28px rgba(0, 0, 0, 0.24)",
    font: "700 16px/1 system-ui, sans-serif",
    whiteSpace: "nowrap",
    cursor: "pointer",
  };
  const startButtonPositionStyle: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    zIndex: 3,
    transform: "translate(-50%, -50%)",
  };
  const pendingReplacement = replacementPending && state.status === "idle";
  const displayedStatus = pendingReplacement ? "streaming" : state.status;
  const generationCoverVisible = (generationIntroWaiting && !hasSuppliedOpening) || (displayedStatus === "streaming" && !config?.scenes.length);
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
      onClickCapture={primeSoundtrack}
      onKeyDownCapture={primeSoundtrack}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === " " || event.key === "Enter")) {
          event.preventDefault();
          togglePlayback();
        }
      }}
      data-testid="video-player"
      data-status={displayedStatus}
      data-finish-reason={state.finishReason}
      data-scenes={config?.scenes.length ?? 0}
      data-orientation={orientation}
      data-current-time={currentTime.toFixed(3)}
      data-playing={isPlaying || introPlaying}
      data-ended={ended}
      data-start-poster={showStartPoster}
      data-start-requested={startRequested}
      data-intro-playing={introPlaying}
      data-generation-intro-complete={generationIntroComplete}
      data-audio-unlocked={audioUnlocked}
      data-playback-mode={playbackMode ?? "custom"}
      data-fullscreen={fullscreenMode}
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
          <div style={{ position: "absolute", top: "28%", left: "10%", right: "10%" }}>
            <div aria-hidden="true" style={{ fontSize: "clamp(28px, 8vw, 72px)", opacity: 0.9 }}>✦</div>
            <strong style={{ display: "block", marginTop: 18, fontSize: "clamp(24px, 5vw, 56px)", lineHeight: 1.08 }}>
              Creating your video…
            </strong>
            <span style={{ display: "block", marginTop: 14, fontSize: "clamp(14px, 2vw, 22px)", lineHeight: 1.4, opacity: 0.78 }}>
              Choosing the best scenes for your content.
            </span>
          </div>
          {!startRequested && !isPlaying ? (
            <button
              type="button"
              aria-label={config?.audio && !isMuted ? "Play video with sound" : "Play video response"}
              onClick={armPlayback}
              style={{ ...startButtonStyle, ...startButtonPositionStyle }}
            >
              <PlayerIcon name="play" size={20} />
              {config?.audio && !isMuted ? "Play with sound" : "Play video"}
            </button>
          ) : null}
        </div>
      ) : config?.scenes.length ? (
        <VideoFrame
          kit={kit}
          config={displayConfig!}
          time={showStartPoster ? posterTime : currentTime}
          width={dimensions.width}
          height={dimensions.height}
          playing={isPlaying}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      ) : null}
      {showStartPoster ? (
        <button
          type="button"
          data-testid="video-start-button"
          aria-label={config?.audio && !isMuted ? "Play video with sound" : "Play video response"}
          onClick={startPlayback}
          style={{
            ...startButtonStyle,
            ...startButtonPositionStyle,
          }}
        >
          <PlayerIcon name="play" size={20} />
          {config?.audio && !isMuted ? "Play with sound" : "Play video"}
        </button>
      ) : null}
      {config?.audio ? (
        <audio
          key={config.audio.audioUrl}
          ref={audioRef}
          src={config.audio.audioUrl}
          data-v={config.audio.volume}
          autoPlay={isPlaying}
          muted={isMuted}
          preload="auto"
          loop={state.status === "streaming" || introPlaying}
        />
      ) : null}
      {ended ? <div
        data-testid="video-ended-scrim"
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          background: "rgba(4, 3, 18, 0.52)",
          backdropFilter: "blur(4px)",
        }}
      /> : null}
      {ended ? <button
        type="button"
        data-testid="video-replay-button"
        aria-label="Replay video response"
        onClick={togglePlayback}
        style={{
          ...startButtonStyle,
          ...startButtonPositionStyle,
          zIndex: 3,
        }}
      >
        <PlayerIcon name="replay" size={21} />
        Replay
      </button> : null}
      {!generationCoverVisible && !showStartPoster && config?.scenes.length ? <div
        data-testid="video-controls"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 4,
          pointerEvents: "none",
        }}
      >
        <div
          data-testid="video-primary-controls"
          style={{ position: "absolute", left: controlInset, bottom: controlInset, display: "flex", pointerEvents: "auto" }}
        >
          <button
            type="button"
            aria-label={ended ? "Play video response from beginning" : isPlaying ? "Pause video response" : "Play video response"}
            onClick={togglePlayback}
            style={controlButtonStyle}
          >
            <PlayerIcon name={isPlaying ? "pause" : "play"} />
          </button>
        </div>
        <div
          data-testid="video-secondary-controls"
          style={{ position: "absolute", right: controlInset, bottom: controlInset, display: "flex", gap: 10, pointerEvents: "auto" }}
        >
          {config?.audio ? (
            <button
              type="button"
              aria-label={isMuted ? "Unmute video response" : "Mute video response"}
              aria-pressed={!isMuted}
              onClick={() => setIsMuted((muted) => {
                if (muted) setAudioUnlocked(true);
                return !muted;
              })}
              style={controlButtonStyle}
            >
              <PlayerIcon name={isMuted ? "volume-off" : "volume"} />
            </button>
          ) : null}
          <button
            type="button"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={() => void toggleFullscreen()}
            style={controlButtonStyle}
          >
            <PlayerIcon name={isFullscreen ? "exit-fullscreen" : "enter-fullscreen"} />
          </button>
        </div>
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
