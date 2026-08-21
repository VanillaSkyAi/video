#!/usr/bin/env node

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { parseNpmPackJson } from "./lib/parse-npm-pack-json.mjs";
import { selectPackedArtifact } from "./lib/release-integrity.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SERVER_START_TIMEOUT_MS = 30_000;
const workspace = mkdtempSync(join(tmpdir(), "vanillasky-onboarding-"));
const app = join(workspace, "video-demo");
const evidenceDirectory = process.env.VANILLASKY_EVIDENCE_DIR ? resolve(process.env.VANILLASKY_EVIDENCE_DIR) : undefined;
const commandLog = [];
const commandEnvironment = () => ({ ...process.env, npm_config_cache: join(workspace, "npm-cache") });
const run = (command, args, cwd) => {
  commandLog.push(`${cwd}$ ${command} ${args.join(" ")}`);
  return execFileSync(command, args, { cwd, stdio: "inherit", env: commandEnvironment() });
};
const runCapture = (command, args, cwd, { expectFailure = false } = {}) => {
  commandLog.push(`${cwd}$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: commandEnvironment(),
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (!expectFailure && result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(" ")}\n${output}`);
  }
  return { status: result.status, output };
};
let cli;
const runCli = (args, options) => runCapture(process.execPath, [cli, ...args], app, options);

function hashTree(directory, excludedTopLevel = new Set()) {
  const hash = createHash("sha256");
  const visit = (current, prefix = "") => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (!prefix && excludedTopLevel.has(entry.name)) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(current, entry.name);
      hash.update(entry.isDirectory() ? `directory:${path}\0` : `file:${path}\0`);
      if (entry.isDirectory()) visit(absolute, path);
      else hash.update(readFileSync(absolute));
    }
  };
  if (existsSync(directory)) visit(directory);
  return hash.digest("hex");
}
const generatedHash = () => hashTree(join(app, "vanillasky"));
const projectHash = () => hashTree(app, new Set([".git", "dist", "node_modules"]));

function parseCreatedPreviewDiff(output) {
  const lines = output.replaceAll("\r\n", "\n").split("\n");
  const files = new Map();
  for (let index = 0; index < lines.length;) {
    if (!lines[index].startsWith("--- ")) {
      index += 1;
      continue;
    }
    const path = lines[index].slice(4);
    if (lines[index + 1] !== `+++ ${path}` || !lines[index + 2]?.startsWith("@@ ")) {
      throw new Error(`Could not parse packed add preview for ${path}`);
    }
    index += 3;
    const after = [];
    while (index < lines.length && !lines[index].startsWith("--- ")) {
      const line = lines[index];
      if (line.startsWith("-")) {
        throw new Error(`Expected clean-project preview to create ${path}, but it removes existing bytes`);
      }
      if (line.startsWith("+")) after.push(line.slice(1));
      else if (line !== "") throw new Error(`Unexpected packed add preview line for ${path}: ${line}`);
      index += 1;
    }
    files.set(path, after.join("\n"));
  }
  return files;
}

function assertProjectImports() {
  const sourceRoot = join(app, "vanillasky");
  const allowedSdkImports = new Set(["@vanillaskyai/video/templates", "@vanillaskyai/video/server"]);
  const allowedExternalImports = new Set(["react", "react/jsx-runtime"]);
  const sourceFiles = readdirSync(sourceRoot, { recursive: true })
    .filter((path) => typeof path === "string" && /\.(?:ts|tsx)$/.test(path))
    .map((path) => join(sourceRoot, path));
  const resolveRelativeImport = (source, specifier) => {
    const base = resolve(dirname(source), specifier);
    const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
    if (!candidates.some((candidate) => existsSync(candidate))) {
      throw new Error(`Generated source has an unresolved relative import: ${relative(app, source)} -> ${specifier}`);
    }
    const fromRoot = relative(sourceRoot, base);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
      throw new Error(`Generated source imports outside the customer-owned tree: ${relative(app, source)} -> ${specifier}`);
    }
  };
  for (const source of sourceFiles) {
    const contents = readFileSync(source, "utf8");
    const specifiers = [...contents.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)["']([^"']+)["']/g)]
      .map((match) => match[1]);
    for (const specifier of specifiers) {
      if (specifier.startsWith(".")) {
        resolveRelativeImport(source, specifier);
      } else if (specifier.startsWith("@vanillaskyai/video")) {
        if (!allowedSdkImports.has(specifier)) {
          throw new Error(`Generated source uses an undocumented SDK import: ${relative(app, source)} -> ${specifier}`);
        }
      } else if (!allowedExternalImports.has(specifier)) {
        throw new Error(`Generated source uses an unexpected external import: ${relative(app, source)} -> ${specifier}`);
      }
    }
  }
}
let server;
let browser;

