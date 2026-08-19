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

## First-release repository prerequisite

The first public release runs only from the fresh repository
`VanillaSkyAi/video`. Create that repository from the reviewed candidate tree
without importing Git history or tags from `VanillaSkyAi/vanillasky-sdk`. The
superseded repository has an unrelated historical `v0.1.0`; never move,
rewrite, delete, or reuse that tag for this package. The workflow has an
always-visible repository identity job and fails if a release tag is pushed in
the superseded repository.

Before creating the first tag in the fresh repository, confirm that the exact
candidate is on a green `main` and that the tag is absent:

```bash
git fetch origin main --tags
npm run release:preflight
```

The preflight fails unless the remote and package metadata both name the fresh
repository, the clean checkout is exactly approved `origin/main`, and
`v0.1.0` is absent locally and remotely. Do not push the release tag until it
passes. A local manifest with
`pending-annotated` describes the candidate's local state only; it is not proof
that a similarly named tag is absent from another repository.

### Bootstrap npm once

npm only allows a trusted publisher to be configured after its package exists.
For `0.1.0` only, create a one-day granular token with read/write access to the
`@vanillaskyai` package scope, no organization-management access, and bypass
2FA enabled. A package-specific token cannot target a package that does not yet
exist. Add the token to the fresh GitHub repository as
`NPM_BOOTSTRAP_TOKEN`. The release still runs on GitHub with `id-token: write`
and publishes with provenance; the token supplies registry authentication for
this first version only.

Immediately after `0.1.0` is verified, configure the permanent publisher:

```bash
npm trust github @vanillaskyai/video \
  --file release.yml \
  --repo VanillaSkyAi/video \
  --env npm \
  --allow-publish
```

Then revoke the bootstrap token on npm, delete the `NPM_BOOTSTRAP_TOKEN` GitHub
secret, and set the package to require two-factor authentication while
disallowing token publication. All later releases use OIDC only.

## Prepare a candidate

Keep `package.json`, `package-lock.json`, and `CHANGELOG.md` on exactly the same
version. Start from an up-to-date branch, run the complete local dry run, and
review its deterministic manifest before opening the release pull request:

```bash
npm version patch --no-git-tag-version
# edit CHANGELOG.md
npm run release:dry-run
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: release vX.Y.Z"
```

The local command makes no tag, registry, GitHub release, or site change. It
builds and packs exactly once, computes SHA-512 and SHA-256, and passes that one
immutable tarball to every artifact-facing verifier. It never repacks between
the public API, package-size, Vite, Next.js, documented-example, and browser
gates. The command prints a deterministic `release-manifest.json`; set
`VANILLASKY_RELEASE_OUTPUT_DIR` to retain the manifest, tarball, and generated
release notes in a local directory for review. Otherwise they remain temporary.

For a prerelease, use
`npm version prerelease --preid=beta --no-git-tag-version`. Prereleases publish
under npm's `next` dist-tag and must be strictly newer than `latest`.

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

Publish the exact workflow-produced tarball and verify its registry integrity
before merging the site adoption branch. Never rebuild or repack between npm
publish and the site handoff: the prepared site lockfile pins those exact bytes,
and deploying the site before npm publication must fail rather than advertise
an install command for an unavailable package.

## Complete the website handoff

Every stable release must be adopted by the
[VanillaSky site](https://github.com/VanillaSkyAi/vanillasky-site) from an
isolated site branch:

```bash
npm install @vanillaskyai/video@X.Y.Z --save-exact
npm run verify:sdk-latest
npx vanillasky add --all --overwrite
npx vanillasky sync
npm run sync:docs
npm run verify
```

Commit the exact dependency and lockfile plus regenerated templates and docs.
Merge only after site CI is green, then verify the production deployment. An
npm publish is not a completed stable release until this handoff succeeds.

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
