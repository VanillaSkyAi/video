[← Documentation home](../README.md) · [Previous: Provider integration](provider-integration.md) · [Next: Branding and personalization →](branding-and-personalization.md)

# Raw input and the opening

`VideoInput` is the small boundary between application truth and creative planning.

```ts
import type { VideoInput } from "@vanillaskyai/video";

const input: VideoInput = {
  input: "Joris completed 142 customer conversations in Q2.",
  instructions: "Celebrate the result. Never alter a metric.",
  opening: "Joris, your Q2 recap is ready.",
  personalization: { firstName: "Joris", period: "Q2" },
  brand,
  suppliedMedia,
  audio: { src: "/audio/calm.mp3" },
  orientation: "portrait",
  maxDurationSec: 24,
};
```

## Raw source

Put every fact the response may claim in `input`. Use plain text, compact JSON, or a server-produced digest. Include units, periods, comparison bases, and provenance identifiers where ambiguity is possible. Keep creative direction in `instructions`; it may change emphasis and tone but cannot expand the factual boundary.

Bound request bytes and reject secret-shaped fields on the server. Do not pass provider keys, authorization headers, internal prompt fragments, or storage credentials as source material.

## Opening

When supplied, `opening` becomes a deterministic five-second `notification`
scene emitted before provider work. The SDK owns its scene ID, template, variables,
and timing so callers only provide the copy. It should:

- be personal or situational enough to feel intentional;
- require no network media lookup;
- remain true if generation later fails;
- fit comfortably in both supported orientations;
- be part of the final story, not a spinner disguised as a scene.

Omit `opening` when the generated story should begin with its first planned scene.
