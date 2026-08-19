import type { ChildProcess } from "node:child_process";

export function stopProcessTree(
  server: ChildProcess,
  options?: { graceMs?: number; exitTimeoutMs?: number },
): Promise<void>;
