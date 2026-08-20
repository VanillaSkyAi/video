# Next.js full-stack quickstart

This is the complete minimal route and page from the
[Next.js integration guide](../../docs/integrate-nextjs.md). Copy this directory,
then run these commands as written:

<!-- verify:start -->
```bash
npm install
cp .env.example .env.local
npm run build
npm run dev
```
<!-- verify:end -->

Before clicking **Generate video**, replace `replace-me` in `.env.local` with an
OpenAI API key. The default configuration is:

```bash
VIDEO_PROVIDER=openai
VIDEO_MODEL=gpt-4.1
```

To switch to Anthropic, change only the server configuration and add the key:

```bash
VIDEO_PROVIDER=anthropic
VIDEO_MODEL=your-available-claude-model
ANTHROPIC_API_KEY=your-key
```

The route and React component do not change. Both adapters use the Vercel AI
SDK, and the provider selector is imported only by server code.

The route deliberately authorizes only `localhost` and `127.0.0.1` while the
development command's local marker is present. This makes local development
explicit without turning the sample into an unauthenticated production
endpoint. Replace `authorize`
with your application's real session check before deploying; production
requests are denied until you do.

CI runs the commands above from a clean copy against the exact packed SDK
candidate matching the committed pin, loads the page in a browser, and confirms
that production requests fail closed with `401`. It does not call OpenAI. A
separate packed-artifact gate
injects deterministic AI SDK models at the provider boundary, clicks
**Generate video** for both provider configurations, and verifies streaming,
typed warnings, server-only usage, project-owned rendering, persistence,
saved replay, duration, completion, and final configuration without using a
provider key.

The verified path is intentionally small enough for a first-time developer to
reach the first video in less than 15 minutes. The generated video is saved to
browser storage and replayed through `parseVideo`; replace that local demo
storage with your authenticated application storage before deploying.
