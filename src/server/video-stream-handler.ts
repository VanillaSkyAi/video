import { createVideo } from "./compose-video.js";
import { encodeVideoSseEvent, videoSseHeaders } from "../protocol/sse.js";
import type { VideoEvent } from "../protocol/events.js";
import type {
  VideoAudio,
  VideoCapabilities,
  VideoInput,
  VideoPlanner,
  VideoRequest,
  VideoResumeCursor,
  VideoRun,
  VideoSceneValidator,
  VideoSnapshotRetention,
  VideoTemplatePacing,
} from "../protocol/types.js";
import { parseVideoEvent } from "../protocol/validation.js";
import { parseVideoRequest } from "./request-validation.js";
import type { VideoWarning } from "../protocol/warnings.js";
import { safePublicDiagnostic } from "../protocol/warnings.js";
import type { VideoGenerationSummary } from "./lifecycle.js";

// Accommodates an inline brand logo while keeping public requests bounded.
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_HEARTBEAT_MS = 15_000;
const SECRET_FIELD = /(?:api[_-]?key|authorization|admin[_-]?session|secret(?:[_-]?key)?)$/i;

export interface VideoStreamHandlerOptions {
  generate: VideoPlanner;
  systemPrompt?: string | ((context: {
    request: VideoRequest;
    capabilities?: VideoCapabilities;
  }) => string);
  selectAudio?: (input: VideoInput) => VideoAudio | undefined;
  createRunId?: (request: VideoRequest) => string;
  /** Browser origins allowed to call this customer-owned route. Omit for same-origin use. */
  allowedOrigins?: string[];
  /** Authenticate before reading the prompt body, or explicitly opt out for a non-public in-process/test route. */
  authorize: ((request: Request) => boolean | Promise<boolean>) | "none";
  maxBodyBytes?: number;
  heartbeatMs?: number | false;
  /** Private full-fidelity errors. Callback failures never affect the response. */
  onError?: (error: Error) => unknown;
  /** Safe warnings, exactly once per generated warning. */
  onWarning?: (warning: VideoWarning) => unknown;
  /** Server-only summary, exactly once and only after response.complete. */
  onComplete?: (summary: VideoGenerationSummary) => unknown;
  /** Drop malformed generated parts by default, or preserve fail-fast behavior. */
  invalidPartBehavior?: "drop" | "fail";
  /** Require one explicit closer before a standard generated plan is considered complete. */
  requireCloser?: boolean;
  /** Allow credentialed cross-origin requests from explicit allowedOrigins. */
  allowCredentials?: boolean;
  /** Templates and extensions implemented by this customer deployment. */
  supportedCapabilities?: VideoCapabilities;
  /** Validate template fields and grounding before forwarding a generated scene. */
  validateScene?: VideoSceneValidator;
  /** Resolve trusted pacing metadata for negotiated templates. */
  getTemplatePacing?: (templateId: string) => VideoTemplatePacing | undefined;
  /** Explicitly retain selected bounded source metadata in completed snapshots. */
  snapshotRetention?: VideoSnapshotRetention;
  /** Read events after a cursor from customer-owned durable storage. */
  replay?: (
    cursor: VideoResumeCursor,
    context: { request: VideoRequest; signal: AbortSignal },
  ) => AsyncIterable<VideoEvent>;
}

export type VideoStreamHandler = (request: Request) => Promise<Response>;

function jsonError(status: number, code: string, message: string, headers?: HeadersInit): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

function corsHeaders(origin: string | null, allowedOrigins?: string[], allowCredentials = false): Headers {
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  if (origin && allowedOrigins?.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    if (allowCredentials) headers.set("Access-Control-Allow-Credentials", "true");
  }
  return headers;
}

function containsSecretField(value: unknown, seen = new Set<unknown>()): boolean {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsSecretField(item, seen));
  return Object.entries(value as Record<string, unknown>).some(([key, child]) =>
    SECRET_FIELD.test(key) || containsSecretField(child, seen));
}

