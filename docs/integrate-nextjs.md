[← Documentation home](../README.md) · [Previous: Getting started](getting-started.md) · [Next: Provider integration →](provider-integration.md)

# Next.js integration

Install VanillaSky and one AI SDK provider:

```bash
npm install @vanillaskyai/video@0.3.4 ai @ai-sdk/openai
```

Create an ignored `.env.local`:

```bash
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-4.1
```

Create `app/api/video/route.ts`:

```ts
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createVideoHandler } from "@vanillaskyai/video/server";

const model = openai(process.env.OPENAI_MODEL ?? "gpt-4.1");

const handle = createVideoHandler({
  // Local development only. Replace with your session check before deploying.
  authorize: (request) => {
    if (process.env.VANILLASKY_LOCAL_DEMO !== "1") return false;
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

The packaged `npm run dev` command supplies this non-secret marker only to
`next dev`. Production builds and `next start` never receive it.

Create a Client Component:

```tsx
"use client";

import { VideoPlayer, useVideo } from "@vanillaskyai/video/react";

export function Video() {
  const video = useVideo();
  return <>
    <button onClick={() => { void video.generate({
      input: "Activation increased from 41% to 58%.",
      personalization: { firstName: "Maya" },
    }); }}>
      Generate
    </button>
    {video.error && <p role="alert">Could not generate the video.</p>}
    <VideoPlayer {...video.playerProps} />
  </>;
}
```

That is the complete first path. Built-in templates need no registry setup.
The development authorization accepts only local requests and denies production
requests; replace it with your application's session validation before
deploying.

The copy-and-run app is in the
[`examples/nextjs-quickstart` directory](https://github.com/VanillaSkyAi/video/tree/v0.3.4/examples/nextjs-quickstart).

For another LLM, replace `openai(...)` with the matching AI SDK model. The route
shape and React code stay the same. See [Provider integration](provider-integration.md)
for adapters, authentication, diagnostics, and production controls. Add media,
audio, persistence, or custom templates only after the default path works.
