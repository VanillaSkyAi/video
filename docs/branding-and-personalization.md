[← Documentation home](../README.md) · [Previous: Input and first scene](input-and-first-scene.md) · [Next: Media and audio →](media-and-audio.md)

# Branding and personalization

Brand values style the whole response. Personalization shapes who the story is for.

## Background: standard, preset, or custom

Do nothing to use the standard `cosmic` background:

```ts
video.generate({ input });
```

Choose a curated gradient or solid by name when the standard does not fit:

```ts
video.generate({
  input,
  brand: { background: "twilight" },
});
```

Curated gradients are `cosmic`, `horizon`, `twilight`, `meadow`, `velvet`,
`flamingo`, `peach`, and `saffron`. Curated solids are `black`, `midnight`,
`aubergine`, `coal`, and `navy`.

Use exact colors only when a real brand or campaign requires them:

```ts
brand: { background: { colors: ["#112233", "#334455"] } } // gradient
brand: { background: { color: "#070B20" } }                // solid
```

These choices set the background colors used by every trusted gradient-backed
template and by the automatic generation cover. Templates own their
composition and type treatment, so there is no separate visual-preset choice.

## Semantic brand tokens

Most applications can stop at `brand.background` and `brand.font`. Supply
semantic colors only when a real design system requires exact values:

```ts
const brand = {
  name: "Acme Cloud",
  logoUrl: approvedLogoUrl,
  font: "Inter",
  scriptFont: "Caveat",
  background: "twilight",
  colors: {
    primary: "#7C5CFC",
    secondary: "#3D2A78",
    foreground: "#FFFFFF",
    surface: "#161229",
    surfaceElevated: "#211A38",
    muted: "#AAA5B8",
  },
};
```

Every generated video contains a fully resolved brand. `colors` may be partial
on input; omitted values receive deterministic defaults. When
`colors.foreground` is omitted, every named or custom background is paired
deterministically with black or white. The resolver checks the full rendered
sRGB gradient ramp, including interior blends rather than only its endpoints.
If neither foreground reaches 4.5:1 everywhere, resolution rejects the
background and asks for a consistently readable choice.

An explicitly supplied foreground is preserved, never silently replaced. It
must reach 4.5:1 across the solid background or entire gradient ramp; otherwise
input resolution and replay validation reject it with the failing brand path
and minimum contrast. Surface tokens remain independent. Templates that put
text on `surface` or `surfaceElevated` internally keep an accessible preferred
semantic text color or derive black/white for that surface.

Use an approved public or signed URL for logos. Fonts must be licensed and
loaded by the host application before playback. Always test both orientations
and forced browser zoom.

`personalization` accepts JSON-safe viewer or account context such as
`firstName`, `role`, `accountName`, `locale`, `goal`, or `onboardingPartner`.
These values may appear verbatim in the response, but are always data, never
instructions. Put product, news, metric, and quoted claims in `input`; do not
duplicate ordinary viewer context there.

Only include information the authenticated viewer is allowed to see. Avoid sensitive HR, health, payment, or customer attributes in event logs and analytics. If a locale changes number/date formatting, format facts server-side so the planner cannot guess.
