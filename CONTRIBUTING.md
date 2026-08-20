# Contributing

VanillaSky is an open-source video response layer. Changes should preserve the
versioned event protocol and keep external services behind explicit adapters.

## Local checks

Use Node.js 22 for development and run:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run acceptance:replay
npm run build
npm run example:install
npm run example:build
npm run browser:test
```

Protocol changes need reducer and stream tests. Runtime code must never import
the built-in registry. Canonical template changes live in `src/visual-system`;
generated installable copies live in `registry/items`. Templates need valid
default variables and must continue to pass the all-template install and render
test. Reusable authoring primitives use the `primitive` registry layer and remain
directly installable with `vanillasky add`. The CLI may refresh files marked as
generated, but must not silently overwrite customer-owned template or primitive
source.
Provider credentials and customer secrets must never enter browser bundles,
video inputs, fixtures, or event logs.

## Changesets

Every pull request must add a Changeset file. For package behavior, bundled
source, public package documentation, or package metadata, run:

```bash
npm run changeset
```

Select `@vanillaskyai/video` and choose `patch`, `minor`, or `major`. Use
`npm run changeset -- --empty` for repository-only tooling, tests, workflows,
maintainer documentation, or governance. No branch is currently exempt. A
future Version Packages generator must introduce its exemption together with
canonical repository, exact branch, and GitHub Actions bot provenance checks.
Start each Changeset body with a one-line summary; put details and any migration
headings after a blank line. Before opening a pull request, commit the Changeset
and run:

```bash
npm run changeset:status
npm run changeset:check
```

Pending Changesets are immutable after merge. The current `release:prepare`
command does not consume them; they must be consumed by the Version Packages
lifecycle pull request before the next release.

## Maintainer guides

- [Acceptance](docs/maintainers/acceptance.md) defines the deterministic and live-provider
  quality gates.
- [Releasing](docs/maintainers/releasing.md) defines versioning, publishing, verification,
  and the boundary with the separate site-owned adoption process.

## Release checks

CI verifies Node 20 and 22, React 18 and 19, and Chromium, Firefox, and WebKit.
Before a release candidate, run both provider harnesses in a server-only
environment and review the rendered artifacts using the [acceptance guide](docs/maintainers/acceptance.md).
Replay passing is necessary but is not evidence of live-provider latency or
visual quality.
