import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { streamVideo, type RemoteVideoRun } from "./stream-video.js";
import type { Video, VideoInput } from "../protocol/types.js";
import {
  createVideoState,
  type VideoState,
  type VideoStatus,
} from "../protocol/state.js";
import { overlayTemplateRegistry, type TemplateRegistry } from "../visual-system/catalog/kit.js";
import { BUILTIN_TEMPLATE_KIT, preloadBuiltinTemplate } from "../visual-system/catalog/builtin.js";
import { preloadSceneMedia } from "./preload-media.js";
import type { VideoPlayerProps } from "./video-player.js";
import { VideoError } from "./video-error.js";
import type { VideoWarning } from "../protocol/warnings.js";

export interface UseVideoOptions {
  endpoint?: string | URL;
  /** Customer-owned templates that replace matching built-ins and add new IDs. */
  templates?: TemplateRegistry;
  /** Templates the planner may select for this client experience. Renderers remain available for replay. */
  templateIds?: readonly string[];
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  fetcher?: typeof fetch;
  /** Override ID generation for tracing or deterministic tests. */
  createRequestId?: () => string;
}

export interface UseVideoResult {
  /** Resolves with a completed video; rejects terminal errors and aborts. */
  generate(input: VideoInput): Promise<Video>;
  abort(reason?: string): void;
  video?: Video;
  status: VideoStatus;
  error?: VideoError;
  warnings: readonly VideoWarning[];
  /** Spread into an explicitly rendered VideoPlayer. */
  playerProps: VideoPlayerProps & { templates: TemplateRegistry; video?: never };
}

function defaultRequestId(): string {
  const id = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `request-${id}`;
}

function errorFrom(cause: unknown): VideoError {
  if (cause instanceof VideoError) return cause;
  const error = cause instanceof Error ? cause : new Error(String(cause));
  return new VideoError(error.message, { code: "video_failed" });
}

export function useVideo(options: UseVideoOptions = {}): UseVideoResult {
  const templates = useMemo(
    () => options.templates
      ? overlayTemplateRegistry(BUILTIN_TEMPLATE_KIT, options.templates)
      : BUILTIN_TEMPLATE_KIT,
    [options.templates],
  );
  const [state, setState] = useState<VideoState>(() => createVideoState());
  const [error, setError] = useState<VideoError>();
  const [run, setRun] = useState<RemoteVideoRun>();
  const activeRun = useRef<RemoteVideoRun>();
  const generation = useRef(0);
  const mounted = useRef(true);
  const optionsRef = useRef(options);
  const templatesRef = useRef(templates);
  optionsRef.current = options;
  templatesRef.current = templates;

  const abort = useCallback((reason = "user cancelled") => {
    generation.current += 1;
    const current = activeRun.current;
    activeRun.current = undefined;
    current?.abort(reason);
    if (current && mounted.current) {
      setError(new VideoError(reason, {
        code: "aborted",
        requestId: current.request.requestId,
        recoverable: false,
      }));
      setState((previous) => ({ ...previous, status: "aborted", abortReason: reason }));
    }
  }, []);

  const generate = useCallback((input: VideoInput): Promise<Video> => {
    const currentGeneration = generation.current + 1;
    generation.current = currentGeneration;
    activeRun.current?.abort("replaced by a new composition");
    const currentOptions = optionsRef.current;
    const initialState = createVideoState();
    setState({ ...initialState, status: "streaming" });
    setError(undefined);

    const nextRun = streamVideo({
      endpoint: currentOptions.endpoint ?? "/api/video",
      input,
      requestId: (currentOptions.createRequestId ?? defaultRequestId)(),
      capabilities: currentOptions.templateIds
        ? { ...templatesRef.current.capabilities, templates: [...new Set(currentOptions.templateIds)] }
        : templatesRef.current.capabilities,
      headers: currentOptions.headers,
      credentials: currentOptions.credentials,
      fetcher: currentOptions.fetcher,
      onEvent: (_event, nextState) => {
        if (_event.type === "scene.add") {
          if (!currentOptions.templates?.getTemplate(_event.data.scene.templateId)) {
            preloadBuiltinTemplate(_event.data.scene.templateId);
          }
        }
        // Warm the backdrop the instant its URL is known, which is the whole
        // lead time there is before the scene plays. A resolved stock lookup
        // arrives as asset.patch well after scene.add, so watching only the
        // add would miss the case this exists for.
        if (_event.type === "scene.add") preloadSceneMedia(_event.data.scene.variables);
        if (_event.type === "asset.patch") preloadSceneMedia(_event.data.variables);
        if (_event.type === "scene.patch" && _event.data.patch.variables) {
          preloadSceneMedia(_event.data.patch.variables);
        }
        if (mounted.current && generation.current === currentGeneration) setState(nextState);
      },
    });
    activeRun.current = nextRun;
    setRun(nextRun);
    void nextRun.result.then(() => {
      if (generation.current === currentGeneration) activeRun.current = undefined;
    }).catch((cause) => {
      if (mounted.current && generation.current === currentGeneration) {
        activeRun.current = undefined;
        const error = errorFrom(cause);
        setError(error);
        setState((previous) => ({
          ...previous,
          status: error.code === "aborted" ? "aborted" : "error",
          ...(error.code === "aborted" && previous.abortReason == null
            ? { abortReason: error.message }
            : {}),
        }));
      }
    });
    const result = nextRun.result.then((nextState) => {
      if (!nextState.config) throw new Error("Video generation ended without a video");
      return nextState.config;
    });
    // Preserve fire-and-forget event handler usage without hiding rejection from callers that await.
    void result.catch(() => undefined);
    return result;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      activeRun.current?.abort("component unmounted");
      activeRun.current = undefined;
    };
  }, []);

  return {
    generate,
    abort,
    video: state.config,
    status: state.status,
    error,
    warnings: state.warnings,
    playerProps: { templates, ...(run ? { stream: run.stream } : {}) },
  };
}
