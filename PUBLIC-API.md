# VanillaSky Video 0.1 public API

Status: frozen public beta contract for `0.1.0`.

This document defines the API that may enter the fresh
`@vanillaskyai/video` package. An export not listed here is internal. Tests and
the packed-package verifier must fail if the final package adds or removes an
export without changing this contract intentionally.

`tests/fixtures/public-api-signatures.json` is the reviewed normalized
declaration report for this surface. `npm run verify:api` checks the local build's
public names, complete reachable signatures, and runtime and declaration
dependency boundaries. `npm run verify:package` applies the same contract to the
exact packed artifact. Regenerate the report only as part of an intentional
public API review.

## Compatibility promise

- `0.1.x` patch releases do not make breaking changes to documented APIs or the
  serialized `Video` schema.
- A later `0.x` minor may make a breaking change only with release notes and a
  concrete adoption example.
- An API prefixed with `experimental_` may change in a patch. Canonical examples
  must pin an exact package version when they use one.
- Deprecated APIs remain usable until the next minor release. The `0.1`
  package starts without undocumented compatibility aliases.
- The package is ESM-only, targets ES2022, and supports Node.js 20 or newer.
- React is an optional peer dependency. Only `/react` and renderer definitions
  under `/templates` may depend on React.
- Framework adapters are examples, not separate public APIs. The release suite
  verifies current Next.js and Vite production builds.

The automated patch comparison is intentionally conservative. It requires
exact equality for every existing normalized declaration and reachable support
declaration because this report cannot distinguish input and output positions
safely. As a result, even optional field additions to an existing public type
fail the patch gate; use a pre-1.0 minor release unless a separately reviewed,
direction-aware compatibility check can prove the change safe. New exports,
wider supported peer ranges, and new optional peers remain additive.

## Environment boundaries

| Entry point | Environment | May import React | May import Node built-ins |
|---|---|---:|---:|
| `@vanillaskyai/video` | Universal | No | No |
| `@vanillaskyai/video/server` | Server | No | No required runtime built-ins |
| `@vanillaskyai/video/react` | Browser/React | Yes | No |
| `@vanillaskyai/video/templates` | Browser/React authoring | Yes | No |
| `@vanillaskyai/video/templates/catalog` | Universal JSON metadata | No | No |
| `@vanillaskyai/video/test` | Node test runners | No | Node test helpers allowed |

The CLI is exposed separately as the `vanillasky` binary.

## Root

The root contains serializable protocol types and pure helpers. It never starts
a request, renders React, imports a provider, or accesses browser globals.

### Values

- `getVideoDuration(video: Video): number`
- `parseVideo(value: unknown): Video`
- `VideoValidationError`

### Types

- `Video`
- `VideoAudio`
- `VideoBackground`
- `VideoBrand`
- `VideoInput`
- `VideoOrientation`
- `VideoScene`
- `VideoStyle`
- `VideoStyleOptions`
- `VideoSuppliedMedia`
- `VideoStatus`
- `VideoValidationErrorCode`

`VideoState` remains internal protocol reducer state. Browser consumers use the
normalized fields returned by `useVideo` instead.

## Server

The server entry point creates a customer-owned authenticated route. It accepts
the result of Vercel AI SDK `streamText()` directly while retaining a small
provider-neutral text-delta escape hatch.

### Values

- `createVideoHandler(options)`
- `createServerTemplateRegistry(options)`

### Types

- `VideoHandlerOptions`
- `ServerTemplateRegistry`
- `ServerTemplateMetadata`
- `VideoFinishReason`
- `VideoGenerationSummary`
- `VideoProviderUsage`
- `VideoWarning`
- `VideoWarningCategory`

### Handler contract

- `authorize` is required for HTTP handlers. Use `authorize: "none"` only for
  an intentionally non-public in-process/test handler.
- `streamText` receives the generated system prompt, grounded user prompt, and
  the request `AbortSignal`.
- `invalidPartBehavior` is `"drop" | "fail"`. A behavior selector is never
  named like a callback.
- `onWarning` receives safe typed warnings.
- `onComplete` receives one server-only `VideoGenerationSummary` after an
  actual `response.complete`; errors and aborts do not invoke it.
- `onError` receives the full internal server error. Client responses remain
  redacted and typed separately.
- Provider usage, raw usage, provider metadata, and model identifiers remain
  server-side unless the host deliberately persists them.
- Provider-native usage and metadata require the bounded
  `includeRawProviderData` opt-in.
- `snapshotRetention` opts into individually bounded source, instructions, or
  supplied-media URL metadata; all are omitted by default.
