# Changelog

VanillaSky follows semantic versioning. This changelog begins with the 0.1 beta.

## 0.1.0

Initial beta release for `@vanillaskyai/video`.

- Generates validated, editable videos from grounded application input through
  provider-neutral Vercel AI SDK streams.
- Supports OpenAI and Anthropic onboarding, with deterministic compatibility
  coverage for Google Gemini and OpenRouter.
- Provides React playback and generation hooks with typed status, warnings,
  errors, abort behavior, and public duration calculation.
- Enforces deterministic pacing, readable final calls to action, semantic brand
  contrast, and browser/server dependency boundaries.
- Persists versioned video snapshots for safe local replay without another
  model request.
- Includes deterministic test utilities and a source-owned template CLI for
  adding, editing, synchronizing, and checking project templates.
- Requires every HTTP handler to declare an authorization policy explicitly;
  the `"none"` escape hatch is reserved for intentionally private or in-process
  use.
- Keeps private supplied-media URLs out of model prompts, treats supplied media
  as an optional approved pool, and validates completed snapshots for replay.
- Reports proposed, accepted, and rejected scene counts alongside requested and
  actual duration, and uses `gpt-4.1` as the documented OpenAI planning baseline.
- Preserves a readable declared poster at the completed-video boundary and can
  reclaim unused closer reserve when a valid plan intentionally has no closer.

The API is beta. Review the frozen surface in `PUBLIC-API.md` before adopting
it in production.

### Compatibility

The `0.1.x` line preserves the documented public entry points and serialized
video round trips across patch releases. Pre-1.0 minor releases may change the
API with explicit release notes. The complete promise and intentional
exclusions are in [PUBLIC-API.md](PUBLIC-API.md).

### First release

This is the beginning of the fresh `@vanillaskyai/video` release line. Adopt
the package through the pinned quickstart and review
[PUBLIC-API.md](PUBLIC-API.md) before relying on the beta contract.
