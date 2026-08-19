# Architecture

VanillaSky turns context into a visual response. Your application and its AI
decide what matters; VanillaSky turns that decision into a grounded, validated,
embedded video that starts playing while it is still being composed.

## The shortest mental model

```text
application context
  → app-owned model
  → trusted scene plan
  → validation and streaming protocol
  → embedded React player
```

VanillaSky does not choose your model, retrieve your application context, or
generate executable UI code. It supplies the video-planning prompt, trusted
visual vocabulary, validation, streaming lifecycle, and player.

## Repository map

| Location | Purpose |
| --- | --- |
| `src/server/create-video-handler.ts` | Public server integration and provider adapter boundary |
| `src/server/prompts/` | System and user prompts sent to the app-owned model |
| `src/server/model/` | Converts provider text deltas into typed video plan parts |
| `src/protocol/` | Shared request, event, validation, checksum, and SSE contract |
| `src/player/` | Browser stream client, `useVideo`, timeline, and React player |
| `src/visual-system/catalog/` | Template metadata, schemas, loading, and planner catalog |
| `src/visual-system/scene-templates/` | Complete scenes the model may select |
| `src/visual-system/primitives/` | Reusable visual components used inside scenes |
| `src/visual-system/backgrounds/` | Standalone background renderers |
| `src/visual-system/motion/` | Animation functions and timing behavior |
| `src/visual-system/theme/` | Color and design tokens |
| `src/cli/` | `vanillasky create`, `add`, `sync`, `check`, `list`, and `describe` for customer-owned templates |
| `registry/items/` | Generated distributable copies installed into customer projects |
| `src/index.ts`, `src/server.ts`, `src/react.ts`, `src/templates.ts`, `src/template-catalog.ts`, `src/test.ts` | The six small public package entry points |

The source of truth for built-in visuals is `src/visual-system`. The JSON files
in `registry/items` are distribution artifacts, kept flat so the CLI can address
every installable item by a stable name. Their `meta.vanillasky.layer` and
`category` fields distinguish full templates, primitives, effects, and shared
support code. Run `npm run registry:sync` after changing canonical visual source.

Customer applications do not edit those internal locations. Their source of
truth is one file per visual under `vanillasky/templates/`; `vanillasky sync`
derives a browser registry in `vanillasky/index.ts` and a React-free
prompt/validation registry in `vanillasky/server.ts`.

## Request flow

1. `useVideo().generate(...)` sends grounded input and live application context
   to the authenticated application route.
2. `createVideoHandler(...)` builds the prompts and calls the application's
   `streamText` adapter. This is where OpenAI, Anthropic, or another model is
   connected.
3. The system prompt combines the composition rules with the trusted template
   catalog, including generated metadata for customer-owned templates. The user
   prompt serializes the factual input, instructions,
   personalization, brand, and approved media.
4. The model streams NDJSON plan parts. The server parses and validates complete
   scenes before emitting versioned video events.
5. The browser reduces those events into a deterministic `Video`; `VideoPlayer`
   starts as soon as its first playable scene arrives.

## Where to change common behavior

- Model connection: `src/server/create-video-handler.ts`
- Base planning rules: `src/server/prompts/system-prompt.ts`
- Per-request context formatting: `src/server/prompts/user-prompt.ts`
- Template-specific prompt catalog: `src/visual-system/catalog/prompt.ts`
- Wire contract: `src/protocol/types.ts` and `src/protocol/events.ts`
- Scene rendering: `src/visual-system/scene-templates/`
- Background effects: `src/visual-system/backgrounds/` and
  `src/visual-system/scene-templates/background-effect.ts`
- Text effects: `src/visual-system/scene-templates/text-archetypes.ts`
- Gradients and design tokens: `src/visual-system/theme/`

## Public vocabulary

Use `Video`, `VideoInput`, `useVideo`, and `VideoPlayer` for the product API.
Use “video response” when describing the lifecycle or output category. Use
“motion” only for animation behavior inside the visual system.
