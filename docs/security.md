[← Documentation home](../README.md) · [Previous: Streaming protocol](streaming-protocol.md) · [Next: Errors and recovery →](errors.md)

# Security

The SDK validates protocol shape; your application still owns identity, authorization, data policy, and infrastructure controls.

## Required server controls

- Authenticate the user and tenant before reading the prompt body.
- `createVideoHandler` requires an explicit `authorize` policy. The
  `authorize: "none"` escape hatch is for intentionally non-public in-process
  tests only; do not use it on a billable generation route.
- Allowlist browser origins; CORS is not authentication.
- Bound request bytes, media count, scene count, duration, tokens, concurrency, and cost.
- Keep provider keys, system prompts, tools, signed-URL credentials, and admin tokens server-side.
- Use the same generated template registry on the server and in React; the handler infers validation.
- Treat every project-owned template as trusted application build code and
  review it before using the CLI. Normal `vanillasky list`,
  `vanillasky describe`, `vanillasky add`, `vanillasky sync`, and
  `vanillasky check` commands execute project template modules locally. This
  includes `vanillasky add` previews with `--dry-run` or `--diff`, because the
  CLI must derive the proposed browser and server registries. Resource and
  environment boundaries reduce accidental damage but are not a portable
  JavaScript sandbox.
- Use `--builtin` with `list` or `describe` when you need the packaged catalog
  only. That view does not execute project template modules. Project template
  execution requires macOS, Linux, or WSL because Windows cannot provide the
  process-group cleanup guarantee used by these commands.
- Restrict media domains, types, dimensions, bytes, redirects, and fetch timeouts.
- Propagate cancellation and use timeouts for provider, media, persistence, and export work.
- Return safe typed errors while logging private causes only in protected observability.

Do not log raw source, personalization, authorization headers, provider deltas, or signed media URLs by default. Record request ID, tenant-safe metrics, model ID, timing, event counts, error codes, and token usage.

Treat final configs as customer data. Apply tenant isolation, retention,
encryption, and deletion policy to snapshots and event logs. Report suspected
SDK vulnerabilities through the repository's private process in
[SECURITY.md](../SECURITY.md).
