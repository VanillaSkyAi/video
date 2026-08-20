# Changesets

Every pull request adds one Changeset file so release intent is reviewed with
the code. Run `npm run changeset` for a package change, or
`npm run changeset -- --empty` for repository-only tooling and documentation.

Package changes must name `@vanillaskyai/video` and choose `patch`, `minor`, or
`major`. Generated `changeset-release/*` Version Packages branches are exempt
because they consume the pending files.

Start the body with a one-line summary. Put any longer explanation after a
blank line so the generated changelog keeps a readable summary bullet.
