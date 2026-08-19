#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { parseNpmPackJson } from "./lib/parse-npm-pack-json.mjs";
import { selectPackedArtifact } from "./lib/release-integrity.mjs";
import { stopProcessTree } from "./lib/stop-process-tree.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspace = mkdtempSync(join(tmpdir(), "vanillasky-documented-examples-"));
const examples = [
  { name: "react-vite", url: "http://localhost:5173/" },
  { name: "server-integrations" },
  { name: "nextjs-quickstart", url: "http://localhost:3000/", browser: true, rejectsProduction: true },
];
const commandLog = [];
const selectedArtifact = selectPackedArtifact({
  providedPath: process.env.VANILLASKY_PACKED_TARBALL
    ? resolve(process.env.VANILLASKY_PACKED_TARBALL)
    : undefined,
  expectedIntegrity: process.env.VANILLASKY_EXPECTED_INTEGRITY,
  expectedSha256: process.env.VANILLASKY_EXPECTED_SHA256,
  packArtifact: () => {
    execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
    const [packed] = parseNpmPackJson(execFileSync("npm", [
      "pack", "--silent", "--json", "--pack-destination", workspace, "--ignore-scripts",
    ], { cwd: root, encoding: "utf8" }));
    return { path: join(workspace, packed.filename), integrity: packed.integrity };
  },
});
const candidateTarball = selectedArtifact.path;
const candidateVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

function documentedCommands(exampleRoot) {
  const readme = readFileSync(join(exampleRoot, "README.md"), "utf8");
  const block = readme.match(/<!-- verify:start -->\s*```bash\s*([\s\S]*?)```\s*<!-- verify:end -->/);
  if (!block) throw new Error(`${exampleRoot}/README.md has no verified command block`);
  return block[1].split("\n").map((line) => line.trim()).filter(Boolean);
}

function run(command, args, cwd) {
  commandLog.push(`${cwd}$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, npm_config_cache: join(workspace, "npm-cache") },
  });
}

async function waitForServer(server, url, output) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* server is starting */ }
    if (server.exitCode != null) {
      throw new Error(`Documented dev command exited with ${server.exitCode}:\n${output.value}`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error(`Documented dev command did not serve ${url}:\n${output.value}`);
}

async function verifyProductionAuth(app) {
  const url = "http://127.0.0.1:3001/";
  const output = { value: "" };
  const productionServer = spawn("npm", ["run", "start", "--", "-H", "127.0.0.1", "-p", "3001"], {
    cwd: app,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  const capture = (chunk) => { output.value = `${output.value}${chunk}`.slice(-8_000); };
  productionServer.stdout.on("data", capture);
  productionServer.stderr.on("data", capture);
  try {
    await waitForServer(productionServer, url, output);
    const response = await fetch(new URL("/api/video", url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    if (response.status !== 401) {
      throw new Error(`Expected fail-closed production auth to return 401, received ${response.status}`);
    }
  } finally {
    await stopProcessTree(productionServer);
  }
}

async function runExample(example) {
  const source = join(root, "examples", example.name);
  const app = join(workspace, example.name);
  cpSync(source, app, {
    recursive: true,
    filter: (path) => !["node_modules", "dist", ".next", ".env.local"].includes(basename(path)),
  });

  const manifestPath = join(app, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const pinnedVersion = manifest.dependencies?.["@vanillaskyai/video"];
  if (pinnedVersion !== candidateVersion) {
    throw new Error(`${example.name} pins ${pinnedVersion ?? "no SDK"}, expected candidate ${candidateVersion}`);
  }
  manifest.dependencies["@vanillaskyai/video"] = `file:${candidateTarball}`;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  let server;
  let browser;
  try {
    for (const command of documentedCommands(app)) {
      if (command === "npm run dev") {
        if (!example.url) throw new Error(`${example.name} documents a dev server without a verification URL`);
        if (example.rejectsProduction) await verifyProductionAuth(app);
        const output = { value: "" };
        commandLog.push(`${app}$ ${command}`);
        server = spawn("npm", ["run", "dev"], {
          cwd: app,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, npm_config_cache: join(workspace, "npm-cache") },
          detached: process.platform !== "win32",
        });
        const capture = (chunk) => { output.value = `${output.value}${chunk}`.slice(-8_000); };
        server.stdout.on("data", capture);
        server.stderr.on("data", capture);
        await waitForServer(server, example.url, output);
        if (example.browser) {
          browser = await chromium.launch();
          const page = await browser.newPage();
          const errors = [];
          page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
          page.on("pageerror", (error) => errors.push(error.message));
          await page.goto(example.url);
          await page.getByRole("heading", { name: "VanillaSky quickstart" }).waitFor();
          await page.getByRole("button", { name: "Generate video" }).waitFor();
          if (errors.length) throw new Error(`Next.js quickstart browser errors: ${errors.join(" | ")}`);
        }
        continue;
      }

      const parts = command.split(" ");
      const executable = parts.shift();
      if (!executable || !["npm", "cp"].includes(executable)) {
        throw new Error(`Unsupported documented command: ${command}`);
      }
      run(executable, parts, app);
    }
    const installedVersion = execFileSync(process.execPath, [
      "-p", "require('./node_modules/@vanillaskyai/video/package.json').version",
    ], { cwd: app, encoding: "utf8" }).trim();
    if (installedVersion !== candidateVersion) {
      throw new Error(`${example.name} installed ${installedVersion}, expected packed candidate ${candidateVersion}`);
    }
    if (example.browser) {
      console.log(`${example.name}: literal install/build/dev commands, UI startup, browser console, and fail-closed production auth passed; model generation was not exercised.`);
    } else {
      console.log(`${example.name}: documented commands passed from a clean copy.`);
    }
  } finally {
    if (browser) await browser.close();
    if (server) await stopProcessTree(server);
  }
}

try {
  for (const example of examples) await runExample(example);
  console.log(`Documented commands passed against packed candidate ${candidateVersion}; full fake-model generation is covered separately by verify:nextjs.`);
} finally {
  console.log(`Documented command log:\n${commandLog.join("\n")}`);
  rmSync(workspace, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
