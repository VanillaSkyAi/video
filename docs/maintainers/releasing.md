# Releasing VanillaSky Video

Releases are immutable npm packages backed by an annotated Git tag, complete
consumer verification, and npm provenance. Only repository maintainers publish
releases.

Publishing normally uses GitHub's short-lived OIDC identity. The publish job
needs `id-token: write`; verification jobs do not need write permissions or an
npm token.

Release automation uses Node `22.23.1` and the repository-locked `npm@11.17.0`.
The SDK runtime remains supported on Node 20 and newer, but the pinned
`@changesets/cli@3.0.1` supports only `^22.11 || ^24 || >=26`. Node 20 CI still
runs all pure SDK/runtime coverage and the build; only tests that actually
spawn the Changesets CLI use that exact engine boundary. The required Node 22
`verify` job runs the complete real-CLI integration suite, so release-tool
coverage cannot pass solely through the Node 20 compatibility lane.
Signing is deferred until signing-key ownership is established. Until then, an
annotated tag is mandatory, but a cryptographically signed tag is not.
The current automation is intentionally scoped to the `0.x` public beta line:
before a stable `1.0.0`, remove the beta-only release-note and compatibility
checks in a separately reviewed change.

Changesets records the release intent and summary with each pull request.
Package-affecting pull requests name
`@vanillaskyai/video` with a `patch`, `minor`, or `major` bump; repository-only
changes use an empty Changeset. On each protected `main` update, the Version
Packages workflow uses Changesets prerelease mode to generate or refresh the
exact `changeset-release/main` branch. The current intended cycle uses the
`beta` tag, so the pending `0.1.1` patch becomes `0.1.1-beta.0`.

The workflow does not open, approve, or merge a pull request. It prints a direct
compare URL; a normally authenticated maintainer or agent opens the PR. CI
accepts consumed pending records only when it proves the branch is canonical,
the commit matches the deterministic generated-commit identity and one-parent
shape from the exact current `main` base, and regenerating from that base
produces the same tree byte-for-byte. The fixed commit fields constrain the
generated shape; they do not independently prove GitHub Actions provenance.

CI verifies that generated tree from the exact base commit and its locked
Changesets toolchain before any job installs or executes head package code. All
head-executing jobs depend on that safety gate, and the required `verify` check
fails explicitly when the gate fails. Ordinary pull requests retain the normal
install-then-governance path.

This lifecycle prepares and reviews version files only. It does **not** publish,
tag, create a GitHub release, or deploy the site. The existing tag-triggered
publisher remains blocked until the next, separately reviewed main-only publish
change lands. Do not use `release:prepare`, push a version tag, or publish a
candidate during this boundary.

## Prepare the Version Packages pull request

After package-affecting work reaches protected `main`, wait for the `Version
Packages` workflow and open the compare URL from its summary:

```text
https://github.com/VanillaSkyAi/video/compare/main...changeset-release/main?expand=1
```

The generated pull request consumes all pending Changesets, updates
`CHANGELOG.md`, `package.json`, `package-lock.json`, public version references,
example dependency pins, fixtures, and the bundled skill. Re-running generation
from the same main SHA is byte-idempotent. Every subsequent `main` update
regenerates from that exact SHA; a divergent or racing dedicated branch update
fails closed.

Review and merge the Version Packages PR like any other protected change. Do
not manually edit generated files on the branch. The public site adopts a
published stable SDK later through its separate private workflow.

## Temporarily blocked publishing reference

The commands below describe the publisher that is still present in the
repository. They are retained only until the main-only publishing change
replaces them and must not be run during this transition.

### Before creating a release tag

`VanillaSkyAi/video` is the canonical repository. npm publishing uses the
trusted publisher bound to `.github/workflows/release.yml`, this repository,
and the `npm` GitHub environment. The release job receives a short-lived OIDC
identity and never reads a long-lived npm token.

After the release pull request is merged and `main` is green, confirm that the
exact candidate is approved and its version tag is absent:

```bash
git fetch origin main --tags
npm run release:preflight
```

The preflight fails unless the remote and package metadata name the canonical
repository, the clean checkout exactly matches approved `origin/main`, the
package version is valid SemVer, and that version's tag is absent locally and
remotely. Do not create or push the tag until it passes.

### Prepare a candidate

Start from an up-to-date release branch with the pinned toolchain. Write the
candidate notes under `## Unreleased`, then prepare one explicit SemVer target.
The command promotes those notes and synchronizes the package manifest,
lockfile, README, public API status, install guides, examples, fixtures, and
bundled skill. Re-running the same target is idempotent.

```bash
npm run release:prepare -- X.Y.Z
git diff --check
git diff
git add --all
git commit -m "chore: release vX.Y.Z"
npm run release:dry-run
```

Review the complete diff before committing. The dry run intentionally requires
a clean committed tree, makes no tag, registry, GitHub release, or site change,
builds and packs exactly once, computes SHA-512 and SHA-256, and passes that one
immutable tarball to every artifact-facing verifier. It never repacks between
the public API, package-size, Vite, Next.js, documented-example, and browser
gates. The command prints a deterministic `release-manifest.json`; set
`VANILLASKY_RELEASE_OUTPUT_DIR` to retain the manifest, tarball, and generated
release notes in a local directory for review. Otherwise they remain temporary.

For a prerelease, pass its complete target, for example
`npm run release:prepare -- 0.1.1-beta.0`. Prereleases publish under npm's
`next` dist-tag and must be strictly newer than `latest`.

### Tag and publish

After the release pull request is merged and the approved main commit is green,
create an annotated tag that exactly matches `package.json`:

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

The release workflow verifies that the tag commit descends from approved main,
builds one tarball, and passes that exact path and integrity to every consumer
gate. It verifies package metadata, lockfile, changelog, README, examples,
public entry points, browser/server boundaries, Vite, Next.js, package size,
and release notes before the publish job receives OIDC permission.

The tag name must be exactly `v${package.version}`, and `git cat-file` must
identify it as an annotated tag object. Verification, npm publishing, published
package verification, and GitHub release creation run as separate jobs with
only the permissions each needs. GitHub assets are never uploaded with
`--clobber`; a rerun verifies existing bytes instead of replacing them.
An existing release must retain the exact release body, non-draft state,
stable/prerelease classification, approved `main` target, annotated tag, and
candidate asset bytes. A missing asset fails closed on rerun; automation never
repairs or mutates an existing release.

Published npm versions and release assets are immutable. Never overwrite an
asset or reuse a version for different bytes; fix forward with a new version.

Publish the exact workflow-produced tarball and verify its registry integrity.
vanillasky.ai adopts stable npm releases separately through its site-owned
release process. Site automation, credentials, deployment checks, and adoption
instructions stay in that private workspace rather than this public SDK.

### Verify from outside the repository

```bash
npm view @vanillaskyai/video version dist.integrity dist.tarball
mkdir /tmp/vanillasky-consumer && cd /tmp/vanillasky-consumer
npm init -y
npm install @vanillaskyai/video@latest
npm ls @vanillaskyai/video --depth=0
node -e "import('@vanillaskyai/video/react').then(m => { if (!m.useVideo || !m.VideoPlayer) process.exit(1); console.log('React runtime exports verified') })"
```

Confirm the installed artifact contains its reviewed README, public API,
support/security policies, docs, examples, registry, license, and declarations.
