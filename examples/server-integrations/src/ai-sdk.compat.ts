import assert from "node:assert/strict";

import { streamText as streamAIText, type LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
  createVideoHandler,
  type VideoGenerationSummary,
  type VideoHandlerOptions,
} from "@vanillaskyai/video/server";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

function createAIStream(model: LanguageModel): VideoHandlerOptions["streamText"] {
  return ({ systemPrompt, userPrompt, signal }) => streamAIText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    abortSignal: signal,
  });
}

function request(signal?: AbortSignal): Request {
  return new Request("https://app.example/api/video", {
    method: "POST",
    signal,
    body: JSON.stringify({
      protocolVersion: "0.4",
      requestId: "request-ai-sdk",
      input: { input: "Revenue reached 42 million." },
    }),
  });
}

async function verifyFinishMetadata(): Promise<void> {
  let summary: VideoGenerationSummary | undefined;
  const model = new MockLanguageModelV4({
    modelId: "compat-requested-model",
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "text-1" });
          controller.enqueue({
            type: "text-delta",
            id: "text-1",
            delta: '{"type":"scene.add","scene":{"id":"proof","templateId":"bigNumber","variables":{"texts":"Revenue","value":42,"label":"million"},"timing":{"fixedDuration":4}}}\n',
          });
          controller.enqueue({ type: "text-end", id: "text-1" });
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "length", raw: "max_output_tokens" },
            usage,
          });
          controller.close();
        },
      }),
    }),
  });
  const response = await createVideoHandler({
    authorize: "none",
    heartbeatMs: false,
    streamText: createAIStream(model),
    onComplete: (value) => { summary = value; },
  })(request());
  const body = await response.text();

  assert.match(body, /"type":"response\.complete"/);
  assert.match(body, /"finishReason":"length"/);
  assert.deepEqual(summary?.usage, {
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
  });
  assert.equal(summary?.finishReason, "length");
  assert.equal(summary?.requestedModelId, "compat-requested-model");
  assert.doesNotMatch(body, /inputTokens|outputTokens|totalTokens/);
}

async function verifyCancellation(): Promise<void> {
  let forwardedSignal: AbortSignal | undefined;
  let releaseSignal: (() => void) | undefined;
  const signalReady = new Promise<void>((resolve) => { releaseSignal = resolve; });
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      forwardedSignal = options.abortSignal;
      releaseSignal?.();
      return {
        stream: new ReadableStream({
          start(controller) {
            options.abortSignal?.addEventListener("abort", () => controller.close(), { once: true });
          },
        }),
      };
    },
  });
  const controller = new AbortController();
  let completionCount = 0;
  const response = await createVideoHandler({
    authorize: "none",
    heartbeatMs: false,
    streamText: createAIStream(model),
    onComplete: () => { completionCount += 1; },
  })(request(controller.signal));
  const bodyPromise = response.text();
  await signalReady;
  controller.abort("fixture cancellation");
  const body = await bodyPromise;

  assert.equal(forwardedSignal?.aborted, true);
  assert.match(body, /"type":"response\.abort"/);
  assert.equal(completionCount, 0);
}

await verifyFinishMetadata();
await verifyCancellation();
console.log("AI SDK StreamTextResult compatibility verified.");
