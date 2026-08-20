[← Documentation home](../README.md) · [Previous: Prompt and input](prompt-and-input.md) · [Next: Next.js →](integrate-nextjs.md)

# Getting started

Install VanillaSky:

```bash
npm install @vanillaskyai/video@0.1.1 ai @ai-sdk/openai
```

Set your provider key in `.env.local` (never commit it):

```bash
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-4.1
```

Create one authenticated server route with `createVideoHandler`. Connect your
provider through `streamText`; keep the model, credentials, authentication, rate
limits, and media policy on the server:

```ts
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createVideoHandler } from "@vanillaskyai/video/server";

const model = openai(process.env.OPENAI_MODEL ?? "gpt-4.1");

const handle = createVideoHandler({
  // Local development only. Replace with your session check before deploying.
  authorize: (request) => {
    if (process.env.NODE_ENV !== "development") return false;
    const hostname = new URL(request.url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  },
  streamText: ({ systemPrompt, userPrompt, signal }) => streamText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    abortSignal: signal,
  }),
});

export const POST = handle;
export const OPTIONS = handle;
```

The local bypass is intentionally fail-closed: it accepts only localhost while
Next.js is in development and denies every production request. Replace it with
your real session validation before deploying. For literal files and commands,
use the tested
[`examples/nextjs-quickstart` directory](https://github.com/VanillaSkyAi/video/tree/v0.1.1/examples/nextjs-quickstart).

`model` can come from any AI SDK provider, registry, gateway, compatible API,
or custom implementation. The application can choose a cheaper or faster model
per request without changing VanillaSky.

Call that route from React and render the player:

```tsx
"use client";

import { VideoPlayer, useVideo } from "@vanillaskyai/video/react";

export function GeneratedVideo({ input }: { input: string }) {
  const video = useVideo();

  return <>
    <button onClick={() => { void video.generate({ input }); }}>Generate video</button>
    {video.error && <p role="alert">Video generation failed.</p>}
    <VideoPlayer {...video.playerProps} />
  </>;
}
```

No template setup is required. VanillaSky advertises the trusted built-in
catalog to your LLM, validates its selected scenes, and lazy-loads only the
renderers the video uses.

`useVideo()` uses `/api/video` by default. Pass `endpoint` to use another route.
`generate()` returns a `Promise<Video>` if you need the completed config directly:

```ts
const completedVideo = await video.generate({ input });
```

The promise resolves only after successful completion. It rejects on terminal
generation errors and aborts; `video.error` contains the same typed error for
reactive UI.

`video.status` is `idle`, `streaming`, `complete`, `error`, or `aborted`.
`video.video` is the latest deterministic video, and `video.warnings` contains
bounded typed diagnostics safe to show or branch on. A playable response that
stops at a planner length limit includes a `plan_incomplete` warning because
requested scenes or the ending may be missing. Provider finish reasons and
content-filter details remain available to the server through the `onComplete`
summary; surface that server-owned state separately when completeness matters
to your product.

Persist a completed `Video` as JSON and play it later without another model
request:

```tsx
<VideoPlayer video={savedVideo} />
```

Built-in templates work without additional props. Pass `templates` when the
saved video uses customer-owned templates.

All other input controls are optional. Continue with [input and opening
scenes](input-and-first-scene.md), [branding and personalization](branding-and-personalization.md),
or [media and soundtrack audio](media-and-audio.md). To edit or create visual
building blocks, see [custom templates](custom-templates.md).
