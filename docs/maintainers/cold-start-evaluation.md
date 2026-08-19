# Cold-start evaluation

Use this maintainer-only procedure when the explicit task is to evaluate the
published integration experience rather than build an ordinary application.

1. Identify one npm version or candidate tarball and its source commit.
   Maintainers can create the candidate with `npm pack --silent --json`.
2. Create a fresh consumer outside the SDK repository with no workspace links,
   copied source, shared `node_modules`, or internal imports.
3. Use only the README and packaged public documentation until the consumer
   result and friction log are complete.
4. Ask the developer to place missing provider credentials in an ignored local
   environment file. Never accept secrets in chat or invent a fallback
   provider.
5. Run the documented tests, typecheck, production build, and real browser path.
6. Record defects, ambiguities, workarounds, assumptions, and unverified gates
   before proposing SDK changes.

Do not modify the SDK, CI, release state, or GitHub branches as part of the
evaluation. Do not inspect SDK source, tests, or internal documentation to work
around a public integration problem. Builder fixes are a separate task.
