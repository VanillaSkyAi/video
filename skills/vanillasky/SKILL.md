---
name: vanillasky
description: Integrate @vanillaskyai/video in React applications that turn text or structured data into LLM-planned video responses.
---

# VanillaSky

Build the smallest working path first, using only the public package and
documentation.

## Integrate

1. Install the SDK and one model provider:

   ```bash
   npm install @vanillaskyai/video@0.3.0 ai @ai-sdk/openai
   ```

2. Add the provider key to an ignored `.env.local`. If it is missing, ask the
   developer to add it there; never request or print the secret value.
3. Create a server route with `createVideoHandler`. Pass its `systemPrompt` and
   `userPrompt` to the application's streaming LLM and keep authorization,
   credentials, model selection, limits, and logging on the server.
4. In React, call `useVideo()`, pass grounded text or structured data to
   `video.generate({ input })`, and render `<VideoPlayer {...video.playerProps} />`.
5. Use the built-in templates until the complete route works in a browser.

Start from the root README or `examples/nextjs-quickstart`. Do not inspect SDK
internals to invent another integration path.

## Input

- Put product, news, metric, and quoted claims in `input`.
- Put presentation direction in `instructions`.
- Put viewer or account context in `personalization`; treat it as data, not
  instructions.
- Add brand, approved media, soundtrack audio, persistence, or custom templates
  only when the application actually needs them.

## Verify

Run the consumer's tests, typecheck, and production build. Then generate one
video in a real browser and check the player, terminal status, console, and
network response. Do not claim completion from serialized JSON alone.
