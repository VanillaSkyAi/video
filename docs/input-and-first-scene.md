[← Documentation home](../README.md) · [Previous: Provider integration](provider-integration.md) · [Next: Branding and personalization →](branding-and-personalization.md)

# Raw input and the opening

`VideoInput` is the small boundary between application truth and creative planning.

```ts
import type { VideoInput } from "@vanillaskyai/video";

const input: VideoInput = {
  input: "Maya completed 142 customer conversations in Q2.",
  knowledgeMode: "input-only",
  instructions: "Celebrate the result. Never alter a metric.",
  opening: "Maya, your Q2 customer impact recap is ready.",
  personalization: { firstName: "Maya", period: "Q2", role: "Product leader" },
  brand,
  suppliedMedia,
  audio: { src: "/audio/calm.mp3" },
  orientation: "portrait",
  maxDurationSec: 24,
};
```

## Raw source

In the default `input-only` mode, put every fact the response may claim in
`input`. Use plain text, compact JSON, or a server-produced digest. Include
units, periods, comparison bases, and provenance identifiers where ambiguity
is possible. Choose `knowledgeMode: "general"` only when the model should use
stable general knowledge to answer a question or develop content. Creative
direction in `instructions` never changes that setting.

Bound request bytes and reject secret-shaped fields on the server. Do not pass provider keys, authorization headers, internal prompt fragments, or storage credentials as source material.

## Opening

`opening` becomes a deterministic `media` scene emitted before provider work.
When callers omit it, the SDK uses `Creating your video...`; a supplied value
replaces that fallback. The scene contains only that sentence and explicitly
uses the brand gradient without stock media. The SDK requests a three-second
opening, then applies its normal readability and overall-duration budget. It
owns the scene ID, template, variables, and timing so callers only provide
optional custom copy. That copy should:

- be personal or situational enough to feel intentional;
- require no network media lookup;
- remain true if generation later fails;
- be one concise sentence that fits comfortably in both supported orientations;
- be part of the final story, not a spinner disguised as a scene.

Pass `opening: false` when the application should own the waiting experience:

```ts
opening: false
```

The SDK then starts with an empty timeline and emits the first validated,
generated scene as soon as it is ready. Render a transient loading state in the
host application until `video.video?.scenes.length` is non-zero. That loading
state is not persisted in the event stream or completed video. A generated
scene is still required; a planner that completes without one fails the run.

The deterministic opening is runtime-owned, so it remains available even when `templateIds`
does not let the planner select `media` for generated body scenes.
