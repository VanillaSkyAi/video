# Secure LLM provider adapters

This page covers the planner boundary. For Pexels and other visual providers,
read [Media and audio](../media-and-audio.md#media-providers).

VanillaSky deliberately does not depend on a model provider or AI framework.
Your server owns the model and credentials; `createVideoHandler` accepts one
small `streamText` callback. The recommended adapter is the [AI SDK](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text),
which gives the application one `LanguageModel` interface across official,
community, AI Gateway, OpenAI-compatible, and custom providers.

## Recommended: AI SDK

Install the AI SDK plus the provider package your application chooses:

```bash
npm install ai @ai-sdk/openai
```

```ts
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createVideoHandler } from "@vanillaskyai/video/server";

const modelId = process.env.OPENAI_MODEL;
if (!modelId) throw new Error("Set OPENAI_MODEL in the server environment");

export const POST = createVideoHandler({
  authorize: verifySession,
  streamText: ({ systemPrompt, userPrompt, signal }) => streamText({
    model: openai(modelId),
    system: systemPrompt,
    prompt: userPrompt,
    abortSignal: signal,
  }),
});
```

Return the AI SDK `StreamTextResult` directly. It is structurally compatible
with VanillaSky's callback: VanillaSky reads `textStream`, finish metadata,
usage, safe provider warnings, provider metadata, and response/final-step model
metadata. Usage and model IDs are available only through the server-side
`onComplete` summary. Provider-native usage and metadata require the explicit
bounded `includeRawProviderData` opt-in and never enter SSE. The forwarded abort
signal cancels provider work when the request disconnects or the host timeout
fires.

Only the model expression changes:

- Use any [official AI SDK provider](https://ai-sdk.dev/providers/ai-sdk-providers).
- Use an [AI Gateway model ID](https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway).
- Use an [OpenAI-compatible provider](https://ai-sdk.dev/providers/openai-compatible-providers).
- Use a [community or custom provider](https://ai-sdk.dev/providers/community-providers)
  implementing the Language Model Specification.

The callback runs for every video request, so the application may select a
different model each time. A product can route routine planning to a cheap,
fast model and reserve a stronger model for difficult inputs without changing
VanillaSky or its protocol. The same boundary also accepts a self-hosted model
or a provider-native async text stream when it is not represented in the AI
SDK. VanillaSky has no model allowlist.

The provider must emit NDJSON text: one complete VanillaSky plan part per line.
The SDK buffers arbitrary text chunks until a newline, parses the completed
object, validates it, and only then forwards it to the motion runtime. Do not
replace that per-line validator with whole-response structured output: motion
streaming intentionally renders the first scene before the full composition is
complete.

## Advanced: native provider loops

Use the lower-level callback directly when the AI SDK does not expose a
provider-specific feature you need. `streamText` may return either an
`AsyncIterable<string>` or an object with `textStream` plus optional
`finishReason`, `rawFinishReason`, `usage`, `providerMetadata`, and
response/final-step metadata. Requested model IDs are read from the final
step's `model.modelId`; resolved IDs are read from response metadata. Prefer the
richer form when the native provider exposes completion metadata.

Provider retries remain host-owned. Retry only within an explicit request and
time budget, and never silently restart after visible output unless the host
has validated durable resume storage.

### OpenAI Responses API

```ts
import OpenAI from "openai";
import { createVideoHandler } from "@vanillaskyai/video/server";

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;
if (!apiKey || !model) throw new Error("Set OPENAI_API_KEY and OPENAI_MODEL");

const openai = new OpenAI({ apiKey });

export const POST = createVideoHandler({
  authorize: verifySession,
  streamText: async function* ({ systemPrompt, userPrompt, signal }) {
    const stream = await openai.responses.create({
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: true,
    }, { signal });

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") yield event.delta;
    }
  },
});
```

OpenAI documents the typed `response.output_text.delta` event in its
[Responses streaming guide](https://developers.openai.com/api/docs/guides/streaming-responses).

### Anthropic Messages API

```ts
import Anthropic from "@anthropic-ai/sdk";
import { createVideoHandler } from "@vanillaskyai/video/server";

const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL;
if (!apiKey || !model) throw new Error("Set ANTHROPIC_API_KEY and ANTHROPIC_MODEL");

const anthropic = new Anthropic({ apiKey });

export const POST = createVideoHandler({
  authorize: verifySession,
  streamText: async function* ({ systemPrompt, userPrompt, signal }) {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }, { signal });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
  },
});
```

Anthropic documents `content_block_delta` and `text_delta` in its
[Messages streaming guide](https://platform.claude.com/docs/en/build-with-claude/streaming).

## Optional web fetch and other tools

Keep tools server-side and outside the SDK core. Fetch or search before motion
generation, append only the approved grounded result to `input`, and
record provenance separately. Apply domain allowlists, SSRF protection,
timeouts, redirect limits, and response-size limits. Do not give a model a
general-purpose fetch tool unless the application truly needs one.
