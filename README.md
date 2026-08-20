# Give your AI a video output

![Version 0.2.0 beta](https://img.shields.io/badge/version-0.2.0_beta-7c3aed)

**VanillaSky is the open-source video response layer.** Turn text, structured
data, and live application context into personalized video responses that start
playing while your LLM composes them.

> **Status: Beta.** VanillaSky is pre-1.0 and its public API may change as we
> test it in real applications. Pin an exact version before production use.

Your application owns the model, data, authentication, and UI. VanillaSky owns
the planning prompt, trusted templates, validation, streaming, and player.

## Start

For humans:

```bash
npm install @vanillaskyai/video@0.2.0 ai @ai-sdk/openai
```

For coding agents:

```bash
npx skills add VanillaSkyAi/video@vanillasky
```

Then prompt: `Use $vanillasky to turn this application's data into a personalized video response.`

Add your model key to an ignored `.env.local`:

```bash
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-4.1
```

## Connect your LLM

Create one authenticated server route:

```ts
// app/api/video/route.ts
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

The local authorization denies every production request. Replace it before
deploying. The model can come from OpenAI, Anthropic, an AI SDK registry or
gateway, or any compatible streaming adapter.

For planner-selected image and video backgrounds, configure the optional
server-only `resolveMedia` callback described in
[Media and soundtrack audio](docs/media-and-audio.md#media-providers).

## Generate a video

Call the route from React and render the player:

```tsx
"use client";

import { VideoPlayer, useVideo } from "@vanillaskyai/video/react";

export function VideoResponse() {
  const video = useVideo();

  return <>
    <button onClick={() => { void video.generate({
      input: "Activation increased from 41% to 58% after guided onboarding.",
      personalization: { firstName: "Maya" },
    }); }}>
      Generate video
    </button>

    {video.error && <p role="alert">Video generation failed.</p>}
    <VideoPlayer {...video.playerProps} />
  </>;
}
```

That is the complete path. Built-in templates require no setup. VanillaSky
shows each complete, validated scene as soon as it is ready and returns a
deterministic `Video` object when generation finishes.

A copy-and-run app is in
[`examples/nextjs-quickstart`](https://github.com/VanillaSkyAi/video/tree/v0.2.0/examples/nextjs-quickstart).

## Shape the response

Start with `input`, the complete factual boundary for the video:

```ts
video.generate({
  input: JSON.stringify({
    period: "Q2",
    activation: { previous: 41, current: 58 },
    cause: "guided onboarding",
  }),
  instructions: "Lead with the improvement, then explain what changed.",
  personalization: { firstName: "Maya", plan: "Pro" },
});
```

- Put claims, numbers, names, dates, and quotations in `input`.
- Put presentation direction in `instructions`.
- Put viewer or account context in `personalization`.
- Add brand, approved media, soundtrack audio, or a smaller template set only
  when the experience needs them.

VanillaSky does not provide an LLM, hosted generation service, narration, TTS,
or speech synchronization. MP4/WebM encoding and export are application-owned.
Completed videos can be stored as JSON and replayed without calling the LLM.

Custom templates are optional. Only source-owned templates need the local TSX
compiler: `npm install --save-dev tsx`.

## Documentation

| Goal | Guide |
| --- | --- |
| Integrate with a coding agent | [Agent integration guide](docs/agent-integration.md) |
| Build the first response | [Getting started](docs/getting-started.md) |
| Copy the Next.js route and component | [Next.js integration](docs/integrate-nextjs.md) |
| Connect another model | [Provider integration](docs/provider-integration.md) |
| Understand grounding and prompts | [Prompt and input](docs/prompt-and-input.md) |
| Add brand or viewer context | [Branding and personalization](docs/branding-and-personalization.md) |
| Add media or soundtrack audio | [Media and soundtrack audio](docs/media-and-audio.md) |
| Persist and replay results | [Persistence and replay](docs/persistence.md) |
| Create source-owned templates | [Custom templates](docs/custom-templates.md) |
| Test routes and streams | [Test integrations](docs/testing.md) |
| Deploy securely | [Production](docs/production.md) · [Security](docs/security.md) |
| Inspect the API contract | [Public API](PUBLIC-API.md) · [Protocol](docs/reference/protocol.md) |

Apache-2.0
