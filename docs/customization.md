[← Documentation home](../README.md)

# Customization

## Background and semantic brand

Omit brand configuration to use the standard `cosmic` background. Prefer a
named curated choice over raw color work:

```ts
const brand = {
  name: "Acme",
  logoUrl: "https://cdn.acme.com/logo.svg",
  font: "Inter",
  scriptFont: "Caveat",
  background: "twilight",
  colors: {
    primary: "#6D5EF5",
    secondary: "#3D2A78",
    foreground: "#FFFFFF",
    surface: "#17122F",
    surfaceElevated: "#231B42",
    muted: "#A7A6B0",
  },
};
```

Gradient presets: `cosmic`, `horizon`, `twilight`, `meadow`, `velvet`,
`flamingo`, `peach`, `saffron`. Solid presets: `black`, `midnight`,
`aubergine`, `coal`, `navy`. When a named choice genuinely cannot express the
brand, use `{ colors: ["#112233", "#334455"] }` for a custom gradient or
`{ color: "#070B20" }` for a custom solid.

`colors` may be partial; the resolver fills every semantic token before the
video is emitted. With no foreground, named and custom backgrounds
deterministically select black or white for at least 4.5:1 contrast across the
full rendered sRGB ramp, including gradient interiors. A ramp that neither can
cover is rejected. An explicit foreground is preserved and validated by the
same invariant during input resolution and replay; low-contrast values are
rejected with the failing path and minimum ratio. Elevated surfaces derive an
accessible internal text treatment without changing the semantic foreground.
Use an approved public or signed URL for logos, and never put a private storage
credential in the config.

## Global visual direction

Leave visual direction unset to use VanillaSky's defaults, or set one coherent
look for the completed video:

```ts
style: {
  density: "airy",           // airy | normal | packed
  motion: "calm",            // calm | normal | punchy
  textArchetype: "cinematic",
  backgroundEffect: "slow-zoom-out",
}
```

These are defaults, not generated CSS. A validated scene may still select a
more appropriate text or background treatment when its trusted template allows
it.

## Personalization

`personalization` accepts JSON-safe application fields. Include only values the
viewer is allowed to see. The system prompt treats them as context, not as
instructions.

Good fields include `firstName`, `role`, `accountName`, `period`, `goal`,
`locale`, and `onboardingPartner`. Keep facts in `input` as well when they must
appear in the story.

## Opening

`VideoPlayer` automatically shows a brand-colored generation cover until the
first validated scene arrives. The cover is player state, not video content: it
is never written to the event log, replay, or export.

The opening is deterministic and should not wait for an LLM or remote media.
Omit it to use `Creating your video...`, or supply one concise custom sentence:

```ts
opening: "Your Q2 customer impact recap is ready."
```

Pass `opening: false` to omit the persisted opening and show application-owned
loading UI until the first generated scene arrives.

Use `opening` only for a genuine opening that should remain in the completed
response. VanillaSky infers the scene ID, `media` template, gradient variables,
and three-second timing. Keep generic loading state in the host UI instead.

## Aspect ratio and responsive layout

The player is responsive by default: it fills its container width. Templates
and copy must work at either aspect ratio; orientation is not an AI-planning
input and must not influence the selected templates or wording.

`portrait` reserves a 9:16 response/export frame and `landscape` reserves 16:9.
This input setting remains stable in the completed config. For an embed that
should display landscape on desktop and portrait on mobile without changing the
saved response, pass `orientation="auto"` to `VideoPlayer`; it responds
to its container width. See [responsive orientation](responsive-orientation.md).

## Supplied media

Provide approved media with semantic descriptions:

```ts
suppliedMedia: [{
  id: "product-dashboard",
  url: "https://cdn.example.com/dashboard.png",
  type: "image",
  description: "Activation dashboard after the Q2 release",
  role: "product",
}]
```

Resolve searched media before generation and pass the approved result through
`suppliedMedia`. See [media providers](media-and-audio.md#media-providers).

## Soundtrack audio

Pass `audio: { src }` for a specific track, omit `audio` to let the server choose
synchronously from a preloaded catalog, or pass `audio: false` for silence.
VanillaSky infers deterministic duration, volume, beat, and fade-out metadata.
The soundtrack should continue across visual generation gaps and finish with
the final scene. Narration, TTS, and speech synchronization are not part of the
0.1 SDK contract.

## Custom templates

The built-in catalog needs no setup. Only source-owned templates need the
optional local TSX compiler; install it once with `npm install --save-dev tsx`.
Then use `npx vanillasky create <id>` for an original one-file template or
`npx vanillasky add <builtin>` to copy a close built-in. Edit the owned file,
run `npx vanillasky sync`, then run `npx vanillasky check` before committing.
Pass the generated registry to the server and browser; project-owned IDs
replace matching built-ins and new IDs extend the catalog.

The model sees selection guidance and a schema, not component source. It chooses
a trusted template and fills validated variables. Never evaluate model-authored
React, HTML, CSS, or JavaScript on the live path.

See [custom templates](custom-templates.md).
