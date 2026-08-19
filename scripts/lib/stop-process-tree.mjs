import { execFileSync } from "node:child_process";
import { once } from "node:events";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function signalProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

async function waitForUnixProcessGroup(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!signalProcessGroup(pid, 0)) return;
    await delay(25);
  }
  if (signalProcessGroup(pid, 0)) {
    throw new Error(`Process group ${pid} did not exit within ${timeoutMs}ms`);
  }
}

export async function stopProcessTree(server, { graceMs = 1_000, exitTimeoutMs = 5_000 } = {}) {
  const pid = server.pid;
  if (!pid) return;
  const rootExit = server.exitCode == null ? once(server, "exit") : Promise.resolve();

  if (process.platform === "win32") {
    try { execFileSync("taskkill", ["/PID", String(pid), "/T"], { stdio: "ignore" }); } catch { /* already stopped */ }
    await delay(graceMs);
    try { execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* already stopped */ }
    await Promise.race([rootExit, delay(exitTimeoutMs)]);
    return;
  }

  signalProcessGroup(pid, "SIGTERM");
  await delay(graceMs);
  if (signalProcessGroup(pid, 0)) signalProcessGroup(pid, "SIGKILL");
  await Promise.race([rootExit, delay(exitTimeoutMs)]);
  await waitForUnixProcessGroup(pid, exitTimeoutMs);
}
