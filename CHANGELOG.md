# Changelog

VanillaSky follows semantic versioning. This changelog begins with the 0.1 beta.

## Unreleased

- Documents closer eligibility: a template may close a video only when its
  `jobs` include `"ask"` or `"payoff"`, with the catalog filter an application
  can use to constrain how its videos end.
- Documents provider reasoning and effort controls for planning: models that
  reason by default add that time directly to the first generated scene, so
  hosts that want a video to start quickly should disable extended reasoning
  and tune effort against `timeToFirstSceneMs` and `rejectedSceneCount`.
- Uses a three-second, gradient-backed `media` opening with
  `Creating your video...` whenever `VideoInput.opening` is omitted, while
  preserving supplied opening copy and keeping body-template selection
  independent from the runtime-owned opening.

## 0.2.0

- Adds an application-owned `resolveMedia` hook that turns bounded semantic
  media intent into approved image or video backgrounds without exposing
  provider credentials, unresolved queries, or untrusted URLs to clients.
- Requires one grounded closer by default, holds it while body scenes stream,
  and emits it last so complete videos finish on a payoff or supplied call to
  action instead of an arbitrary body scene.
- Improves planning for rich inputs with adaptive scene counts, coherent
  multi-entry sequencing, reusable best-fit templates, and explicit partial
  completion warnings when provider or duration limits truncate the plan.
- Adds `VideoPlaybackMode` with sound-first interaction, repeat-stream
  autoplay, manual, muted-autoplay, and immediate-autoplay policies.
- Renders `VideoInput.opening` as a deterministic, asset-free gradient media
  scene and preserves it as the visible start poster before playback.
- Resets replacement streams as fresh playback sessions, keeps completed end
  frames stable, and provides a replay control instead of replaying exit
  animation at the terminal boundary.

## 0.1.1

No runtime changes: the public API, behavior, and dependencies are identical to
0.1.0. This release replaces the 0.1.1-beta line and moves `latest` onto a
single, current version so the repository, npm, and vanillasky.ai agree.

- Simplified the release process to a version bump, an annotated tag on `main`,
  and an OIDC publish. Changesets, the generated Version Packages branch, and
  the npm-latest compatibility gate are removed; the tag job now packs a commit
  CI has already verified instead of re-running the suite.

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
