import { cloneValue } from "./clone.js";
import { videoFixtures } from "./fixtures.js";
import type {
  MockProviderTextStream,
  MockVideoPlannerContext,
  MockVideoStreamPart,
} from "./types.js";

export interface MockVideoPlannerOptions {
  /** Select one of the fixed public scenarios. Defaults to `success`. */
  scenario?:
    | "success"
    | "delayed"
    | "truncated"
    | "invalidScene"
    | "providerFailure"
    | "contentFilter"
    | "abort"
    | "timeout";
  /** Replace the selected scenario with custom structural provider plan parts. */
  parts?: readonly MockVideoStreamPart[];
  /** Add a deterministic delay before every emitted provider text chunk. */
  delayMs?: number;
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("Request aborted");
}

function wait(durationMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, durationMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(abortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForAbort(signal: AbortSignal): Promise<never> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(abortError(signal)), { once: true });
  });
}

function fixtureParts(options: MockVideoPlannerOptions): readonly MockVideoStreamPart[] {
  if (options.parts) return options.parts;
  return videoFixtures.scenarios[options.scenario ?? "success"];
}

function providerFinishReason(parts: readonly MockVideoStreamPart[]): "stop" | "length" | "content-filter" {
  if (parts.some((part) => part.type === "mock.raw")) return "length";
  let completed: Extract<MockVideoStreamPart, { type: "plan.complete" }> | undefined;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index].type === "plan.complete") {
      completed = parts[index] as Extract<MockVideoStreamPart, { type: "plan.complete" }>;
      break;
    }
  }
  if (completed?.type === "plan.complete" && completed.finishReason === "content-filter") {
    return "content-filter";
  }
  if (completed?.type === "plan.complete" && completed.finishReason === "length") return "length";
  return "stop";
}

/**
 * Create the structural `streamText` function accepted by `createVideoHandler`.
 * It emits deterministic provider-style NDJSON and never constructs SDK events.
 */
export function createMockVideoPlanner(
  options: MockVideoPlannerOptions = {},
): (context: MockVideoPlannerContext) => MockProviderTextStream {
  const delayMs = options.delayMs ?? 0;
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error("Mock planner delayMs must be a non-negative finite number");
  }
  const configured = cloneValue(fixtureParts(options));
  const finishReason = providerFinishReason(configured);

  return ({ signal }) => {
    const parts = cloneValue(configured);
    return {
      textStream: (async function* () {
        for (const part of parts) {
          if (part.type === "mock.delay") {
            await wait(part.durationMs, signal);
            continue;
          }
          if (part.type === "mock.wait-for-abort") {
            await waitForAbort(signal);
          }
          if (part.type === "mock.error") throw new Error(part.message);
          if (delayMs > 0) await wait(delayMs, signal);
          if (part.type === "mock.raw") yield part.text;
          else yield `${JSON.stringify(part)}\n`;
        }
      })(),
      finishReason: Promise.resolve(finishReason),
    };
  };
}
