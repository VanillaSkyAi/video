# Changesets

Every pull request adds one Changeset file so release intent is reviewed with
the code. Run `npm run changeset` for a package change, or
`npm run changeset -- --empty` for repository-only tooling and documentation.

Package changes must name `@vanillaskyai/video` and choose `patch`, `minor`, or
`major`. No branch is currently exempt. A future Version Packages generator
must add its narrow exemption together with canonical repository, exact branch,
and GitHub Actions bot provenance checks.

Do not modify, rename, or delete a pending Changeset already owned by `main`.
The existing `release:prepare` command does not consume pending records; the
Version Packages lifecycle pull request must consume them before a release.

Start the body with a one-line summary. Put any longer explanation after a
blank line so the generated changelog keeps a readable summary bullet.
