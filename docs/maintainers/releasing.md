# Releasing VanillaSky Video

Releases are immutable npm packages backed by an annotated Git tag, complete
consumer verification, and npm provenance. Only repository maintainers publish
releases.

Publishing normally uses GitHub's short-lived OIDC identity. The publish job
needs `id-token: write`; verification jobs do not need write permissions or an
npm token.

Release automation uses Node `22.23.1` and the repository-locked `npm@11.17.0`.
Signing is deferred until signing-key ownership is established. Until then, an
annotated tag is mandatory, but a cryptographically signed tag is not.
The current automation is intentionally scoped to the `0.x` public beta line:
before a stable `1.0.0`, remove the beta-only release-note and compatibility
checks in a separately reviewed change.

## Before creating a release tag

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

## Prepare a candidate

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

## Tag and publish

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

## Verify from outside the repository

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
