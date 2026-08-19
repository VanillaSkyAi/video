# Server examples

The normal example uses the AI SDK's `streamText`, so any AI SDK `LanguageModel`
works without VanillaSky owning the provider, model, or credentials. Replace
`openai(modelId)` in `src/ai-sdk.ts` with an official provider, community
provider, AI Gateway model, OpenAI-compatible provider, or custom model.

`src/provider-neutral.ts` and `src/openai.ts` show the lower-level text-delta
escape hatch for applications that need to own the native provider loop.

<!-- verify:start -->
```bash
npm install
npm run typecheck
npm run ai-sdk:compat
```
<!-- verify:end -->

Use the returned Web `Request` → `Response` handler directly in Next.js, Hono,
Remix, Cloudflare Workers, or another standards-based server runtime.
