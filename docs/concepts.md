[← Documentation home](../README.md) · [Previous: Getting started](getting-started.md) · [Next: Streaming protocol →](streaming-protocol.md)

# Core concepts

## Video response

A video response is a short, responsive animated experience assembled from
trusted templates. It begins before the full plan is available and ends as an
editable deterministic configuration.

It is not an encoded video stream. The browser renders normal React components
from validated scene instructions. The 0.1 SDK does not include MP4 or WebM
encoding; pass the completed deterministic JSON to an application-owned render
or export pipeline when an encoded file is required.

## Input

`VideoInput` is the factual and creative boundary:

- `input`: raw source material such as a roadmap update, launch brief, article,
  curated set of articles, metrics, events, notes, or an AI answer. It may be
  short, but the planner is designed to distill larger sources into a concise
  video rather than represent every fact;
- `instructions`: optional creative direction that cannot override facts;
- `opening`: optional custom copy for the deterministic opening; omission uses
  `Creating your video...`;
- `personalization`: application-defined fields such as name, role, account,
  period, goal, or onboarding partner;
- `brand`: an optional background preset plus name, logo, font, surfaces, and
  advanced exact tokens;
- `suppliedMedia`: approved images or videos with a role and description;
- `audio`: omit for automatic selection, pass `{ src }`, or use `false` for silence;
- `orientation` and `maxDurationSec`: composition constraints.

## Template kit

VanillaSky uses its trusted built-in kit by default. Applications only configure
a kit when they need project-owned templates. Those templates replace matching
built-in IDs and add new IDs while every untouched built-in remains available.
A kit supplies three things together:

1. React components for the player;
2. advertised template capabilities for protocol negotiation;
3. an LLM catalog describing when and how each template may be used.

The planner cannot legitimately select a template outside the active kit.

## Planner

The server-side planner turns the input into small plan parts such as
`scene.add`, `scene.patch`, `asset.patch`, and `plan.complete`. A planner may be
recorded, deterministic, backed by OpenAI or Anthropic, or implemented with
another streaming text model.

The planner does not create public event IDs, checksums, revisions, or final
snapshots. The runtime owns those guarantees.

`createVideoHandler` asks the planner to emit one early
`scene.add` with `placement: "closer"` after the first playable body scene.
That placement is planner-only: the runtime holds the validated closer,
reserves its readable duration while later body scenes stream, and appends it
last without persisting `placement` into the completed `Video`.

| Boundary | Type | Owner |
| --- | --- | --- |
| Planner parts | Internal validated plan data | Server/provider adapter |
| Values read from `response.stream` | `VideoEvent` | SDK runtime |
| Terminal editable result | `Video` via `response.result` | SDK reducer |

A planner must never yield `VideoEvent` envelopes. It yields plan
parts; the runtime validates them and creates the public event metadata.

## Event stream

The runtime emits ordered protocol events:

```text
response.start
audio.set             optional, before any scene
scene.add             supplied opening
scene.add             generated body
scene.add             generated body
scene.add             reserved closer
response.complete     exact terminal snapshot
```

Network transport uses SSE. Direct in-process integrations expose the same
events as an async iterable.

## Playback and buffering

The player renders the first committed scene and continues through the known
timeline. Audio can loop during a generation gap. A media-bearing scene should
not be committed until its asset is ready; start generated content with a
typography-led scene so useful playback does not wait on media lookup.

Played scenes cannot be patched. This keeps playback deterministic and avoids a
scene changing after the viewer already saw it.

The same player accepts a completed value directly. After persisting the JSON,
load it through `parseVideo(JSON.parse(storedJson))`, then render
`<VideoPlayer video={savedVideo} />` to replay it without opening a stream or
calling the model again. Supply `templates` only when that video uses
customer-owned templates. See [Persistence and replay](persistence.md) for the
complete storage contract.

## Completion snapshot

`response.complete` contains the exact reduced `Video` plus a
checksum. Persist the snapshot when you need replay, resume, export, analytics,
or an editing handoff. The event log can also be persisted and revalidated.

Read the complete [Protocol 0.4](reference/protocol.md) and the separate
[persisted Video 0.1 contract](persistence.md).
