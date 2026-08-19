[← Documentation home](../README.md) · [Previous: Input and first scene](input-and-first-scene.md)

# Responsive orientation

Orientation is a composition constraint, not a fixed pixel size.

- `portrait` uses a 9:16 design space for phones, stories, and feeds.
- `landscape` uses 16:9 for embedded product surfaces, presentations, and desktop playback.

Templates render on a canonical design canvas: 1080×1920 for portrait and
1920×1080 for landscape. `VideoPlayer` preserves that canvas and scales it
uniformly to its viewport. When the viewport has a different aspect ratio, the
canvas is centered with letterboxing instead of being stretched.

Template authors should still use relative layout, safe edges, clamped typography, and content-aware wrapping so both orientations and localized content remain readable.

```tsx
<div className="video-shell">
  <VideoPlayer {...video.playerProps} orientation="auto" />
</div>
```

```css
.video-shell { width: min(100%, 48rem); margin-inline: auto; }
```

`orientation="auto"` uses landscape above 520 CSS pixels and portrait at or
below 520, based on the player's container rather than the browser window. Set
`responsiveBreakpoint` to match an existing host breakpoint. Set
`orientation="portrait"` or `"landscape"` when a surface must remain fixed.
Omitting the prop preserves the orientation recorded in the response config.

This display override does not mutate the completed response, checksum, or export
orientation. It reflows the same trusted templates and scene variables without
another provider call. Test every template at narrow mobile widths, large embeds,
200% zoom, both orientations, reduced motion, and with long localized copy.
Meaning must remain available when motion is reduced.
