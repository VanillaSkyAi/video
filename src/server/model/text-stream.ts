import { parseVideoPlanPart } from "../../protocol/validation.js";
import type {
  VideoGenerationContext,
  VideoPlanner,
} from "../../protocol/types.js";
import type { VideoFinishReason } from "../../protocol/events.js";
import type { VideoWarning } from "../../protocol/warnings.js";
import {
  boundProviderValue,
  getGenerationLifecycleSink,
  normalizeModelId,
  normalizeProviderUsage,
  type VideoProviderLifecycleResult,
} from "../lifecycle.js";
import { isConfidentlyTruncatedJson } from "./truncated-json.js";

export interface TextDeltaVideoPlannerOptions {
  /** Capture provider credentials in this server-only closure. */
  streamText: (context: VideoGenerationContext) =>
    | AsyncIterable<string>
    | TextDeltaVideoSource;
  /** Retain bounded provider-native usage and metadata on the server summary. */
  includeRawProviderData?: boolean;
}

type Awaitable<T> = T | PromiseLike<T>;
type ProviderFinishReason = string | { unified?: string; raw?: string };

export interface TextDeltaVideoSource {
  textStream: AsyncIterable<string>;
  /** The provider SDK's normalized finish reason, when available. */
  finishReason?: Awaitable<ProviderFinishReason | undefined>;
  /** The provider's original finish reason, when available. */
  rawFinishReason?: Awaitable<string | undefined>;
  /** Vercel AI SDK usage. Both current and prior structural shapes are accepted. */
  usage?: Awaitable<unknown>;
  totalUsage?: Awaitable<unknown>;
  providerMetadata?: Awaitable<unknown>;
  warnings?: Awaitable<unknown>;
  response?: Awaitable<unknown>;
  finalStep?: Awaitable<unknown>;
  /** Compatibility with older structural adapters. Prefer finalStep. */
  lastStep?: Awaitable<unknown>;
  steps?: Awaitable<unknown>;
  /** Optional provider-neutral model hints for native adapters. */
  requestedModelId?: Awaitable<string | undefined>;
  resolvedModelId?: Awaitable<string | undefined>;
  modelId?: Awaitable<string | undefined>;
}

