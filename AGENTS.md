# VanillaSky Video agent instructions

These rules apply to every coding agent in this repository. Public behavior of
`@vanillaskyai/video` is a consumer contract; repository-local success is not
sufficient evidence.

## Before tests and builds

Print and verify the working directory, repository root, commit, status, Node,
npm, package name, and package version before running a gate:

```bash
pwd
git rev-parse --show-toplevel
git rev-parse HEAD
git status --short --branch
node --version
npm --version
node -p 'require("./package.json").name + "@" + require("./package.json").version'
```

Use an isolated worktree for implementation. Preserve unrelated user changes.
Trace the existing data flow before editing, write a failing regression first,
and verify the smallest relevant suite before broad gates.

## Public API and runtime boundaries

- `PUBLIC-API.md` and `tests/fixtures/public-api-surface.json` freeze the six
  public entry points. Any change requires an explicit contract decision and a
  packed declaration/runtime verification update.
- Root, React, templates, catalog, server, and test entry points must preserve
  their documented browser/server boundaries. Server imports must not require
  React; browser-safe entries must not import Node built-ins.
- Providers are application-owned. Vercel AI SDK is the canonical structural
  integration; do not add provider SDKs as package dependencies or expose keys,
  provider metadata, or private errors to browser surfaces.
- Persisted `Video` values are untrusted input. Parse them with the public
  parser before rendering and preserve the current schema-version policy.

## Consumer integrations

Use the root README, `docs/agent-integration.md`, or the optional `vanillasky`
skill for ordinary integrations. Start with input, one provider route,
`useVideo()`, `VideoPlayer`, and the built-in templates. Add optional features
only when the application needs them.

Only for an explicit cold-start evaluation, follow
`docs/maintainers/cold-start-evaluation.md`. Keep evaluation findings separate
from builder fixes and do not change SDK code, CI, branches, or pull requests as
part of that evaluation.

## Exact consumer verification

For package, CLI, generated-template, documentation, export, or public API
changes:

1. Build and pack one identified tarball.
2. Install that tarball in a fresh directory outside the repository.
3. Do not use workspace links, repository-relative imports, shared
   `node_modules`, unpublished `dist`, or copied internal source.
4. Run the documented commands verbatim with untouched strict TypeScript
   settings.
5. Exercise the running app in a browser and inspect console/page errors.
6. Record the candidate commit, tarball integrity, commands, failures, and
   consumer result.

Source, a Git checkout, a packed tarball, and a published npm artifact are
different artifacts. Never report one as evidence for another.

## Source-owned templates

CLI-generated files are customer-owned production source. They must compile in
current strict Vite/Next consumers, remain deterministic, and import only
documented public entry points. `create`, `add`, `sync`, and `check` execute
trusted project source through the bounded minimal-environment subprocess
runner. Preserve its timeout, output, process-tree, environment, and diagnostic
redaction guarantees.

The package owns local source templates only. Remote/community template
distribution, template lockfiles, and a hosted registry require a separate
product decision.

## Documentation and release integrity

Quickstarts are executable product surfaces. Prefer one complete application
over fragments requiring hidden glue, and compile marked snippets from the
installed tarball. Stable releases require package, tag, changelog, artifact,
and public-site coherence. The site owns its private adoption workflow; keep
its automation and credentials out of this public SDK repository.

Record customer-visible changes under `## Unreleased` in `CHANGELOG.md` in the
pull request that makes them; repository-only tooling, tests, workflows,
governance, and maintainer documentation need no entry.

Releases are a reviewed version-bump pull request followed by an annotated tag
on the merged commit. The tag publisher accepts only the exact current
`origin/main` commit and publishes through OIDC.

A breaking change, including a pre-1.0 minor, requires explicit approval from
the repository owner before implementation or merge. Breaking-change notes and migration
evidence are required context, but migration evidence does not count as
approval.

Public examples and fixtures must use fictional people or role-based audience
copy; never use the repository owner's identity.

Never publish, tag, create a release, move dist-tags, modify production secrets,
or deploy as an implicit side effect of a local verification task.

## Security

Never place credentials, customer data, private media URLs, or raw provider
metadata in inputs, events, fixtures, logs, browser bundles, screenshots, or
retained evidence. Public-facing requests must fail closed behind host-owned
authentication, authorization, limits, and media policy.
