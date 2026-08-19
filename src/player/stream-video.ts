import type { VideoEvent } from "../protocol/events.js";
import {
  createVideoRequest,
  VIDEO_PROTOCOL_VERSION,
  type VideoCapabilities,
  type VideoInput,
  type VideoRequest,
} from "../protocol/types.js";
import {
  applyVideoEvent,
  createVideoState,
  type VideoState,
} from "../protocol/state.js";
import {
  decodeVideoSse,
  VIDEO_STREAM_CONTENT_TYPE,
  VIDEO_STREAM_HEADER,
} from "../protocol/sse.js";
import { VideoError } from "./video-error.js";
import { safePublicDiagnostic } from "../protocol/warnings.js";

const HTTP_ERROR_CODES = new Set([
  "body_too_large",
  "http_error",
  "invalid_body",
  "invalid_cursor",
  "invalid_input",
  "invalid_json",
  "invalid_request",
  "method_not_allowed",
  "origin_forbidden",
  "resume_unavailable",
  "secret_field",
  "unauthorized",
]);

export interface StreamVideoOptions {
  endpoint: string | URL;
  input: VideoInput;
  requestId: string;
  capabilities?: VideoCapabilities;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  /** Resume from a state persisted by the host application. */
  resume?: { state: VideoState };
  onEvent?: (event: VideoEvent, state: VideoState) => void;
}

export interface RemoteVideoRun {
  request: VideoRequest;
  stream: AsyncIterable<VideoEvent>;
  /** Resolves only on response.complete; rejects terminal errors and aborts. */
  result: Promise<VideoState>;
  abort(reason?: string): void;
}

async function responseError(response: Response, requestId: string): Promise<VideoError> {
  let code = "http_error";
  let message = `Video response endpoint failed (${response.status})`;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body) {
      const error = body.error;
      if (error && typeof error === "object") {
        if ("code" in error && typeof error.code === "string" && HTTP_ERROR_CODES.has(error.code)) {
          code = error.code;
        }
        if ("message" in error && typeof error.message === "string") {
          message = safePublicDiagnostic(error.message, message);
        }
      }
    }
  } catch {
    // Non-JSON error responses use the safe status-only fallback above.
  }
  return new VideoError(message, { code, status: response.status, requestId });
}

function normalizeStreamError(
  cause: unknown,
  requestId: string,
  state: VideoState,
  aborted: boolean,
): VideoError {
  if (cause instanceof VideoError) return cause;
  const causeError = cause instanceof Error ? cause : undefined;
  const safeMessage = aborted
    ? causeError?.name === "TimeoutError"
      ? "Request timed out"
      : safePublicDiagnostic(causeError?.message, "Video generation was aborted")
    : causeError?.message.startsWith("Video response protocol") ||
        causeError?.message.startsWith("Video response endpoint omitted protocol")
      ? safePublicDiagnostic(causeError.message, "Video response protocol failed")
      : "Video response stream failed";
  return new VideoError(safeMessage, {
    code: aborted ? "aborted" : "stream_failed",
    requestId: state.requestId ?? requestId,
    runId: state.runId,
    recoverable: false,
  });
}

export function streamVideo(options: StreamVideoOptions): RemoteVideoRun {
  const request = createVideoRequest(options.input, {
    requestId: options.requestId,
    capabilities: options.capabilities,
    ...(options.resume?.state.runId != null && options.resume.state.lastSequence >= 0
      ? {
          resume: {
            runId: options.resume.state.runId,
            afterSequence: options.resume.state.lastSequence,
          },
        }
      : {}),
  });
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) forwardAbort();
  else options.signal?.addEventListener("abort", forwardAbort, { once: true });

  let resolveResult!: (state: VideoState) => void;
  let rejectResult!: (cause: unknown) => void;
  let settled = false;
  const result = new Promise<VideoState>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const buffered: VideoEvent[] = [];
  const waiters = new Set<() => void>();
  let streamDone = false;
  let streamError: unknown;
  const notify = () => {
    for (const waiter of waiters) waiter();
    waiters.clear();
  };

  void (async function consume(): Promise<void> {
    let state = options.resume?.state ?? createVideoState();
    try {
      const fetcher = options.fetcher ?? fetch;
      const headers = new Headers(options.headers);
      headers.set("Accept", VIDEO_STREAM_CONTENT_TYPE);
      headers.set("Content-Type", "application/json");
      if (request.resume) headers.set("Last-Event-ID", `${request.resume.runId}:${request.resume.afterSequence}`);
      const response = await fetcher(options.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
        credentials: options.credentials,
      });
      if (!response.ok) throw await responseError(response, request.requestId);
      if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
        throw new Error("Video response endpoint did not return an SSE stream");
      }
      const protocolVersion = response.headers.get(VIDEO_STREAM_HEADER);
      if (protocolVersion == null) {
        throw new Error(`Video response endpoint omitted protocol version header ${VIDEO_STREAM_HEADER}`);
      }
      if (protocolVersion !== VIDEO_PROTOCOL_VERSION) {
        throw new Error(
          `Video response protocol mismatch: expected ${VIDEO_PROTOCOL_VERSION}, received ${protocolVersion}`,
        );
      }
      for await (const event of decodeVideoSse(response.body)) {
        state = applyVideoEvent(state, event);
        options.onEvent?.(event, state);
        buffered.push(event);
        notify();
        if (state.status === "complete" && !settled) {
          settled = true;
          resolveResult(state);
        } else if (state.status === "error" && !settled) {
          settled = true;
          const error = state.errors.at(-1);
          rejectResult(new VideoError(error?.message ?? "Video response could not finish", {
            code: error?.code ?? "generation_failed",
            status: response.status,
            requestId: state.requestId ?? request.requestId,
            runId: state.runId,
            recoverable: error?.recoverable,
          }));
        } else if (state.status === "aborted" && !settled) {
          settled = true;
          rejectResult(new VideoError(state.abortReason ?? "Video generation was aborted", {
            code: "aborted",
            status: response.status,
            requestId: state.requestId ?? request.requestId,
            runId: state.runId,
            recoverable: false,
          }));
        }
      }
      if (!["complete", "error", "aborted"].includes(state.status)) {
        throw new Error("Video response stream ended without a terminal event");
      }
      if (!settled && state.status === "complete") {
        settled = true;
        resolveResult(state);
      }
    } catch (cause) {
      const error = normalizeStreamError(cause, request.requestId, state, controller.signal.aborted);
      if (!settled) {
        settled = true;
        rejectResult(error);
      }
      streamError = error;
    } finally {
      streamDone = true;
      notify();
      options.signal?.removeEventListener("abort", forwardAbort);
    }
  })();

  const stream: AsyncIterable<VideoEvent> = {
    async *[Symbol.asyncIterator]() {
      let index = 0;
      while (true) {
        while (index < buffered.length) yield buffered[index++];
        if (streamDone) {
          if (streamError) throw streamError;
          return;
        }
        await new Promise<void>((resolve) => waiters.add(resolve));
      }
    },
  };

  return {
    request,
    stream,
    result,
    abort(reason = "user cancelled") {
      controller.abort(new Error(reason));
    },
  };
}