try {
  run("npm", ["exec", "--yes", "create-vite@9.1.2", "--", "video-demo", "--no-interactive", "--template", "react-ts"], workspace);
  run("npm", ["install", "--no-audit", "--no-fund"], app);
  let installSpec = process.env.VANILLASKY_INSTALL_SPEC;
  let candidateArtifact;
  if (!installSpec) {
    candidateArtifact = selectPackedArtifact({
      providedPath: process.env.VANILLASKY_PACKED_TARBALL
        ? resolve(process.env.VANILLASKY_PACKED_TARBALL)
        : undefined,
      expectedIntegrity: process.env.VANILLASKY_EXPECTED_INTEGRITY,
      expectedSha256: process.env.VANILLASKY_EXPECTED_SHA256,
      packArtifact: () => {
        run("npm", ["run", "build"], root);
        const [packed] = parseNpmPackJson(execFileSync("npm", [
          "pack", "--silent", "--json", "--ignore-scripts", "--pack-destination", workspace,
        ], { cwd: root, encoding: "utf8" }));
        return { path: join(workspace, packed.filename), integrity: packed.integrity };
      },
    });
    installSpec = candidateArtifact.path;
  }
  run("npm", ["install", "--no-audit", "--no-fund", installSpec, "tsx@4.23.12"], app);
  cli = join(app, "node_modules", "@vanillaskyai", "video", "bin", "vanillasky.js");
  if (existsSync(join(app, "vanillasky"))) throw new Error("Default onboarding unexpectedly copied templates");
  const tsconfigPaths = ["tsconfig.json", "tsconfig.app.json", "tsconfig.node.json"]
    .filter((path) => existsSync(join(app, path)));
  const tsconfigSnapshot = Object.fromEntries(tsconfigPaths.map((path) => [path, readFileSync(join(app, path), "utf8")]));
  const strictSettings = Object.values(tsconfigSnapshot).join("\n");
  for (const setting of ['"noEmit": true', '"noUnusedLocals": true', '"noUnusedParameters": true']) {
    if (!strictSettings.includes(setting)) throw new Error(`Current Vite React TypeScript scaffold is missing ${setting}`);
  }

  const builtinList = runCli(["list", "--builtin", "--json"]).output;
  if (!JSON.parse(builtinList).some(({ id }) => id === "bigNumber")) throw new Error("Packed list did not include bigNumber");
  const builtinDescription = JSON.parse(runCli(["describe", "bigNumber", "--builtin", "--json"]).output);
  if (builtinDescription.id !== "bigNumber") throw new Error("Packed describe returned the wrong template");
  const previewBefore = projectHash();
  const dryRun = runCli(["add", "bigNumber", "--dry-run"]).output;
  const diff = runCli(["add", "bigNumber", "--diff"]).output;
  if (projectHash() !== previewBefore) throw new Error("Packed add preview applied a proposed write in the clean-room fixture");
  for (const path of [
    "vanillasky/templates/bigNumber.tsx",
    "vanillasky/index.ts",
    "vanillasky/server.ts",
  ]) {
    if (!dryRun.includes(path) || !diff.includes(path)) throw new Error(`Packed add previews omitted ${path}`);
  }
  const previewAfter = parseCreatedPreviewDiff(diff);
  if (previewAfter.size === 0) throw new Error("Packed add --diff did not expose any proposed after bytes");
  runCli(["add", "bigNumber"]);
  for (const [path, expected] of previewAfter) {
    const actual = readFileSync(join(app, path), "utf8");
    if (actual !== expected) throw new Error(`Packed add preview bytes did not match the applied file: ${path}`);
  }
  const repeatedAddTreeHash = generatedHash();
  runCli(["add", "bigNumber"]);
  if (generatedHash() !== repeatedAddTreeHash) {
    throw new Error("Repeating packed add changed the customer-owned template tree");
  }

  writeFileSync(join(app, "src", "App.tsx"), `import { useEffect, useState } from "react";
import { VideoPlayer, useVideo } from "@vanillaskyai/video/react";

const stable = (value: unknown): string => Array.isArray(value) ? "[" + value.map(stable).join(",") + "]" : value && typeof value === "object" ? "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stable((value as Record<string, unknown>)[key])).join(",") + "}" : JSON.stringify(value);
const checksum = (value: unknown) => { let hash = 0x811c9dc5; for (const character of stable(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; } return "fnv1a32:" + hash.toString(16).padStart(8, "0"); };
const fetcher: typeof fetch = async (_url, init) => {
  const request = JSON.parse(String(init?.body));
  const subject = String(request.input.input).split(" ")[0];
  const scene = { id: "result", templateId: "bigNumber", variables: { texts: subject + "'s quarter", value: 142, label: "customer conversations" }, timing: { fixedDuration: 10, startTime: 0, endTime: 10 } };
  const style = { brand: { font: "Inter", scriptFont: "Caveat", background: { type: "gradient", colors: ["#8711C1", "#2167E3"] }, colors: { primary: "#00E5A0", secondary: "#006BE5", foreground: "#FFFFFF", surface: "#0A0A14", surfaceElevated: "#14152A", muted: "#A7A6B0" } } };
  const snapshot = { schemaVersion: "0.1", orientation: "portrait", scenes: [scene], style };
  const events = [
    { protocolVersion: "0.4", type: "response.start", eventId: "run:0", runId: "run", sequence: 0, data: { requestId: request.requestId, format: { orientation: "portrait" }, style, capabilities: request.capabilities } },
    { protocolVersion: "0.4", type: "scene.add", eventId: "run:1", runId: "run", sequence: 1, data: { scene, position: 0, revision: 0 } },
    { protocolVersion: "0.4", type: "response.complete", eventId: "run:2", runId: "run", sequence: 2, data: { finishReason: "stop", snapshot, checksum: checksum(snapshot) } },
  ];
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\\n\\n").join("") + "data: [DONE]\\n\\n", { headers: { "content-type": "text/event-stream", "x-vanillasky-video-stream": "0.4" } });
};

export default function App() {
  const [input, setInput] = useState("Acme completed 142 customer conversations.");
  const video = useVideo({ endpoint: "/api/video", fetcher });
  const generate = (source: string) => video.generate({ input: source });
  useEffect(() => {
    void generate(input);
  }, []);
  return <main>
    <label>Input <textarea aria-label="Input" value={input} onChange={(event) => setInput(event.target.value)} /></label>
    <button onClick={() => generate(input)}>Generate</button>
    <output data-testid="status">{video.status === "complete" ? "Complete:" + video.video?.scenes.length + ":" + input.split(" ")[0] : video.status}</output>
    <VideoPlayer {...video.playerProps} />
  </main>;
}
`);
  run("npm", ["run", "build"], app);

  let serverOutput = "";
  const viteCli = join(app, "node_modules", "vite", "bin", "vite.js");
  server = spawn(process.execPath, [viteCli, "--host", "127.0.0.1", "--port", "4175", "--strictPort"], {
    cwd: app,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const captureServerOutput = (chunk) => {
    serverOutput = `${serverOutput}${chunk}`.slice(-8_000);
  };
  server.stdout.on("data", captureServerOutput);
  server.stderr.on("data", captureServerOutput);
  const serverDeadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < serverDeadline) {
    try { if ((await fetch("http://127.0.0.1:4175/")).ok) break; } catch { /* starting */ }
    if (server.exitCode != null) {
      throw new Error(`Clean-room Vite server exited with code ${server.exitCode}:\n${serverOutput}`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  try {
    if (!(await fetch("http://127.0.0.1:4175/")).ok) throw new Error("unhealthy response");
  } catch {
    throw new Error(`Clean-room Vite server did not start within ${SERVER_START_TIMEOUT_MS}ms:\n${serverOutput}`);
  }
  browser = await chromium.launch();
  const context = await browser.newContext();
  if (evidenceDirectory) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const waitForStatus = async (expected) => {
    try {
      await page.getByTestId("status").filter({ hasText: expected }).waitFor({ timeout: 10_000 });
    } catch (error) {
      const actual = await page.getByTestId("status").textContent().catch(() => "missing");
      throw new Error(`Expected ${expected}, received ${actual}; browser errors: ${browserErrors.join(" | ") || "none"}`, { cause: error });
    }
  };
  await page.goto("http://127.0.0.1:4175/");
  await waitForStatus("Complete:1:Acme");
  try {
    await page.locator('[data-template-id="bigNumber"]').waitFor({ timeout: 10_000 });
  } catch (error) {
    const player = page.getByTestId("video-player");
    const playerCount = await player.count();
    throw new Error(`Built-in frame did not render; player count=${playerCount}, status=${playerCount ? await player.getAttribute("data-status") : "missing"}, scenes=${playerCount ? await player.getAttribute("data-scenes") : "missing"}, browser errors=${browserErrors.join(" | ") || "none"}, body=${await page.locator("body").innerText()}`, { cause: error });
  }
  await page.getByText("Acme's quarter").waitFor({ timeout: 10_000 });
  await page.getByLabel("Input").fill("Northstar completed 142 customer conversations.");
  await page.getByRole("button", { name: "Generate" }).click();
  await waitForStatus("Complete:1:Northstar");
  await page.getByText("Northstar's quarter").waitFor({ timeout: 10_000 });
  if (browserErrors.length) throw new Error(`Clean-room browser errors: ${browserErrors.join(" | ")}`);
  runCli(["create", "ownershipProof"]);
  const ownedTemplatePath = join(app, "vanillasky", "templates", "bigNumber.tsx");
  const ownedTemplate = readFileSync(ownedTemplatePath, "utf8");
  const canonicalDescription = "A single animated count-up metric with headline and label.";
  const customerDescription = "A customer-owned acceptance edit for a personalized metric.";
  if (!ownedTemplate.includes(canonicalDescription)) throw new Error("Could not locate the copied template description to edit");
  writeFileSync(ownedTemplatePath, ownedTemplate.replace(canonicalDescription, customerDescription));

  for (const generated of ["index.ts", "server.ts"]) {
    const path = join(app, "vanillasky", generated);
    writeFileSync(path, `${readFileSync(path, "utf8")}\n// deliberate acceptance drift\n`);
  }
  const drift = runCli(["sync", "--check"], { expectFailure: true });
  if (drift.status === 0) throw new Error("Expected sync --check to detect deliberate drift");
  if (!drift.output.includes("Generated template files are out of date")) {
    throw new Error(`Packed sync --check returned the wrong drift diagnostic:\n${drift.output}`);
  }
  runCli(["sync"]);
  if (!readFileSync(join(app, "vanillasky", "server.ts"), "utf8").includes(customerDescription)) {
    throw new Error("Packed sync did not regenerate server metadata from edited customer source");
  }
  if (!readFileSync(join(app, "vanillasky", "index.ts"), "utf8").includes("bigNumberTemplate")) {
    throw new Error("Packed sync did not regenerate the browser registry");
  }
  const serverOnlyConsumer = join(workspace, "server-only-consumer");
  mkdirSync(join(serverOnlyConsumer, "vanillasky"), { recursive: true });
  writeFileSync(join(serverOnlyConsumer, "package.json"), `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`);
  run("npm", [
    "install", "--no-audit", "--no-fund", "--omit=peer", "--no-save",
    "typescript@5.9.3", installSpec,
  ], serverOnlyConsumer);
  for (const packagePath of ["react", "react-dom", "@types/react"]) {
    if (existsSync(join(serverOnlyConsumer, "node_modules", packagePath))) {
      throw new Error(`Server-only consumer unexpectedly installed React dependency: ${packagePath}`);
    }
  }
  copyFileSync(join(app, "vanillasky", "server.ts"), join(serverOnlyConsumer, "vanillasky", "server.ts"));
  writeFileSync(join(serverOnlyConsumer, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      types: [],
    },
    include: ["vanillasky/server.ts"],
  }, null, 2)}\n`);
  const serverOnlyTsc = join(serverOnlyConsumer, "node_modules", "typescript", "bin", "tsc");
  run(process.execPath, [serverOnlyTsc, "--project", "tsconfig.json"], serverOnlyConsumer);
  assertProjectImports();
  writeFileSync(join(app, "src", "template-ownership.ts"), `export { templates as browserTemplates } from "../vanillasky/index";
export { templates as serverTemplates } from "../vanillasky/server";
`);
  run("npm", ["run", "build"], app);
  const tsc = join(app, "node_modules", "typescript", "bin", "tsc");
  run(process.execPath, [tsc, "--project", "tsconfig.app.json", "--strict"], app);
  const firstHash = generatedHash();
  runCli(["sync"]);
  if (generatedHash() !== firstHash) throw new Error("Optional template ownership was not deterministic");
  runCli(["sync", "--check"]);
  runCli(["check"]);
  const effectiveList = JSON.parse(runCli(["list", "--json"]).output);
  if (!effectiveList.some(({ id, origin }) => id === "bigNumber" && origin === "project")) {
    throw new Error("Packed list did not report the copied template as project-owned");
  }
  const effectiveDescription = JSON.parse(runCli(["describe", "bigNumber", "--json"]).output);
  if (effectiveDescription.summary !== customerDescription) {
    throw new Error("Packed describe did not report the edited customer-owned metadata");
  }
  for (const [path, contents] of Object.entries(tsconfigSnapshot)) {
    if (readFileSync(join(app, path), "utf8") !== contents) {
      throw new Error(`Onboarding changed the untouched Vite TypeScript settings in ${path}`);
    }
  }
  if (evidenceDirectory) {
    mkdirSync(evidenceDirectory, { recursive: true });
    await page.screenshot({ path: join(evidenceDirectory, "screenshot.png"), fullPage: true });
    await context.tracing.stop({ path: join(evidenceDirectory, "trace.zip") });
    copyFileSync(join(app, "package-lock.json"), join(evidenceDirectory, "package-lock.json"));
    writeFileSync(join(evidenceDirectory, "browser-console.json"), `${JSON.stringify(browserErrors, null, 2)}\n`);
    writeFileSync(join(evidenceDirectory, "verification.json"), `${JSON.stringify({
      package: installSpec,
      integrity: candidateArtifact?.integrity ?? process.env.VANILLASKY_EXPECTED_INTEGRITY ?? null,
      sha256: candidateArtifact?.sha256 ?? process.env.VANILLASKY_EXPECTED_SHA256 ?? null,
      optionalGeneratedTreeSha256: firstHash,
      finalStatus: await page.getByTestId("status").textContent(),
    }, null, 2)}\n`);
  }
  console.log("Fresh Vite onboarding passed exact packed CLI ownership, strict generated-source compilation, input-only defaults, lazy streaming playback, recomposition, and browser error checks.");
} finally {
  if (browser) await browser.close();
  if (server) {
    server.kill("SIGTERM");
    server.stdout?.destroy();
    server.stderr?.destroy();
  }
  if (evidenceDirectory) {
    mkdirSync(evidenceDirectory, { recursive: true });
    writeFileSync(join(evidenceDirectory, "commands.log"), `${commandLog.join("\n")}\n`);
  }
  try {
    rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    if (error?.code === "ENOTEMPTY") {
      console.warn(`Temporary workspace cleanup is still in progress: ${workspace}`);
    } else {
      console.error(error);
      process.exitCode = 1;
    }
  }
}
