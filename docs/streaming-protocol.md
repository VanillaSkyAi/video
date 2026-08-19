[← Documentation home](../README.md) · [Previous: Core concepts](concepts.md) · [Next: Security →](security.md)

# Streaming protocol

`createVideoHandler` returns validated server-sent events and `useVideo` consumes
them. Normal applications do not parse SSE or reduce events themselves.

The internal protocol is deterministic and versioned. A run starts once, adds or
patches only complete validated scenes, and terminates exactly once as complete,
error, or aborted. Every event has a run ID and sequence. Completion carries the
authoritative snapshot and drift-detection checksum.

Persist `video.video` when replay, editing, or export is required. Played scenes
are immutable; patches may affect only future scenes. See the [protocol reference](reference/protocol.md)
when implementing infrastructure rather than an ordinary SDK integration.