const PROVIDER_CODE_FENCE = /^```(?:json|ndjson)?$/i;

function parsePlanLine(line: string) {
  if (!line || PROVIDER_CODE_FENCE.test(line) || !line.startsWith("{")) return undefined;
  const value: unknown = JSON.parse(line);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    const scene = object.scene;
    if (object.type === "scene.add" && object.timing != null &&
      scene && typeof scene === "object" && !Array.isArray(scene) &&
      !("timing" in scene)) {
      const { timing, ...planPart } = object;
      return parseVideoPlanPart({
        ...planPart,
        scene: { ...(scene as Record<string, unknown>), timing },
      });
    }
  }
  return parseVideoPlanPart(value);
}

function isEnrichedSource(
  source: AsyncIterable<string> | TextDeltaVideoSource,
): source is TextDeltaVideoSource {
  return typeof source === "object" && source != null && "textStream" in source;
}

type NormalizedFinishReason = VideoFinishReason | "provider-error" | "tool-calls";

function normalizeFinishReason(reason: string | undefined): NormalizedFinishReason | undefined {
  if (!reason) return undefined;
  const normalized = reason.toLowerCase().replaceAll("_", "-");
  if (["stop", "end-turn", "end", "completed"].includes(normalized)) return "stop";
  if (["length", "max-tokens", "max-output-tokens", "token-limit"].includes(normalized)) return "length";
  if (["content-filter", "content-filtered", "safety"].includes(normalized)) return "content-filter";
  if (["error", "failed", "failure"].includes(normalized)) return "provider-error";
  if (["tool-calls", "tool-call", "tool-use", "tool-uses"].includes(normalized)) return "tool-calls";
  return "other";
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function valueAt(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    current = record(current)?.[key];
  }
  return current;
}

function modelFromResponse(value: unknown): string | undefined {
  return normalizeModelId(valueAt(value, ["modelId"]) ?? valueAt(value, ["model"]));
}

function modelFromStep(value: unknown): string | undefined {
  return modelFromResponse(valueAt(value, ["response"]))
    ?? normalizeModelId(valueAt(value, ["modelId"]));
}

function requestedModelFromStep(value: unknown): string | undefined {
  return normalizeModelId(valueAt(value, ["model", "modelId"]));
}

function providerWarning(code: VideoWarning["code"], message: string): VideoWarning {
  return { code, category: "provider", message, recoverable: true };
}

interface SettledField<T> {
  value?: T;
  rejected: boolean;
}

const PROVIDER_RESULT_ABORTED = Symbol("provider-result-aborted");

function settle<T>(value: Awaitable<T> | undefined): Promise<SettledField<T>> {
  return Promise.resolve(value).then(
    (resolved) => ({ value: resolved, rejected: false }),
    () => ({ rejected: true }),
  );
}

function providerResultOrAbort(
  result: Promise<VideoProviderLifecycleResult>,
  signal: AbortSignal,
): Promise<VideoProviderLifecycleResult | typeof PROVIDER_RESULT_ABORTED> {
  return new Promise((resolve, reject) => {
    let completed = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (completed) return;
      completed = true;
      cleanup();
      resolve(PROVIDER_RESULT_ABORTED);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void result.then(
      (value) => {
        if (completed) return;
        completed = true;
        cleanup();
        resolve(value);
      },
      (cause) => {
        if (completed) return;
        completed = true;
        cleanup();
        reject(cause);
      },
    );
    if (signal.aborted) onAbort();
  });
}

function inspectProviderSource(
  source: TextDeltaVideoSource,
  includeRawProviderData: boolean,
): Promise<VideoProviderLifecycleResult> {
  // Attach rejection handlers before consuming text; several AI SDK result
  // fields reject together when provider metadata is unavailable.
  const finish = settle(source.finishReason);
  const rawFinish = settle(source.rawFinishReason);
  const usage = settle(source.totalUsage ?? source.usage);
  const metadata = settle(source.providerMetadata);
  const warnings = settle(source.warnings);
  const response = settle(source.response);
  const finalStep = settle(source.finalStep ?? source.lastStep);
  const steps = settle(source.steps);
  const requestedModel = settle(source.requestedModelId ?? source.modelId);
  const resolvedModel = settle(source.resolvedModelId);
  return Promise.all([
    finish,
    rawFinish,
    usage,
    metadata,
    warnings,
    response,
    finalStep,
    steps,
    requestedModel,
    resolvedModel,
  ]).then(([
    finishResult,
    rawFinishResult,
    usageResult,
    metadataResult,
    warningResult,
    responseResult,
    finalStepResult,
    stepsResult,
    requestedResult,
    resolvedResult,
  ]) => {
    const finishObject = record(finishResult.value);
    const finishReason = typeof finishResult.value === "string"
      ? finishResult.value
      : typeof finishObject?.unified === "string" ? finishObject.unified : undefined;
    const rawReason = typeof rawFinishResult.value === "string"
      ? rawFinishResult.value
      : typeof finishObject?.raw === "string" ? finishObject.raw : undefined;
    const providerWarnings: VideoWarning[] = [];
    if (Array.isArray(warningResult.value) && warningResult.value.length > 0) {
      providerWarnings.push(providerWarning("provider_warning", "The model provider reported a warning."));
    }
    if ([
      finishResult,
      rawFinishResult,
      usageResult,
      metadataResult,
      warningResult,
      responseResult,
      finalStepResult,
      stepsResult,
      requestedResult,
      resolvedResult,
    ].some(({ rejected }) => rejected)) {
      providerWarnings.push(providerWarning(
        "provider_diagnostics_unavailable",
        "Some provider diagnostics were unavailable.",
      ));
    }
    const stepList = Array.isArray(stepsResult.value) ? stepsResult.value : undefined;
    const finalStepValue = finalStepResult.value ?? stepList?.at(-1);
    const normalizedUsage = normalizeProviderUsage(usageResult.value, includeRawProviderData);
    const requestedModelId = requestedModelFromStep(finalStepValue)
      ?? normalizeModelId(requestedResult.value);
    const resolvedModelId = modelFromResponse(responseResult.value)
      ?? modelFromStep(finalStepValue)
      ?? normalizeModelId(resolvedResult.value);
    return {
      ...(finishReason ? { finishReason } : {}),
      ...(rawReason ? { rawFinishReason: rawReason } : {}),
      ...(normalizedUsage ? { usage: normalizedUsage } : {}),
      ...(includeRawProviderData && metadataResult.value !== undefined
        ? { providerMetadata: boundProviderValue(metadataResult.value) }
        : {}),
      ...(requestedModelId ? { requestedModelId } : {}),
      ...(resolvedModelId ? { resolvedModelId } : {}),
      warnings: providerWarnings,
    };
  });
}

/**
 * Adapt OpenAI, Anthropic, or another provider's incremental text deltas.
 * The provider must emit exactly one validated plan part per line.
 */
export function createTextDeltaVideoPlanner(
  options: TextDeltaVideoPlannerOptions,
): VideoPlanner {
  return async function* plan(context) {
    const source = options.streamText(context);
    const enriched = isEnrichedSource(source) ? source : undefined;
    const providerResult = enriched
      ? inspectProviderSource(enriched, options.includeRawProviderData ?? false)
      : undefined;
    if (providerResult) getGenerationLifecycleSink(context)?.registerProviderResult(providerResult);
    const textStream = enriched?.textStream ?? source as AsyncIterable<string>;
    let buffer = "";
    let explicitlyCompleted = false;
    for await (const delta of textStream) {
      if (typeof delta !== "string") throw new Error("The LLM adapter returned a non-text delta");
      buffer += delta;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        const part = parsePlanLine(line);
        if (part) {
          if (part.type === "plan.complete") explicitlyCompleted = true;
          yield part;
        }
        newline = buffer.indexOf("\n");
      }
    }
    const tail = buffer.trim();
    try {
      const part = parsePlanLine(tail);
      if (part) {
        if (part.type === "plan.complete") explicitlyCompleted = true;
        yield part;
      }
    } catch (error) {
      if (!tail.startsWith("{") || !isConfidentlyTruncatedJson(tail)) throw error;
      yield { type: "plan.complete", finishReason: "length" };
      explicitlyCompleted = true;
    }
    if (enriched) {
      const provider = await providerResultOrAbort(providerResult!, context.signal);
      if (provider === PROVIDER_RESULT_ABORTED) return;
      const standardReason = normalizeFinishReason(provider.finishReason);
      const rawReason = normalizeFinishReason(provider.rawFinishReason);
      const providerReason = standardReason && standardReason !== "other"
        ? standardReason
        : rawReason ?? standardReason;
      if (providerReason === "provider-error") {
        throw new Error("The model provider finished with an error");
      }
      if (providerReason === "tool-calls") {
        throw new Error("The model provider requested unsupported tool calls");
      }
      // A normal provider stop is not the protocol's explicit completion and
      // must not make a malformed response look complete.
      if (!explicitlyCompleted && (
        providerReason === "length" ||
        providerReason === "content-filter" ||
        providerReason === "other"
      )) {
        yield { type: "plan.complete", finishReason: providerReason };
      }
    }
  };
}
