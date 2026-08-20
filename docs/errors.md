[← Documentation home](../README.md) · [Previous: Security](security.md) · [Next: Production →](production.md)

# Errors and recovery

Render errors in normal application UI outside the video. Never show stack traces, provider details, raw deltas, or protocol diagnostics inside a scene.

| Boundary | Example codes | Host response |
| --- | --- | --- |
| HTTP | `unauthorized`, `origin_forbidden`, `body_too_large` | Fix session/policy; do not retry blindly |
| Input | `invalid_json`, `invalid_request`, `secret_field` | Correct client request |
| Protocol | invalid sequence/checksum/scene | Stop the stream and record a safe diagnostic |
| Generation | `generation_failed` | Hold current scene, end cleanly, offer retry |
| Generated part | `invalid_generated_part` | Keep accepted scenes; inspect the private server log |
| Resume | `invalid_cursor`, `resume_unavailable` | Restart only before visible output or from valid storage |

```tsx
import { VideoError } from "@vanillaskyai/video/react";

try {
  const completed = await video.generate({ input });
  await saveVideo(completed);
} catch (error) {
  if (error instanceof VideoError) {
    logSafeFailure({
      code: error.code,
      status: error.status,
      requestId: error.requestId,
      runId: error.runId,
    });
  }
}
```

`generate()` resolves only for `response.complete`. A terminal
`response.error` or `response.abort` rejects it. The hook still retains the
latest validated `video.video`, and its player stream still receives terminal
events, so an application may keep already accepted scenes visible while it
offers a retry. If the planner already supplied a validated reserved closer,
the runtime appends it to that playable terminal snapshot before reporting a
late provider failure; it never invents or rewrites closer copy during recovery.

Both a server `response.abort` and an explicit `video.abort(reason)` keep
`video.status` at `aborted`; `video.error` contains the same safe typed abort
reported by the rejected `generate()` promise.

`VideoError` preserves only actionable public context: the server's safe
`code` and `message`, HTTP `status` when available, `requestId`, `runId`, and
`recoverable`. Do not replace those fields with raw provider errors.

Abort replaced compositions and client disconnects. Retry provider throttles or transient failures only within an explicit request/time budget and only before visible output unless you have validated resume storage. Never silently restart after the viewer has begun watching.

Log safe codes with request/run IDs and latency. Keep private provider messages in server logs through `onError`; redact source, personalization, keys, tokens, and signed URLs.

Live acceptance artifacts use stable failure categories: `network`,
`authentication`, `model_not_found`, `rate_limit`, `provider`, `planner_parse`,
`scene_validation`, or `unknown`. Before diagnosing the SDK, probe the provider
with one minimal request using the same server-only credential and model. Check
DNS/proxy access, credential validity, model availability, account/rate limits,
and timeout settings in that order. Never copy raw provider payloads, streamed
deltas, prompts, or credentials into browser errors or CI artifacts.

Server handlers drop invalid generated parts by default. Each rejection calls
`onError` with the full internal reason, while the browser receives only the
recoverable `invalid_generated_part` diagnostic. Set `invalidPartBehavior: "fail"`
only when fail-fast generation is an intentional compatibility requirement.

`onComplete` runs exactly once only after `response.complete`. Terminal errors,
client disconnects, explicit aborts, and host timeouts do not call it;
`onError` receives internal failures, while cancellation remains a safe
`response.abort`. Abort and timeout signals always propagate to `streamText`.
The host owns timeout construction and retry policy. Do not retry invisibly
after any scene has reached the viewer.
