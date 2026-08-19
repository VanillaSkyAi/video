[← Documentation home](../README.md) · [Next: Getting started →](getting-started.md)

# Agent integration

Use the same public path a human developer uses. The optional repository skill
packages these instructions for coding agents:

```bash
npx skills add VanillaSkyAi/video@vanillasky
```

## Build the first response

1. Install `@vanillaskyai/video`, `ai`, and one model provider.
2. Put the provider key in an ignored `.env.local` file.
3. Connect the application's LLM with `createVideoHandler` in an authenticated
   server route.
4. Pass grounded text or structured data as `input`.
5. Call `useVideo()` and render `VideoPlayer` in React.
6. Verify one complete response in a browser before adding optional features.

The root README and `examples/nextjs-quickstart` are the canonical working
reference. Built-in templates require no registry setup.

## Keep responsibilities clear

VanillaSky owns the planning prompt, trusted templates, validation, streaming
protocol, and player. The application owns its LLM, credentials,
authentication, source retrieval, media licensing, persistence, and product
UI.

Use `input` for facts the video may claim, `instructions` for presentation
direction, and `personalization` for viewer or account context. Treat all three
as untrusted application data. Add brand, media, audio, persistence, or custom
templates only when the requested experience needs them.

If a required credential is missing, ask the developer to add it to the ignored
environment file. Never invent another provider or request secret values in
chat.
