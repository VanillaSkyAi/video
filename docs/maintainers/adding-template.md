# Adding a built-in template

Built-ins are public SDK contracts. Author them in the SDK and publish them only
after the complete distribution surface is consistent. Visual review can
produce a structured design brief, but the SDK remains the only source of truth.

## 1. Turn a design brief into an SDK branch

1. Start with a validated `vanillasky.template-edit-brief/v1` JSON document. For
   a new built-in, treat the brief as a design reference and include the
   proposed camelCase ID, intended job, variable contract, source facts, both
   orientations, and motion/timing acceptance criteria.
2. Give the brief to the coding agent and create an isolated SDK worktree from
   current remote `main`:

   ```bash
   cd /absolute/path/to/video
   git fetch origin
   git worktree add .worktrees/feat-template-<id> -b feat/template-<id> origin/main
   cd .worktrees/feat-template-<id>
   ```

Do not edit generated files first. The agent should implement canonical source,
run the generators, inspect their diff, and deliver through a branch and PR.

## 2. Add every canonical integration point

Adding an ID currently has explicit, reviewable touchpoints:

1. Add the renderer under
   `src/visual-system/scene-templates/<module>.tsx`. Reuse primitives and shared
   motion rather than embedding a second implementation.
2. Add its JSON schema to `BUILTIN_TEMPLATE_SCHEMAS` in
   `src/visual-system/scene-templates/schemas.ts`. Every required property must
   have a representative default. Put model-facing field constraints and
   grounded-fact formats in the schema.
3. Add the ID union member and complete metadata to
   `src/visual-system/catalog/builtin-manifest.ts`: label, description, family,
   jobs, register, `useWhen`, `avoidWhen`, motion ownership, text canvas,
   minimum/preferred duration, and content-aware timing fields.
   If `usesGlobalTransition` is true, add tested `transitionTiming` entry/hold
   points and route the optional `motionProgress` prop only to presentation
   motion. Keep grounded values, media playback, device
   screens, and content sequencing on raw `progress`.
4. Import the renderer and add it to the static `components` map in
   `src/visual-system/scene-templates/registry.ts`.
5. Add the source module filename and exported component name to
   `templateModules` in `scripts/generate-builtin-catalog.ts`.
6. Create `registry/items/<id>.json` with
   `meta.vanillasky.layer: "template"`, tier, public source file entries, and
   registry dependencies. `npm run registry:sync` will copy canonical source
   and manifest metadata into it, but it does not invent the initial item or
   its dependency graph.

The model prompt is derived from the generated catalog; normally it needs no
ID-specific edit. Change `src/visual-system/catalog/prompt.ts` only when the new
contract needs a genuinely new general planning rule.

## 3. Update explicit stability gates

The stable built-in set and count are deliberately asserted in several places.
Update every affected assertion and review why it exists:

- `tests/builtin-template-metadata.test.ts` (`STABLE_TEMPLATE_IDS` and count);
- `tests/acceptance-template-contract.test.ts`;
- `tests/unified-template-schema.test.tsx`;
- `tests/public-api.test.ts`;
- `tests/acceptance-catalog.test.ts`;
- `scripts/verify-packed-package.mjs` and
  `tests/packed-package-script.test.ts`.

Also add focused renderer/schema tests for the new behavior. Search once more
before committing so a newly added gate is not missed:

```bash
rg 'STABLE_TEMPLATE_IDS|toHaveLength\(28\)|length !== 28|size\)\.toBe\(28\)' tests scripts
```

Replace `28` in that search with the previous count when the catalog has
already grown.

## 4. Synchronize and check without rewriting

Generate once after the canonical edits:

```bash
npm run registry:sync
git diff -- src/visual-system/catalog registry/items
```

Then use the read-only integrity checker. A single ID is fastest while working;
the no-ID form checks every built-in:

```bash
npm run template:check -- <id>
npm run template:check
```

The checker aggregates missing manifest/schema/default, source registry,
generated catalog/loader, loadable renderer, registry layer/metadata, prompt
catalog, and generated-artifact failures. It prints every actionable path in
one run. It never creates or rewrites files. Fix the canonical source, run
`npm run registry:sync` explicitly, and check again.

Run the repository gates before visual review:

```bash
npm run registry:check
npm run lint
npm run typecheck
npm test
npm run build
```

For a release-facing change, complete `npm run release:check`; repository-local
tests alone do not verify the packed consumer surface.

## 5. Pass the visual gates

Visual review runs through a separate site-owned process. Inspect defaults,
realistic data, edge data, and edited variables at the minimum and preferred
durations. Capture native frames at 25%, 60%, 85%, and 100% in both
orientations. Approval requires readable copy, safe margins, no overflow,
meaningful motion at the intermediate frames, a clean exit at 100%, and enough
hold time to read every required field. Record the SDK commit, fixture,
duration, dimensions, browser/page errors, and captures with the PR evidence.

For a transition-enabled template, also capture the configured
`entryReadyProgress` and `holdProgress` in both orientations. Verify exact
grounded terminal values at raw and motion progress `1`, verify that the local
exit runs between the readable hold and terminal frame, and verify the 300 ms
incoming/outgoing overlap against a contiguous neighboring scene.

## 6. Merge and publish

Open the SDK PR, wait for all CI jobs, merge, and follow
[`releasing.md`](./releasing.md). Do not publish from this authoring workflow;
publish only the chosen stable version through the documented tagged release.

After npm reports that exact version as `latest`, vanillasky.ai adopts the
stable package separately through its site-owned process. The public SDK does
not contain the private adoption workflow or deployment configuration.

## Why authoring remains agent-driven

Browser authoring is intentionally limited to previewing, tuning, and exporting
a structured brief. A built-in spans typed React source, schema, model metadata,
two registries, generated distribution files, tests, and release evidence.
Writing those files from a browser would hide important code review and could
make the public package diverge from its source.

Automatic scaffolding is also intentionally deferred. Renderer dependency
graphs vary, while the ID union, static component map, and generator module map
are compile-time exhaustiveness checks. A source-rewriting scaffold would need
safe TypeScript AST edits and still could not infer the right dependencies,
schema, prompt semantics, or motion. The workbench brief plus the read-only
checker provides a faster loop without brittle rewriting; automate scaffolding
only when repeated additions establish a stable contract.
