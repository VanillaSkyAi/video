[← Documentation home](../README.md) · [Previous: Branding and personalization](branding-and-personalization.md) · [Next: Custom templates →](custom-templates.md)

# Media and soundtrack audio

Applications own media and soundtrack audio. VanillaSky accepts ordinary
authorized URLs in the deterministic video model; it does not bundle tracks or
couple your app to a stock-media provider.

The 0.1 SDK does not provide narration, TTS, or speech synchronization.
If a product needs spoken audio, the application must create and synchronize
that experience outside this contract.

Only send source URLs you trust. Pass known approved assets through
`suppliedMedia`, or configure the server-only `resolveMedia` callback for
planner-selected backgrounds. Preload the next scene's asset before it becomes
active. Keep provider credentials on the server.

Supplied URLs and data URIs are not copied into the LLM prompt. The model sees
an optional pool of opaque HTTPS-shaped references plus safe descriptive
metadata, selects only relevant assets, and the SDK restores their original
addresses on the server before scene validation. Supplying an asset does not
require the completed video to use it.

Audio timing, volume, beat markers, and fade-out remain part of the serialized
output video, so replay and export stay deterministic. The input stays at the
intent level: provide only the source URL and the SDK infers those playback
defaults. Hosting and licensing are the application's responsibility.

Host tracks in your application's public assets, object storage, or CDN, then
pass their URL through the normal video input. For example, a file at
`public/audio/calm.mp3` can be used without an SDK audio package:

```ts
const input = {
  input: "Grounded source material",
  audio: { src: "/audio/calm.mp3" },
  maxDurationSec: 24,
};
```

The normalized output uses `trackId: "soundtrack"`, the video duration,
default beat detection, an empty beat-marker list, full volume, and a
three-second fade-out. Omit `audio` to let the server's synchronous
`selectAudio` callback choose from an app-owned catalog. Pass `audio: false`
to guarantee a silent video.

Keep the catalog and files in your application so you control caching,
licensing, and deployment. The SDK continues to handle playback, timing,
serialization, replay, and export from the supplied URL.

## Start with sound

Browsers block audible autoplay unless the viewer has already interacted with
the page. For a sound-first experience, keep the branded generation intro
visible and let the player's start control provide that interaction:

```tsx
<VideoPlayer
  {...video.playerProps}
  playbackMode="autoplay-after-interaction"
/>
```

The generation cover immediately includes a centered **Play with sound**
button. A click starts the soundtrack and holds that branded cover as a
three-second generation intro while planning continues. Once both the intro
and the first validated scene are ready, the generated timeline begins from
time zero. The generation intro remains visible indefinitely if the viewer has
not clicked yet, even when the complete generated video is already ready. The
server keeps the generated first scene on screen for at least three more
seconds when the duration budget permits. After that first successful sound start,
replacement streams on the same mounted player autoplay the same generation
intro with sound and fall back to a start control if the browser blocks them.

When `VideoInput.opening` is supplied, its asset-free gradient `media` scene
replaces the generic generation cover as soon as it is available. It remains
as the static start poster until the viewer clicks, then begins the actual
timeline with sound; there is no additional generic pre-roll before it.

Use `playbackMode="manual"` to require the button on every run,
`playbackMode="muted-autoplay"` for browser-safe muted autoplay, or
`playbackMode="autoplay-with-sound"` to try audible autoplay immediately. The
lower-level `autoPlay` and `startMuted` props remain available when no playback
mode is set. For a chat response that should try audible autoplay without the
SDK generation intro, pass `opening: false`, wait to mount the player until a
generated scene exists, and render it with `autoPlay` and `startMuted={false}`.
If the browser blocks the audible start, the player returns to the first frame
and exposes its sound-start control.

## Media providers

VanillaSky is provider-independent. When `resolveMedia` is configured, the
built-in planner may emit a bounded semantic query for later media-capable
scenes. The SDK calls the application-owned resolver on the server, replaces
the query with the approved URL, type, and optional poster, then validates the
scene before emitting it. Without the callback, media intent stays hidden from
the planner. The first accepted generated scene remains asset-free.

```ts
import { createVideoHandler } from "@vanillaskyai/video/server";

createVideoHandler({
  authorize: checkSession,
  streamText: planWithYourModel,
  resolveMedia: async (query, { preferredType, signal }) => {
    const asset = await searchYourApprovedCatalog({ query, preferredType, signal });
    return asset
      ? { url: asset.url, type: asset.type, posterUrl: asset.posterUrl }
      : null;
  },
});
```

The resolver query is 2–80 characters and at most eight words. Return `null`
when no licensed, safe, relevant asset exists; media-capable templates fall
back to the brand gradient when their schema permits it. The browser never
receives `mediaKeyword`, provider keys, or raw provider metadata.

`allowMediaUrl` is an authorization hook for applications with their own custom
stream adapter. It validates a final URL; it does not search for, fetch, or
resolve media. The default 0.1 path needs no callback because every planner URL
must already be present in `suppliedMedia`.

Do not expose provider keys to React or allow arbitrary planner URLs. Templates
describe visual building blocks; the application owns media retrieval,
caching, licensing, and delivery.

For Pexels, keep `PEXELS_API_KEY` on the server and implement `resolveMedia`
with the Pexels API. Return only validated `images.pexels.com` or
`videos.pexels.com` results. The application remains responsible for
attribution, search, orientation filtering, MIME checks, timeouts, caching,
and fallback behavior.
