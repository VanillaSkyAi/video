# Changesets

Every pull request adds one Changeset file so release intent is reviewed with
the code. Run `npm run changeset` for a package change, or
`npm run changeset -- --empty` for repository-only tooling and documentation.

Package changes must name `@vanillaskyai/video` and choose `patch`, `minor`, or
`major`. The only exception is the generated `changeset-release/main` Version
Packages branch. CI accepts that branch only from `VanillaSkyAi/video` into its
own `main`, with fixed generated-commit author/committer fields, subject, and
one-parent shape plus a tree that it reproduces byte-for-byte from the pull
request's exact base commit. Those forgeable commit fields constrain the
generated shape; they are not proof of GitHub Actions provenance. A copied
branch name, fork, stale base, extra commit, or edited generated file fails.

Do not modify, rename, or delete a pending Changeset already owned by `main`.
The verified Version Packages branch is the only path allowed to consume those
records. The committed `.changeset/pre.json` mode and archived
`.changeset/pre/*.md` release evidence are immutable on ordinary branches; only
the byte-reproduced generated branch may update them.

Start the body with a one-line summary. Put any longer explanation after a
blank line so the generated changelog keeps a readable summary bullet.
