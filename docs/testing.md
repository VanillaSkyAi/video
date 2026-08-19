# Test integrations without a model

`@vanillaskyai/video/test` provides deterministic provider streams and in-process
protocol events. It has no React or provider-SDK dependency, makes no network
request, and does not require a model key.

## Test a route handler with Vitest

Pass `createMockVideoPlanner()` directly to the same `createVideoHandler()`
used by the application. Call the handler with a standard `Request`; no live
HTTP server is involved.

```ts
import { describe, expect, it } from "vitest";
import { createVideoHandler } from "@vanillaskyai/video/server";
import {
  createMockVideoPlanner,
  videoFixtures,
} from "@vanillaskyai/video/test";

describe("POST /api/video", () => {
  it("returns a completed video stream", async () => {
    const handle = createVideoHandler({
      authorize: "none", // Explicit because this in-process test route is never public.
      heartbeatMs: false,
      streamText: createMockVideoPlanner(),
    });
    const response = await handle(new Request("https://app.test/api/video", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: "0.4",
        requestId: "route-test",
        input: videoFixtures.portrait.input,
      }),
    }));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('"type":"response.complete"');
  });
});
```

The mock emits provider-style newline-delimited JSON. The route still parses,
validates, paces, and converts those plan parts into SSE exactly as it does with
a live provider.

## Test protocol events in process

`simulateVideoStream(parts, options?)` runs the same composition and validation
pipeline without an HTTP boundary. It yields structural, discriminated event
objects. Default IDs are `test-request` and `test-run`; override `requestId` and
`runId` when a test needs different fixed values.

```ts
import { expect, it } from "vitest";
import {
  simulateVideoStream,
  videoFixtures,
} from "@vanillaskyai/video/test";

it("keeps a truncated result playable", async () => {
  const events = [];
  for await (const event of simulateVideoStream(
    videoFixtures.scenarios.truncated,
  )) {
    events.push(event);
  }

  expect(events.at(-1)).toMatchObject({
    type: "response.complete",
    data: { finishReason: "length" },
  });
});
```

The portrait and landscape fixtures each contain `{ input, parts }`. All public
fixture values are deeply frozen, and each helper clones parts before a run so
one test cannot mutate another test's input.

## Delays, aborts, and timeouts

Delays and `timeoutMs` use ordinary timers and work with Vitest fake timers.

```ts
import { expect, it, vi } from "vitest";
import {
  simulateVideoStream,
  videoFixtures,
} from "@vanillaskyai/video/test";

it("times out deterministically", async () => {
  vi.useFakeTimers();
  try {
    const result = (async () => {
      const events = [];
      for await (const event of simulateVideoStream(
        videoFixtures.scenarios.timeout,
        { timeoutMs: 50 },
      )) events.push(event);
      return events;
    })();

    await vi.advanceTimersByTimeAsync(50);
    await expect(result).resolves.toMatchObject([
      { type: "response.start" },
      { type: "scene.add" },
      { type: "response.abort", data: { reason: "Request timed out" } },
    ]);
  } finally {
    vi.useRealTimers();
  }
});
```

For a host cancellation, pass an `AbortController` signal and abort it after the
desired partial event. Timeouts are opt-in and local to the simulator; at the
route boundary the host remains responsible for aborting the request signal.

## Fixed scenarios

`createMockVideoPlanner({ scenario })` accepts:

| Scenario | Expected terminal behavior |
| --- | --- |
| `success` | Completed portrait fixture |
| `delayed` | Success after a 25 ms fake-timer-safe delay |
| `truncated` | Partial playable result completed with `length` |
| `invalidScene` | Invalid scene dropped with a recoverable diagnostic, then completion |
| `providerFailure` | Redacted terminal generation failure |
| `contentFilter` | Partial playable result completed with `content-filter` |
| `abort` | Waits for the supplied request signal to abort |
| `timeout` | Waits for the host signal or simulator `timeoutMs` |

Use `parts` in `MockVideoPlannerOptions` to supply custom structural plan parts,
and `delayMs` to delay every emitted provider chunk. Provider selection,
credentials, retries, and real-provider acceptance remain application-owned.