- Provider credentials, provider selection, authentication, rate limiting,
  provider retries, logging, and tracing remain host-owned.
- Request cancellation always reaches the provider through `AbortSignal`.
- Callback failures are isolated and never alter the video response.

## React

### Values

- `useVideo(options?)`
- `VideoPlayer`
- `VideoError`

### Types

- `UseVideoOptions`
- `UseVideoResult`
- `VideoPlayerProps`
- `VideoErrorOptions`

`UseVideoResult` has this conceptual shape:

```ts
interface UseVideoResult {
  generate(input: VideoInput): Promise<Video>;
  abort(reason?: string): void;
  video?: Video;
  status: VideoStatus;
  error?: VideoError;
  warnings: readonly VideoWarning[];
  playerProps: VideoPlayerProps;
}
```

`VideoPlayer` accepts either streaming player props or a completed saved video:

```tsx
<VideoPlayer {...video.playerProps} />
<VideoPlayer video={savedVideo} />
```

Saved-video playback performs no generation request. `VideoPlayerBinding` and
the internal reducer state are not public types.

## Template authoring

The template entry point owns React render definitions only. React-free server
metadata registries are created through `/server`.

### Values

- `defineTemplate(definition)`
- `createTemplateRegistry(options)`

### Types

- `TemplateDefinition`
- `TemplateExample`
- `TemplateJsonSchema`
- `TemplateFamily`
- `TemplateTimingMetadata`
- `TemplateTransitionTiming`
- `TemplateRegistry`
- `SceneTemplate`
- `SceneTemplateMetadata`
- `SceneTemplateProps`

`SceneTemplateProps.progress` is always the raw `0 → 1` scene clock.
Transition-enabled templates may use the optional `motionProgress` clock for
presentation motion; the renderer-owned overlap never prevents that clock from
reaching `1` across the complete template lifecycle. Their metadata must provide
`transitionTiming.entryReadyProgress` and `transitionTiming.holdProgress`.

Template timing uses `preferredDuration`; `duration` is not part of the
package. `AuthoringTemplate` is inferred and internal.

## Built-in catalog

The catalog entry point is JSON-safe metadata. It does not contain renderers.

### Values

- `builtinTemplates`

### Types

- `BuiltinTemplateId`
- `BuiltinTemplateMetadata`

Template family and timing types have one canonical home under `/templates`.

## Test utilities

The test entry point allows deterministic consumer tests without provider
credentials or model spend.

### Values

- `createMockVideoPlanner(options?)`
- `simulateVideoStream(parts, options?)`
- `videoFixtures`

### Types

- `MockVideoPlannerOptions`
- `SimulatedVideoStreamOptions`

The fixtures cover successful generation, delayed streaming, truncation,
invalid scenes, provider failure, content filtering, abort, and timeout.

## CLI

The `vanillasky` binary supports:

- `list`
- `describe`
- `create`
- `add`
- `sync`
- `check`
- `add --dry-run`
- `add --diff`

Generated customer files import only the public entry points in this document.
Browser registries import `createTemplateRegistry` from `/templates`. Server
registries import `createServerTemplateRegistry` and `ServerTemplateMetadata`
from `/server` without crossing a React type boundary.

## Serialized video

- A completed `Video` is JSON-serializable and may be stored by the host.
- Every completed value carries the required storage field
  `schemaVersion: "0.1"`; it is independent from streaming protocol `0.4`.
- `parseVideo(value: unknown)` is the strict universal storage boundary. It
  validates the full document and returns a detached, deeply frozen `Video`.
- JSON serialization remains platform-native; the SDK has no redundant public
  serializer.
- Patch releases preserve round-trip compatibility.
- The 0.1 contract supports the current schema only. It has no compatibility
  aliases or implicit coercions.
- Invalid documents throw `VideoValidationError` with `invalid_video`.
  Unsupported future or unknown versions use `unsupported_video_version` and
  fail before any renderer runs; they are never rendered partially.
- Raw prompts, provider payloads, and credentials are never retained by
  default.
- Raw source, instructions, and the supplied-media URL index are opt-in and
  bounded. Hosts own the database, storage, tenant policy, deletion, and media
  URL expiry.
- Replay through `<VideoPlayer video={savedVideo} />` never calls an LLM.
- Completion checksums detect accidental drift only; they do not provide
  authenticity, authorization, or tenancy security.

## Intentionally excluded from 0.1

- Provider-specific OpenAI or Anthropic wrapper clients.
- Rendering/export infrastructure.
- Hosted persistence.
- OpenTelemetry integration.
- Automatic factual verification or scene repair.
- `useVideo(initialVideo)`.
- Undocumented API aliases.
