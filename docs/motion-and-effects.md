[← Documentation home](../README.md) · [Previous: Custom templates](custom-templates.md) · [Next: Production →](production.md)

# Motion and effects

VanillaSky motion is deterministic. The model selects from controlled names;
the SDK calculates the same frame from the same video JSON and playback time.
No generated CSS, animation code, or arbitrary transition is executed.

## Text archetypes

Text archetypes own a complete entrance, hold, and exit lifecycle:

- `subtle` — quiet supporting copy;
- `typewriter` — character-by-character reveal;
- `wordStagger` — sequential word build;
- `slam` — short, high-energy impact;
- `cinematic` — depth-led trailer movement;
- `heroWord` — one dominant word at a time.

Templates declare whether they have a tight or open text canvas. VanillaSky
normalizes incompatible or unknown values to a safe default.

## Background effects

Templates that support background motion can use:

- `static`;
- `slow-zoom-in`;
- `slow-zoom-out`;
- `ken-burns`;
- `drift`;
- `pulse`;
- `breathe`;
- `slow-tilt`;
- `camera-shake`.

`slow-zoom-in` is the default. Use `static` as the explicit opt-out.

## Scene continuity

`style.defaultTransition` accepts `crossfade` or `fade`. The player applies it
only when two ranges are contiguous (allowing floating-point arithmetic noise)
and both templates declare `usesGlobalTransition: true` with valid
`transitionTiming` metadata. It is also conditional on the effective backdrop:
the 300 ms outer crossfade runs only when the resolved background media changes.
Scenes that share the brand gradient, or the same resolved media backdrop, do
not crossfade. This keeps one stable background visible while each template
plays its own entrance, hold, and exit choreography.

Animated brand gradients use a closed, eased loop per scene. Every gradient
family reaches the exact same zero-velocity frame at progress `0` and `1`, and
content-seeded variation converges before the boundary. A same-gradient cut
therefore changes only the foreground template; the backdrop cannot jump or
flash between scene-specific phases.

The player owns a persistent brand-color backdrop beneath every scene. Built-in
renderers preload through the same component state used for playback, so their
first frame does not suspend when a new template type appears. If a genuinely
cold custom renderer does suspend, its transparent loading frame reveals the
brand backdrop rather than a black canvas. Scene media still belongs to the
scene and covers that base only while the media scene is active.

During a changed-media overlap, the current scene continues to its exact end.
The incoming component may be pre-mounted for media readiness, but remains
frozen at its true initial frame (`progress === motionProgress === 0`) until its
declared range begins. The current scene remains interactive and exposed to
assistive technology until the exact timeline boundary; the preview layer
remains inert throughout the overlap.

Templates always receive raw semantic scene time as `progress`. Grounded
numbers, media time, screen sequences, and other content state must use that
clock. An opted-in template also receives `motionProgress`; throughout active
playback it is the same complete `0→1` clock. The player never pre-advances,
caps, rewinds, or skips a template's entrance, internal motion, exit, or
terminal frame. `transitionTiming` records audited entry-ready and readable
checkpoints for verification, but does not remap runtime time. Use
`motionProgress` only for presentation and fall back to `progress` when it is
absent. Templates opt out by default.

An incoming changed-media fade can expose the template's initial frame while
its raw semantic clock is still zero.
Do not show a synthetic `0%`, `0x`, empty total, or another value that could be
mistaken for sourced content. Keep the grounded frame and CTA visible, but mark
only a transient value wrapper with
`visibility: var(--vanillasky-transition-semantic-visibility, visible)`. The
player hides that wrapper for the incoming preview and reveals it as soon as
the same mounted scene becomes active. This guard does not change `progress`,
media time, the component lifecycle, or final values.

Undefined or unknown transition names preserve a hard cut and unmodified local
motion. Overlapping ranges also hard-cut. A timeline gap renders the owned brand
background instead of replaying an earlier scene.

## Reduced motion

The player respects `prefers-reduced-motion`. Applications should keep a
visible playback control and must not rely on motion alone to communicate a
fact or state.

## Preview the catalog

The public [motion and effects gallery](https://vanillasky.ai/motion/) renders
the real SDK effects with their exact configuration. Use it to choose a
controlled effect, then keep the initial integration on the defaults unless a
specific editorial need calls for an override.

[← Documentation home](../README.md) · [Previous: Custom templates](custom-templates.md) · [Next: Production →](production.md)
