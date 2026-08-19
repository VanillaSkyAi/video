import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

export interface TrustedSourceProcessOptions {
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  operation?: string;
}

export class TrustedSourceProcessError extends Error {
  readonly kind: "timeout" | "output" | "exit";

  constructor(kind: TrustedSourceProcessError["kind"], message: string) {
    super(message);
    this.name = "TrustedSourceProcessError";
    this.kind = kind;
  }
}

function minimalEnvironment(): NodeJS.ProcessEnv {
  const names = ["PATH", "SYSTEMROOT", "WINDIR", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL"] as const;
  return Object.fromEntries(names.flatMap((name) => process.env[name] == null ? [] : [[name, process.env[name]]])) as NodeJS.ProcessEnv;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // The detached group may disappear between child close and cleanup. macOS
    // can report that race as EPERM rather than ESRCH; either means there is no
    // process group this runner can still signal.
    if (code === "ESRCH" || code === "EPERM") return false;
    throw error;
  }
}

async function stopProcessGroup(pid: number): Promise<void> {
  if (!signalProcessGroup(pid, "SIGTERM")) return;
  await delay(100);
  if (signalProcessGroup(pid, 0 as unknown as NodeJS.Signals)) {
    signalProcessGroup(pid, "SIGKILL");
    await delay(25);
  }
}

/**
 * Runs customer-owned template source as trusted build code with resource bounds.
 * Local JavaScript cannot be fully sandboxed portably; this isolates protocol IO,
 * removes the parent environment, bounds output/time, and cleans up process trees.
 */
export async function runTrustedSourceProcess(
  args: readonly string[],
  options: TrustedSourceProcessOptions,
): Promise<string> {
  if (process.platform === "win32") {
    throw new Error(
      "Project template execution is not supported on Windows because portable process-tree cleanup cannot be guaranteed. Use --builtin from Windows or run project template commands in WSL.",
    );
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const operation = options.operation ?? "loading";
  let cleanup: Promise<void> | undefined;
  let processId: number | undefined;
  const result = new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [...args], {
      cwd: options.cwd,
      detached: true,
      env: minimalEnvironment(),
      stdio: ["ignore", "pipe", "pipe", "pipe"],
    });
    processId = child.pid;
    const protocol: Buffer[] = [];
    const diagnostics: Buffer[] = [];
    let outputBytes = 0;
    let failure: TrustedSourceProcessError | undefined;
    let settled = false;

    const fail = (error: TrustedSourceProcessError): void => {
      if (failure) return;
      failure = error;
      if (child.pid != null) cleanup = stopProcessGroup(child.pid);
    };
    const collect = (target: Buffer[]) => (chunk: Buffer | string): void => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      outputBytes += buffer.byteLength;
      if (outputBytes > maxOutputBytes) {
        fail(new TrustedSourceProcessError("output", `${operation} output exceeded ${maxOutputBytes} bytes`));
        return;
      }
      target.push(buffer);
    };
    child.stdout?.on("data", collect(diagnostics));
    child.stderr?.on("data", collect(diagnostics));
    const protocolStream = child.stdio[3];
    if (protocolStream && "on" in protocolStream) protocolStream.on("data", collect(protocol));

    const timer = setTimeout(() => {
      fail(new TrustedSourceProcessError("timeout", `${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (failure) {
        reject(failure);
        return;
      }
      if (code !== 0) {
        const detail = Buffer.concat(diagnostics).toString("utf8").trim();
        reject(new TrustedSourceProcessError(
          "exit",
          detail || `template loader exited with ${code ?? signal ?? "an error"}`,
        ));
        return;
      }
      resolve(Buffer.concat(protocol).toString("utf8"));
    });
  });
  try {
    return await result;
  } finally {
    if (processId != null) await (cleanup ?? stopProcessGroup(processId));
  }
}
