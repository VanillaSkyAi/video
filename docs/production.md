[← Documentation home](../README.md) · [Previous: Errors and recovery](errors.md)

# Production guide

Use this checklist before serving a video response to customers.

## Server boundary

- Keep provider keys, the system prompt, and tools on the server.
- Authenticate the user and tenant before reading the request body.
- Set an explicit origin allowlist. CORS is not authentication.
- Apply per-user and per-tenant request, token, and concurrency limits.
- Set route, model, media, and export timeouts with cancellation propagation.
- Bound raw input size, media count, scene count, and maximum duration.

Use `createVideoHandler()` for validated SSE and read
[the security guide](security.md) for the mandatory controls.
The handler automatically configures scene validation: it rejects unknown
templates and fields, missing required variables, non-supplied media URLs, and
fabricated quote-template content before a scene reaches the player.
Applications with a custom stream adapter may authorize additional final URLs
with `allowMediaUrl`; the callback validates URLs and does not resolve them.
Invalid generated parts are dropped by default, after `onError` receives their
private reason. Accepted scenes continue streaming with a safe recoverable
diagnostic. Use `invalidPartBehavior: "fail"` only for deliberate fail-fast behavior.

## Data and privacy

- Send the provider only the source and personalization required for the story.
- Do not log raw prompts, personalization, authorization headers, signed URLs,
  or provider deltas.
- Record request IDs, model ID, duration, event counts, safe error codes, token
  usage, and acceptance metrics.
- Review your provider's retention settings and data-processing terms.
- Keep signed asset URLs valid for the expected viewing and replay window.

## Reliability

- Emit the supplied opening and selected audio before starting model work.
- Abort provider work when the client disconnects.
- Persist terminal snapshots for replay and export, then validate loaded values
  with `parseVideo` before use.
- Persist event logs when resume is required; validate them with
  validate stored event logs before replay.
- Treat the [persistence contract](persistence.md) as the storage boundary;
  database, tenant policy, object storage, deletion, and URL expiry remain
  host-owned.
- Use idempotency keys around durable generation requests.
- Retry only before visible output or from a validated resume point. Do not
  silently restart a response after the viewer has begun watching.

## Failure experience

- Keep private provider details in `onError`; send only safe typed errors.
- Do not display stack traces or protocol diagnostics inside the video.
- Hold the current scene and continue audio through a recoverable generation
  gap.
- End cleanly on a terminal error; never append blank media after completion.
- Provide a normal application retry control outside the player.

## Media and audio

- Start generated playback with an asset-free scene.
- Preload media for the next scene and commit it only when ready.
- Resolve media before generation and pass approved results through
  `suppliedMedia`. Stock-keyword resolution is not part of the 0.1 handler.
- Use customer-approved media domains and enforce type/byte limits.
- Select soundtrack audio from an already-loaded catalog; declare a positive
  fade-out. Narration and speech synchronization are application-owned.
- Respect browser autoplay rules and provide an explicit unmute control.

## Observability

Track at minimum:

- time to supplied opening;
- time to first generated scene;
- time to complete plan;
- seconds of future content buffered;
- planner and protocol error codes;
- media readiness failures;
- completion and abandonment rate;
- provider model and token usage.

Use the repository acceptance harness in smoke tests. The defaults
require an opening within 250 ms, a generated scene within 15 seconds,
completion within 30 seconds, resolved media, audio before the opening, three
body scenes, three distinct templates, and a human quality score of 80.

## Testing

Use the React-free deterministic helpers in [Test integrations](testing.md) for
Vitest, in-process streaming, and route-handler tests without a live provider.

Test the public path at its HTTP boundary. Pass a deterministic `streamText`
generator to `createVideoHandler`, call the route with grounded input, and
assert the validated terminal result through `useVideo`. Keep separate
component tests for each trusted template.

In CI, build and test the application. If the project owns copied templates,
also verify that its registry is current:

```bash
npx vanillasky sync --check
npm run build
npm test
```

Before release, build one clean consumer from the packed SDK tarball. This
catches missing exports, React/server boundary leaks, code-generation drift,
and dependency-resolution problems that workspace tests cannot detect.

## Deployment checklist

- [ ] Provider keys exist only in the server secret store.
- [ ] Authentication, tenant policy, rate limits, and origin allowlist are live.
- [ ] Cancellation, timeouts, and safe errors are tested.
- [ ] Every installed template renders in both orientations.
- [ ] Chromium, Firefox, WebKit, React, and Node compatibility checks pass.
- [ ] A real provider run passes latency and human quality review.
- [ ] Final snapshots replay exactly and export through the configured adapter.
- [ ] Package and application dependency audits meet your severity policy.
