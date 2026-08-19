# Registry items

The `registry/items` folder contains the files installed by
`npx vanillasky add <name>`.

The JSON files are generated distribution manifests, not the best place to
learn or edit the visual system. Canonical source lives in
[`src/visual-system`](../../src/visual-system), organized by purpose:

- `scene-templates/` — complete AI-selectable scenes;
- `primitives/` — reusable charts, devices, social UI, and typography;
- `backgrounds/` — standalone background renderers;
- `motion/` — animation utilities;
- `theme/` — color and design tokens;
- `catalog/` — schemas, metadata, loaders, and prompt-facing descriptions.

Registry items stay flat because their filenames are stable CLI identifiers and
dependencies may cross visual categories. Inspect `meta.vanillasky.layer` and
`meta.vanillasky.category` in a manifest to understand what it installs.

After editing canonical visual source, run:

```bash
npm run registry:sync
```

CI runs `npm run registry:check` to prevent generated manifests from drifting.
