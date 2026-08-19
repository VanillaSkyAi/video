[← Documentation home](../README.md) · [Previous: Branding and personalization](branding-and-personalization.md) · [Next: Custom templates →](custom-templates.md)

# Media and soundtrack audio

Applications own media and soundtrack audio. VanillaSky accepts ordinary
authorized URLs in the deterministic video model; it does not bundle tracks or
couple your app to a stock-media provider.

The 0.1 SDK does not provide narration, TTS, or speech synchronization.
If a product needs spoken audio, the application must create and synchronize
that experience outside this contract.

Only send source URLs you trust. Resolve provider results before generation,
pass approved assets through `suppliedMedia`, and preload the next scene's asset
before it becomes active. Keep provider credentials on the server.

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

## Media providers

VanillaSky is provider-independent. Resolve image or video searches in your
server application before generation and pass the approved results through
`suppliedMedia`. The built-in planner sees opaque references and safe metadata;
it does not call a stock-media provider or turn `mediaKeyword` into a URL.

`allowMediaUrl` is an authorization hook for applications with their own custom
stream adapter. It validates a final URL; it does not search for, fetch, or
resolve media. The default 0.1 path needs no callback because every planner URL
must already be present in `suppliedMedia`.

Do not expose provider keys to React, allow arbitrary planner URLs, or add a
provider abstraction to the template API. Templates describe visual building
blocks; the application owns media retrieval, caching, licensing, and delivery.

For Pexels, keep `PEXELS_API_KEY` on the server, search before generation, and
pass only validated `images.pexels.com` or `videos.pexels.com` results through
`suppliedMedia`. The application remains responsible for attribution, search,
orientation filtering, MIME checks, timeouts, caching, and fallback behavior.