function errorFrom(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function defaultRunId(request: VideoRequest): string {
  return `run-${request.requestId}`;
}

function negotiateCapabilities(
  requested?: VideoCapabilities,
  supported?: VideoCapabilities,
): VideoCapabilities | undefined {
  if (!supported) return requested;
  if (!requested) return supported;
  const intersect = (left?: string[], right?: string[]) => {
    if (right == null) return left;
    if (left == null) return right;
    const permitted = new Set(right);
    return left.filter((value) => permitted.has(value));
  };
  return {
    ...(requested.templates != null || supported.templates != null
      ? { templates: intersect(requested.templates, supported.templates) }
      : {}),
    ...(requested.extensions != null || supported.extensions != null
      ? { extensions: intersect(requested.extensions, supported.extensions) }
      : {}),
  };
}

export function createVideoStreamHandler(options: VideoStreamHandlerOptions): VideoStreamHandler {
  if (!options || typeof options.generate !== "function") {
    throw new Error("createVideoStreamHandler requires a planner");
  }
  if (options.authorize !== "none" && typeof options.authorize !== "function") {
    throw new Error('createVideoStreamHandler requires authorize or authorize: "none"');
  }
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (!Number.isFinite(maxBodyBytes) || maxBodyBytes <= 0) throw new Error("maxBodyBytes must be positive");
  const heartbeatMs = options.heartbeatMs === false
    ? false
    : options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  if (heartbeatMs !== false && (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0)) {
    throw new Error("heartbeatMs must be positive or false");
  }
  const reportError = (error: Error) => {
    try { void Promise.resolve(options.onError?.(error)).catch(() => undefined); } catch {
      // Error reporters must not alter responses.
    }
  };

  return async function handle(request: Request): Promise<Response> {
    const origin = request.headers.get("origin");
    const baseHeaders = corsHeaders(origin, options.allowedOrigins, options.allowCredentials);
    if (request.method === "OPTIONS") {
      if (origin && options.allowedOrigins && !options.allowedOrigins.includes(origin)) {
        return jsonError(403, "origin_forbidden", "Origin is not allowed", baseHeaders);
      }
      baseHeaders.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      baseHeaders.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Last-Event-ID");
      return new Response(null, { status: 204, headers: baseHeaders });
    }
    if (request.method !== "POST") {
      baseHeaders.set("Allow", "POST, OPTIONS");
      return jsonError(405, "method_not_allowed", "Use POST", baseHeaders);
    }
    if (origin && options.allowedOrigins && !options.allowedOrigins.includes(origin)) {
      return jsonError(403, "origin_forbidden", "Origin is not allowed", baseHeaders);
    }
    if (options.authorize !== "none") {
      let authorized = false;
      try {
        authorized = await options.authorize(request);
      } catch (cause) {
        reportError(errorFrom(cause));
      }
      if (!authorized) return jsonError(401, "unauthorized", "Authentication required", baseHeaders);
    }

    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
      return jsonError(413, "body_too_large", "Request body is too large", baseHeaders);
    }
    let rawBody: string;
    try {
      rawBody = await request.text();
    } catch {
      return jsonError(400, "invalid_body", "Request body could not be read", baseHeaders);
    }
    if (new TextEncoder().encode(rawBody).byteLength > maxBodyBytes) {
      return jsonError(413, "body_too_large", "Request body is too large", baseHeaders);
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonError(400, "invalid_json", "Request body must be valid JSON", baseHeaders);
    }
    if (containsSecretField(body)) {
      return jsonError(
        400,
        "secret_field",
        "Provider credentials belong in server environment variables, not the request body",
        baseHeaders,
      );
    }
    let motionRequest: VideoRequest;
    try {
      motionRequest = parseVideoRequest(body);
    } catch (cause) {
      return jsonError(
        400,
        "invalid_request",
        safePublicDiagnostic(errorFrom(cause).message, "Video request is invalid"),
        baseHeaders,
      );
    }

    if (motionRequest.resume) {
      const expectedLastEventId = `${motionRequest.resume.runId}:${motionRequest.resume.afterSequence}`;
      if (request.headers.get("last-event-id") !== expectedLastEventId) {
        return jsonError(400, "invalid_cursor", "Last-Event-ID does not match the resume cursor", baseHeaders);
      }
      if (!options.replay) {
        return jsonError(409, "resume_unavailable", "This endpoint does not have replay storage configured", baseHeaders);
      }
    }

    const negotiatedCapabilities = negotiateCapabilities(
      motionRequest.capabilities,
      options.supportedCapabilities,
    );
    const systemPrompt = typeof options.systemPrompt === "function"
      ? options.systemPrompt({ request: motionRequest, capabilities: negotiatedCapabilities })
      : options.systemPrompt;
    let run: VideoRun | undefined;
    if (!motionRequest.resume) {
      try {
        run = createVideo(motionRequest.input, {
          requestId: motionRequest.requestId,
          runId: (options.createRunId ?? defaultRunId)(motionRequest),
          capabilities: negotiatedCapabilities,
          validateScene: options.validateScene,
          getTemplatePacing: options.getTemplatePacing,
          invalidPartBehavior: options.invalidPartBehavior ?? "drop",
          requireCloser: options.requireCloser,
          onError: options.onError,
          onWarning: options.onWarning,
          onComplete: options.onComplete,
          systemPrompt,
          selectAudio: options.selectAudio,
          snapshotRetention: options.snapshotRetention,
          signal: request.signal,
          generate: options.generate,
        });
      } catch (cause) {
        reportError(errorFrom(cause));
        return jsonError(400, "invalid_input", "Video input is invalid", baseHeaders);
      }
    }
    const source = motionRequest.resume
      ? options.replay!(motionRequest.resume, { request: motionRequest, signal: request.signal })
      : run!.stream;
    const iterator = source[Symbol.asyncIterator]();
    let replaySequence = motionRequest.resume?.afterSequence;
    const encoder = new TextEncoder();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        if (heartbeatMs !== false) {
          heartbeat = setInterval(() => {
            if (!closed && (controller.desiredSize ?? 0) > 0) {
              controller.enqueue(encoder.encode(": ping\n\n"));
            }
          }, heartbeatMs);
        }
      },
      async pull(controller) {
        const next = await iterator.next();
        if (next.done) {
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        const event = parseVideoEvent(next.value);
        if (motionRequest.resume) {
          if (event.runId !== motionRequest.resume.runId || event.sequence !== replaySequence! + 1) {
            throw new Error("Replay storage returned an event outside the requested cursor");
          }
          replaySequence = event.sequence;
        }
        controller.enqueue(encoder.encode(encodeVideoSseEvent(event)));
      },
      async cancel(reason) {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        run?.abort(typeof reason === "string" ? reason : "client disconnected");
        await iterator.return?.();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: videoSseHeaders(baseHeaders),
    });
  };
}
