[← Documentation home](../README.md) · [Next: Generate your first video →](getting-started.md)

# Prompt and input

VanillaSky separates application truth from visual direction. You provide the
facts and your server-side model. VanillaSky supplies the planner contract that
turns those facts into a finite sequence of trusted scenes.

## The four layers

### 1. VanillaSky system prompt

`createVideoHandler` generates `systemPrompt` from the trusted template
registry. It tells the model:

- which templates and variables exist;
- how to emit the typed plan;
- how to order and time complete scenes;
- how to stay inside the factual and media boundaries;
- how to finish a finite response.

Normal applications should not build, copy, or expose this prompt in browser
code. Pass it unchanged to the provider adapter.

For maintainers, the base system rules live in
`src/server/prompts/system-prompt.ts`, request-context formatting lives in
`src/server/prompts/user-prompt.ts`, and template-specific catalog guidance
lives in `src/visual-system/catalog/prompt.ts`. See the
[architecture map](architecture.md) for the complete request flow.

### 2. Application instructions

Use `instructions` for optional presentation direction:

```ts
video.generate({
  input: "Account alerts launched today. They refresh every 15 minutes.",
  instructions: "Make the launch feel direct and energetic. End with adoption.",
});
```

Instructions can influence selection, emphasis, ordering, tone, and pacing.
They never expand the factual boundary, authorize a new media URL, or weaken
the event and validation contract.

For durable product-wide direction, use the server handler's `basePrompt`.
Keep per-request creative direction in `instructions`.

### 3. Grounded input

`input` is required and is the complete factual source for the video. It may be
plain text or a serialized structured object:

```ts
video.generate({
  input: "Activation increased from 41% to 58% after guided onboarding.",
});
```

```ts
video.generate({
  input: JSON.stringify({
    period: "Q2",
    activation: { previous: 41, current: 58 },
    cause: "guided onboarding",
  }),
});
```

Include exact numbers, quote wording, attribution, names, dates, and product
facts that may appear on screen. Do not place secrets, provider keys, or hidden
policy in input.

`personalization`, `brand`, and `suppliedMedia` are separate structured context.
They do not replace the source material.

### 4. Streamed plan

Your provider streams text deltas. VanillaSky decodes them into typed planner
parts, validates each complete scene, and emits deterministic protocol events.
The model never returns React, HTML, CSS, or executable JavaScript.

Generated `scene.add`, `scene.patch`, and `asset.patch` operations all pass
through the same merged-scene validation before the player sees them.

The standard planner contract requires one `scene.add` with
`placement: "closer"` immediately after the first playable body scene. The
model writes short grounded conclusion copy: a supplied action when one
exists, otherwise a declarative payoff that answers the story's “so what.” The
runtime holds the closer and emits it last, so a long body plan cannot displace
an ending that was already generated.

## What reaches the LLM

The provider adapter receives:

```ts
streamText: ({ systemPrompt, userPrompt, signal }) => streamText({
  model,
  system: systemPrompt,
  prompt: userPrompt,
  abortSignal: signal,
})
```

`userPrompt` is assembled by VanillaSky from:

- orientation and maximum duration;
- whether an opening scene already exists;
- raw `input`;
- creative `instructions`;
- personalization;
- descriptions and opaque references for approved supplied media;
- brand context.

Provider credentials and application authentication never belong in either
prompt. Original supplied-media URLs and data URIs also remain outside the
model prompt; the server restores an exact SDK-issued opaque reference only
after provider output has been parsed.

Generated template values are validated exactly. VanillaSky does not silently
truncate factual labels to satisfy a layout schema because truncation can drop
qualifiers or change meaning. A rejected generated scene contributes to
`rejectedSceneCount`; hosts can use the completion quality fields to retry with
a stronger model or revised source.

## Input examples

### Product update

```ts
video.generate({
  input: "Account alerts launched on August 16. They refresh every 15 minutes, filter by segment, and are available to all plans.",
});
```

### Metrics recap

```ts
video.generate({
  input: JSON.stringify({
    period: "Q2",
    customerConversations: 142,
    escalationsResolved: "96%",
    improvementsLaunched: 4,
  }),
  personalization: { firstName: "Joris" },
});
```

### Grounded review

```ts
video.generate({
  input: 'Review by Maya Chen, VP Product: "Setup took minutes, not weeks." Rating: 5/5.',
});
```

Every visible quote must occur in the input exactly. Attribution and ratings
should be explicit.

### Article or long source

Pass the source text and let the planner select the most decision-relevant
takeaways that fit the duration. The planner summarizes; it should not attempt
to place every paragraph on screen.

## Grounding and media safety

- Numeric templates require real numbers present in the source.
- Every grounded quote value must occur in the source, not merely one quote in a scene.
- Screenshot fields require an exact supplied image.
- Media URLs must be supplied or approved by the server's `allowMediaUrl` policy.
- Patches are validated after merging with the existing scene.

These checks happen at runtime. Prompt instructions improve model behavior but
are not treated as a security boundary.

## Debugging

If the plan is rejected or the result is weak, inspect the boundary in this order:

1. **Input:** Does it contain the exact facts, numbers, quotes, and attribution?
2. **Instructions:** Are they presentation guidance rather than new claims?
3. **Provider adapter:** Does it pass both prompts unchanged and stream only text deltas?
4. **Finish reason:** Did the provider report `length`, a content filter, or an execution error?
5. **Template fit:** Does the trusted registry contain a suitable visual for the requested story?

Log request IDs, provider finish reasons, and terminal SDK status. Do not log
secrets or expose raw provider diagnostics inside the video.

[← Documentation home](../README.md) · [Next: Generate your first video →](getting-started.md)
