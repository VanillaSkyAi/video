[← Documentation home](../README.md) · [Previous: Next.js](integrate-nextjs.md) · [Next: Input and first scene →](input-and-first-scene.md)

# Provider integration

The model connection enters the SDK through `streamText` in
`src/server/create-video-handler.ts`. The SDK does not instantiate or choose a
model; the application passes the generated `systemPrompt` and `userPrompt` to
its provider here.

Use the AI SDK as the normal app-owned provider adapter. Any AI SDK
`LanguageModel` works. Keep selection in one server-only module so OpenAI and
Anthropic use the same route and React component:

```ts
import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createVideoHandler } from "@vanillaskyai/video/server";

const provider = process.env.VIDEO_PROVIDER;
const modelId = process.env.VIDEO_MODEL;
if (!modelId) throw new Error("Set VIDEO_MODEL in the server environment");
const model = provider === "openai" ? openai(modelId)
  : provider === "anthropic" ? anthropic(modelId)
    : (() => { throw new Error("Set VIDEO_PROVIDER to openai or anthropic"); })();

export const POST = createVideoHandler({
  authorize: verifySession,
  streamText: ({ systemPrompt, userPrompt, signal }) => streamText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    abortSignal: signal,
  }),
});
```

The AI SDK result can be returned directly: its `textStream`, `finishReason`,
`rawFinishReason`, usage, provider metadata, warnings, and response metadata
match VanillaSky's structural callback contract. Keep the
provider, model, and credentials on the server. The callback runs per request,
so an application can route cheap/fast and high-capability models through the
same handler without adding a VanillaSky abstraction. See
[provider adapter reference](reference/provider-adapters.md) for model alternatives and advanced native
provider loops.

## Planning effort and reasoning modes

Planning is a structured emit against a trusted catalog, not a reasoning task.
Where a provider exposes a reasoning or effort control, a host that wants a
video to start quickly should turn extended reasoning off and keep effort low
to moderate. The default matters: several current models reason by default, and
that reasoning happens before the first plan part is emitted, so it is added
directly to time to first generated scene.

With the Vercel AI SDK and a current Anthropic model, that is one option object:

```ts
streamText: ({ systemPrompt, userPrompt, signal }) => streamText({
  model,
  system: systemPrompt,
  prompt: userPrompt,
  abortSignal: signal,
  providerOptions: {
    anthropic: { thinking: { type: "disabled" }, effort: "medium" },
  },
}),
```

Measured on one grounded chat answer with the 28 built-in templates, leaving
the Anthropic default in place cost roughly twenty seconds before the first
scene; disabling reasoning brought the same plan to a few seconds. Other
providers expose equivalent controls under their own names. Treat the exact
values as host-owned tuning: the lowest effort setting is the fastest, but a
weaker plan misses schema limits more often, which shows up as rejected scenes
in `onComplete`. Compare `timeToFirstSceneMs` and `rejectedSceneCount` across
settings before fixing one.

VanillaSky never sets these controls. Provider selection, sampling parameters,
and credentials stay with the application.

## Completion and usage

Use `onComplete` for server-side cost and completion measurement:

```ts
createVideoHandler({
  authorize: verifySession,
  streamText: ({ systemPrompt, userPrompt, signal }) => streamText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    abortSignal: signal,
  }),
  onWarning: (warning) => logSafeWarning(warning.code, warning.category),
  onComplete: (summary) => recordGeneration({
    finishReason: summary.finishReason,
    usage: summary.usage,
    requestedModelId: summary.requestedModelId,
    resolvedModelId: summary.resolvedModelId,
    totalDurationMs: summary.totalDurationMs,
  }),
  onError: (error) => recordPrivateFailure(error),
});
```

`onComplete` fires once only after `response.complete`. It does not fire for a
terminal error, abort, disconnect, or timeout. Callback failures are isolated
from the event stream. Normalized token usage and model IDs remain server-only;
they never enter SSE or the persisted `Video`. Set `includeRawProviderData:
true` only when the host deliberately needs bounded provider-native usage and
metadata and has an appropriate retention policy.

`acceptedSceneCount`, `rejectedSceneCount`, and `timeToFirstSceneMs` describe
model-generated scene additions; a deterministic supplied opening is not
counted. Their sum is the proposed scene count. `videoDurationSec` is the
duration actually committed; compare it with the `maxDurationSec` supplied by
your application when applying a retry policy. These fields provide a
server-side quality signal without exposing model metadata in the browser.
Warnings include the same bounded typed warnings emitted to the client.
`plan_incomplete` identifies a playable partial response whose planner reported
a length limit; applications should show that result as incomplete and may
offer a bounded retry with a larger output or duration budget.
`plan_missing_closer` identifies a playable plan that ended without the
explicit final scene required by the standard handler. `createVideoHandler`
sets `requireCloser: true` by default. Specialized deterministic integrations
may set `requireCloser: false`; ordinary AI planners should keep the default.
For non-interactive backfills, define an application threshold (for example,
no rejected scenes and a useful committed-duration ratio) and retry a bounded
number of times. Keep the best accepted result rather than treating
`finishReason: "stop"` alone as a quality score.

The generated system prompt includes the selected trusted-template catalog and
is intentionally substantial. It is stable for the same SDK version, template
kit, media policy, and base prompt. Record input-token usage, keep the selected
kit no broader than the product needs, and enable provider-side prompt caching
where the chosen provider/model supports it. VanillaSky does not assume one
provider's cache controls in its provider-neutral adapter. With the 28 built-in
templates, the current catalog prompt is roughly 28,000 characters (about
7,000 tokens before user input; tokenizer-dependent); provider-reported usage
is the authoritative measurement.

Provider finish reasons `error` and `tool-calls` are terminal failures.
`length` and `content-filter` may complete with already accepted scenes; a
truncation before the first generated scene fails instead of returning an empty
success. The request signal is forwarded to the provider. Configure route and
provider timeouts with that signal, and keep retries host-owned and within the
same explicit request budget.

## Product-level planner guidance

`createVideoHandler` constructs the planner prompt from the generated server
template registry. Normal integrations do not build prompts or capabilities.
Use the handler's `basePrompt` option only for durable product-level direction.
`VideoInput.knowledgeMode` owns the knowledge boundary: `input-only` is strict
and remains the default, while `general` permits stable model knowledge.
Presentation guidance in `basePrompt` or `instructions` never changes it.
