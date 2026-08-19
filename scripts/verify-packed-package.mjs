#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseNpmPackJson } from "./lib/parse-npm-pack-json.mjs";
import { selectPackedArtifact } from "./lib/release-integrity.mjs";
import { verifyPackedMarkdownDocumentation } from "./lib/packed-markdown.mjs";
import { verifyPublicApiSurface } from "./lib/public-api-surface.mjs";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspace = mkdtempSync(join(tmpdir(), "vanillasky-packed-consumer-"));
const consumer = join(workspace, "consumer");
const playbackOnlyConsumer = join(workspace, "playback-only-consumer");
const serverConsumer = join(workspace, "server-consumer");
const react19Consumer = join(workspace, "react19-consumer");
mkdirSync(consumer);
mkdirSync(playbackOnlyConsumer);
mkdirSync(serverConsumer);
mkdirSync(react19Consumer);

try {
  const selectedArtifact = selectPackedArtifact({
    providedPath: process.env.VANILLASKY_PACKED_TARBALL
      ? resolve(process.env.VANILLASKY_PACKED_TARBALL)
      : undefined,
    expectedIntegrity: process.env.VANILLASKY_EXPECTED_INTEGRITY,
    expectedSha256: process.env.VANILLASKY_EXPECTED_SHA256,
    packArtifact: () => {
      const packed = parseNpmPackJson(execFileSync("npm", ["pack", "--silent", "--json", "--ignore-scripts", "--pack-destination", workspace], { cwd: root, encoding: "utf8" }));
      return { path: join(workspace, packed[0].filename), integrity: packed[0].integrity };
    },
  });
  const tarball = selectedArtifact.path;
  writeFileSync(join(playbackOnlyConsumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", tarball], {
    cwd: playbackOnlyConsumer,
    stdio: "inherit",
  });
  if (existsSync(join(playbackOnlyConsumer, "node_modules", "tsx")) || existsSync(join(playbackOnlyConsumer, "node_modules", "esbuild"))) {
    throw new Error("Default playback install unexpectedly included the optional template compiler");
  }
  execFileSync(process.execPath, ["--input-type=module", "--eval", 'await import("@vanillaskyai/video")'], {
    cwd: playbackOnlyConsumer,
    stdio: "inherit",
  });
  writeFileSync(join(serverConsumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball, "typescript@5.9.3"], { cwd: serverConsumer, stdio: "inherit" });
  writeFileSync(join(serverConsumer, "server.ts"), `
import { createVideoHandler, createServerTemplateRegistry } from "@vanillaskyai/video/server";
import type { VideoGenerationSummary, VideoHandlerOptions, VideoProviderUsage, VideoWarning } from "@vanillaskyai/video/server";
import { createMockVideoPlanner, simulateVideoStream, videoFixtures } from "@vanillaskyai/video/test";
import type { MockVideoPlannerOptions, SimulatedVideoStreamOptions } from "@vanillaskyai/video/test";
// @ts-expect-error VideoPlanner is internal and must not be exported from the test entry.
import type { VideoPlanner } from "@vanillaskyai/video/test";
// @ts-expect-error VideoPlanPart is internal and must not be exported from the test entry.
import type { VideoPlanPart } from "@vanillaskyai/video/test";
// @ts-expect-error VideoEvent is internal and must not be exported from the test entry.
import type { VideoEvent } from "@vanillaskyai/video/test";
// @ts-expect-error VideoGenerationContext is internal and must not be exported from the test entry.
import type { VideoGenerationContext } from "@vanillaskyai/video/test";
// @ts-expect-error VideoState is internal to the test entry and must not be exported.
import type { VideoState } from "@vanillaskyai/video/test";
declare const options: VideoHandlerOptions;
declare const summary: VideoGenerationSummary;
declare const usage: VideoProviderUsage;
declare const warning: VideoWarning;
declare const mockOptions: MockVideoPlannerOptions;
declare const simulationOptions: SimulatedVideoStreamOptions;
const mock = createMockVideoPlanner(mockOptions);
const simulation = simulateVideoStream(videoFixtures.portrait.parts, simulationOptions);
void [createVideoHandler, createServerTemplateRegistry, options, summary, usage, warning, mock, simulation];
`);
  writeFileSync(join(serverConsumer, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", skipLibCheck: false, types: [] }, include: ["server.ts"] }));
  execFileSync(process.execPath, [join(serverConsumer, "node_modules", "typescript", "bin", "tsc")], { cwd: serverConsumer, stdio: "inherit" });
  if (existsSync(join(serverConsumer, "node_modules", "react")) || existsSync(join(serverConsumer, "node_modules", "@types", "react"))) throw new Error("Test kit packed consumer unexpectedly installed React");
  const testDeclaration = readFileSync(join(serverConsumer, "node_modules", "@vanillaskyai", "video", "dist", "test.d.ts"), "utf8");
  for (const privateType of ["VideoPlanner", "VideoPlanPart", "VideoEvent", "VideoGenerationContext", "VideoState"]) {
    if (new RegExp(`\\b${privateType}\\b`).test(testDeclaration)) throw new Error(`Packed test declaration leaked ${privateType}`);
  }
  if (/from ["']\.\/(?:protocol|server|visual-system|test)\//.test(testDeclaration)) {
    throw new Error("Packed test declaration leaked an internal module path");
  }
  writeFileSync(join(serverConsumer, "root.mjs"), `
import { VideoValidationError, getVideoDuration, parseVideo } from "@vanillaskyai/video";
import * as root from "@vanillaskyai/video";
if (Object.keys(root).join() !== "VideoValidationError,getVideoDuration,parseVideo") throw new Error("Unexpected React-free root API");
const stored = {
  schemaVersion: "0.1",
  scenes: [{ id: "stored", templateId: "notification", variables: { message: "Stored" }, timing: { fixedDuration: 4 } }],
  style: { brand: { font: "Inter", scriptFont: "Caveat", background: { type: "gradient", colors: ["#8711C1", "#2167E3"] }, colors: { primary: "#00E5A0", secondary: "#006BE5", foreground: "#FFFFFF", surface: "#0A0A14", surfaceElevated: "#14152A", muted: "#A7A6B0" } } },
};
const parsed = parseVideo(JSON.parse(JSON.stringify(stored)));
if (getVideoDuration(parsed) !== 4 || !Object.isFrozen(parsed.scenes)) throw new Error("React-free root persistence contract failed");
try {
  parseVideo({ ...stored, schemaVersion: "9.0" });
  throw new Error("Future persisted schema was accepted");
} catch (error) {
  if (!(error instanceof VideoValidationError) || error.code !== "unsupported_video_version") throw error;
}
`);
  execFileSync(process.execPath, [join(serverConsumer, "root.mjs")], { cwd: serverConsumer, stdio: "inherit" });
  writeFileSync(join(serverConsumer, "server.mjs"), `
import { createVideoHandler } from "@vanillaskyai/video/server";
let completed;
const handler = createVideoHandler({
  authorize: "none",
  heartbeatMs: false,
  onComplete: (summary) => { completed = summary; },
  streamText: () => ({
    textStream: (async function* () {
      yield '{"type":"scene.add","scene":{"id":"server-only","templateId":"notification","variables":{"appName":"VanillaSky","message":"Server only"},"timing":{"fixedDuration":4}}}\\n';
      yield '{"type":"plan.complete"}\\n';
    })(),
    finishReason: "stop",
    usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
  }),
});
const response = await handler(new Request("https://app.example/api/video", {
  method: "POST",
  body: JSON.stringify({ protocolVersion: "0.4", requestId: "server-only", input: { input: "Grounded" } }),
}));
const body = await response.text();
if (!body.includes('"type":"response.complete"') || completed?.usage?.totalTokens !== 6) throw new Error("Server-only packed lifecycle failed");
if (body.includes("inputTokens") || body.includes("totalTokens")) throw new Error("Server-only packed lifecycle leaked usage into SSE");
const complete = body
  .split("\\n")
  .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
  .map((line) => JSON.parse(line.slice(6)))
  .find(({ type }) => type === "response.complete");
if (complete?.data.checksum !== "fnv1a32:6e2a7da8") throw new Error("Packed replay checksum drifted");
if (complete.data.snapshot.schemaVersion !== "0.1") throw new Error("Packed terminal snapshot lost its schema version");
`);
  execFileSync(process.execPath, [join(serverConsumer, "server.mjs")], { cwd: serverConsumer, stdio: "inherit" });

  writeFileSync(join(serverConsumer, "test-kit.mjs"), `
import { createVideoHandler } from "@vanillaskyai/video/server";
import { createMockVideoPlanner, simulateVideoStream, videoFixtures } from "@vanillaskyai/video/test";

if (Object.keys(await import("@vanillaskyai/video/test")).sort().join() !== "createMockVideoPlanner,simulateVideoStream,videoFixtures") {
  throw new Error("Unexpected packed test API");
}
if (!Object.isFrozen(videoFixtures.portrait.input) || !Object.isFrozen(videoFixtures.scenarios.success)) {
  throw new Error("Packed test fixtures are mutable");
}

const collect = async (source) => {
  const events = [];
  for await (const event of source) events.push(event);
  return events;
};
const parseSse = (body) => body.split("\\n")
  .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
  .map((line) => JSON.parse(line.slice(6)));

const handler = createVideoHandler({ authorize: "none", heartbeatMs: false, streamText: createMockVideoPlanner() });
const response = await handler(new Request("https://app.example/api/video", {
  method: "POST",
  body: JSON.stringify({ protocolVersion: "0.4", requestId: "packed-test-route", input: videoFixtures.portrait.input }),
}));
const routeEvents = parseSse(await response.text());
if (routeEvents.at(-1)?.type !== "response.complete") throw new Error("Packed mock did not complete through SSE");

const success = await collect(simulateVideoStream(videoFixtures.scenarios.success));
const delayed = await collect(simulateVideoStream(videoFixtures.scenarios.delayed));
const truncated = await collect(simulateVideoStream(videoFixtures.scenarios.truncated));
const invalidScene = await collect(simulateVideoStream(videoFixtures.scenarios.invalidScene));
const providerFailure = await collect(simulateVideoStream(videoFixtures.scenarios.providerFailure));
const contentFilter = await collect(simulateVideoStream(videoFixtures.scenarios.contentFilter));
if (success[0]?.eventId !== "test-run:0" || success.at(-1)?.type !== "response.complete") throw new Error("Packed success scenario is not deterministic");
if (delayed.at(-1)?.type !== "response.complete") throw new Error("Packed delayed scenario failed");
if (truncated.at(-1)?.data?.finishReason !== "length" || truncated.at(-1)?.data?.snapshot?.scenes?.length !== 1) throw new Error("Packed truncation lost its playable result");
if (!invalidScene.some((event) => event.type === "response.error" && event.data.error.recoverable) || invalidScene.at(-1)?.type !== "response.complete") throw new Error("Packed invalid scene did not recover");
if (providerFailure.at(-1)?.type !== "response.error" || JSON.stringify(providerFailure).includes("fixture-private-value")) throw new Error("Packed provider failure was not redacted");
if (contentFilter.at(-1)?.data?.finishReason !== "content-filter" || contentFilter.at(-1)?.data?.snapshot?.scenes?.length !== 1) throw new Error("Packed content filter lost its playable result");

const abortController = new AbortController();
const abort = [];
for await (const event of simulateVideoStream(videoFixtures.scenarios.abort, { signal: abortController.signal })) {
  abort.push(event);
  if (event.type === "scene.add") abortController.abort("packed consumer cancelled");
}
if (abort.at(-1)?.type !== "response.abort" || abort.at(-1)?.data?.reason !== "packed consumer cancelled") throw new Error("Packed abort scenario failed");

const timeout = await collect(simulateVideoStream(videoFixtures.scenarios.timeout, { timeoutMs: 1 }));
if (timeout.at(-1)?.type !== "response.abort" || timeout.at(-1)?.data?.reason !== "Request timed out") throw new Error("Packed timeout scenario failed");

const failureHandler = createVideoHandler({
  authorize: "none",
  heartbeatMs: false,
  streamText: createMockVideoPlanner({ scenario: "providerFailure" }),
});
const failureResponse = await failureHandler(new Request("https://app.example/api/video", {
  method: "POST",
  body: JSON.stringify({ protocolVersion: "0.4", requestId: "packed-test-failure", input: videoFixtures.portrait.input }),
}));
const failureBody = await failureResponse.text();
if (!failureBody.includes('"type":"response.error"') || failureBody.includes("fixture-private-value")) throw new Error("Packed route failure was not redacted");
`);
  execFileSync(process.execPath, [join(serverConsumer, "test-kit.mjs")], { cwd: serverConsumer, stdio: "inherit" });

  writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball, "react@18.3.1", "react-dom@18.3.1", "@types/react@18.3.28", "@types/react-dom@18.3.7", "typescript@5.9.3", "tsx@4.23.12", "vite@7.1.7"], { cwd: consumer, stdio: "inherit" });

  const packageRoot = join(consumer, "node_modules", "@vanillaskyai", "video");
  await verifyPublicApiSurface({
    packageRoot,
    manifestPath: join(root, "tests", "fixtures", "public-api-surface.json"),
    signaturePath: join(root, "tests", "fixtures", "public-api-signatures.json"),
  });
  const packedCli = join(consumer, "node_modules", "@vanillaskyai", "video", "bin", "vanillasky.js");
  const persistenceGuide = readFileSync(join(packageRoot, "docs", "persistence.md"), "utf8");
  const persistenceExample = persistenceGuide.match(
    /<!-- verify:persistence-example:start -->\s*```tsx\r?\n([\s\S]*?)\r?\n```\s*<!-- verify:persistence-example:end -->/,
  )?.[1];
  if (!persistenceExample) {
    throw new Error("Packed persistence guide omitted its compilable example");
  }
  writeFileSync(join(consumer, "persistence-example.tsx"), persistenceExample);
  writeFileSync(join(consumer, "persistence-example-tsconfig.json"), JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: "ES2022",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      skipLibCheck: false,
      isolatedModules: true,
    },
    include: ["persistence-example.tsx"],
  }));
  execFileSync(process.execPath, [
    join(consumer, "node_modules", "typescript", "bin", "tsc"),
    "-p",
    "persistence-example-tsconfig.json",
  ], { cwd: consumer, stdio: "inherit" });
  const customTemplateGuide = readFileSync(join(packageRoot, "docs", "custom-templates.md"), "utf8");
  const customTemplatePreview = customTemplateGuide.match(
    /<!-- verify:custom-template-preview:start -->\s*```tsx\r?\n([\s\S]*?)\r?\n```\s*<!-- verify:custom-template-preview:end -->/,
  )?.[1];
  if (!customTemplatePreview) {
    throw new Error("Packed custom-template guide omitted its compilable preview example");
  }
  const transitionSemanticValue = customTemplateGuide.match(
    /<!-- verify:transition-semantic-value:start -->\s*```tsx\r?\n([\s\S]*?)\r?\n```\s*<!-- verify:transition-semantic-value:end -->/,
  )?.[1];
  if (!transitionSemanticValue) {
    throw new Error("Packed custom-template guide omitted its compilable transition semantic example");
  }
  mkdirSync(join(consumer, "src"), { recursive: true });
  mkdirSync(join(consumer, "vanillasky"), { recursive: true });
  writeFileSync(join(consumer, "src", "custom-template-preview.tsx"), customTemplatePreview);
  writeFileSync(join(consumer, "src", "transition-semantic-value.tsx"), transitionSemanticValue);
  writeFileSync(join(consumer, "vanillasky", "index.ts"), `
import { createTemplateRegistry } from "@vanillaskyai/video/templates";
export const templates = createTemplateRegistry({ definitions: [] });
`);
  writeFileSync(join(consumer, "custom-template-preview-tsconfig.json"), JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: "ES2022",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      skipLibCheck: false,
      isolatedModules: true,
    },
    include: ["src/custom-template-preview.tsx", "src/transition-semantic-value.tsx", "vanillasky/index.ts"],
  }));
  execFileSync(process.execPath, [
    join(consumer, "node_modules", "typescript", "bin", "tsc"),
    "-p",
    "custom-template-preview-tsconfig.json",
  ], { cwd: consumer, stdio: "inherit" });
  rmSync(join(consumer, "vanillasky"), { recursive: true, force: true });
  execFileSync(process.execPath, [packedCli, "add", "bigNumber", "--dry-run"], { cwd: consumer, stdio: "ignore" });
  execFileSync(process.execPath, [packedCli, "add", "bigNumber", "--diff"], { cwd: consumer, stdio: "ignore" });
  if (existsSync(join(consumer, "vanillasky"))) {
    throw new Error("Packed add preview commands changed the consumer");
  }
  execFileSync(process.execPath, [packedCli, "add", "bigNumber"], { cwd: consumer, stdio: "inherit" });
  const copiedCheckOutput = execFileSync(process.execPath, [packedCli, "check"], { cwd: consumer, encoding: "utf8" });
  if (!copiedCheckOutput.includes("12 deterministic renders")) {
    throw new Error(`Packed copied-template check failed:\n${copiedCheckOutput}`);
  }
  rmSync(join(consumer, "vanillasky"), { recursive: true, force: true });
  execFileSync(process.execPath, [packedCli, "add", "--all"], { cwd: consumer, stdio: "inherit" });
  const catalogCheckOutput = execFileSync(process.execPath, [packedCli, "check"], { cwd: consumer, encoding: "utf8" });
  const catalogSummary = "Checked 28 templates, 28 examples, and 336 deterministic renders.";
  if (!catalogCheckOutput.includes(catalogSummary)) throw new Error(`Packed built-in catalog check failed:\n${catalogCheckOutput}`);
  rmSync(join(consumer, "vanillasky"), { recursive: true, force: true });

  const createOutput = execFileSync(process.execPath, [packedCli, "create", "customer-health"], { cwd: consumer, encoding: "utf8" });
  for (const expected of [
    "Created template: vanillasky/templates/customer-health.tsx",
    "Synced 1 template to vanillasky/index.ts and vanillasky/server.ts.",
    "Source: vanillasky/templates/customer-health.tsx",
    "vanillasky check",
  ]) {
    if (!createOutput.includes(expected)) throw new Error(`Packed create output omitted ${JSON.stringify(expected)}:\n${createOutput}`);
  }
  writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify({
    compilerOptions: { strict: true, noUnusedLocals: true, noUnusedParameters: true, noEmit: true, target: "ES2022", lib: ["ES2022", "DOM", "DOM.Iterable"], module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", skipLibCheck: false, isolatedModules: true },
    include: ["vanillasky/**/*.ts", "vanillasky/**/*.tsx"],
  }));
  execFileSync(process.execPath, [join(consumer, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], { cwd: consumer, stdio: "inherit" });
  const checkOutput = execFileSync(process.execPath, [packedCli, "check"], { cwd: consumer, encoding: "utf8" });
  if (!checkOutput.includes("12 deterministic renders")) throw new Error(`Packed template check failed:\n${checkOutput}`);
  execFileSync(process.execPath, [packedCli, "list"], { cwd: consumer, stdio: "ignore" });
  execFileSync(process.execPath, [packedCli, "describe", "customer-health"], { cwd: consumer, stdio: "ignore" });
  const effectiveCatalog = JSON.parse(execFileSync(process.execPath, [packedCli, "list", "--json"], { cwd: consumer, encoding: "utf8" }));
  const customerCatalogEntry = effectiveCatalog.find(({ id }) => id === "customer-health");
  if (customerCatalogEntry?.origin !== "project" || customerCatalogEntry.status !== "current") {
    throw new Error(`Packed effective catalog lost current customer source:\n${JSON.stringify(customerCatalogEntry, null, 2)}`);
  }
  const builtinCatalog = JSON.parse(execFileSync(process.execPath, [packedCli, "list", "--builtin", "--json"], { cwd: consumer, encoding: "utf8" }));
  if (builtinCatalog.some(({ id }) => id === "customer-health")) throw new Error("Packed built-in catalog included project source");
  const customerDescription = JSON.parse(execFileSync(process.execPath, [packedCli, "describe", "customer-health", "--json"], { cwd: consumer, encoding: "utf8" }));
  if (customerDescription.origin !== "project" || customerDescription.generated?.current !== true) {
    throw new Error(`Packed describe did not report current project source:\n${JSON.stringify(customerDescription, null, 2)}`);
  }

  rmSync(join(consumer, "vanillasky"), { recursive: true, force: true });
  const referenceRoot = join(packageRoot, "examples", "custom-template");
  const customerTemplates = join(consumer, "vanillasky", "templates");
  mkdirSync(customerTemplates, { recursive: true });
  for (const file of ["minimal-text.tsx", "structured-data.tsx", "supplied-media.tsx"]) {
    cpSync(join(referenceRoot, file), join(customerTemplates, file));
  }
  const suppliedMediaSource = readFileSync(join(customerTemplates, "supplied-media.tsx"), "utf8");
  const previewImageUrl = suppliedMediaSource.match(/const previewImageUrl = ("[^"]+")/)?.[1];
  if (!previewImageUrl) throw new Error("Packed supplied-media reference omitted its inline preview image");
  execFileSync(process.execPath, [packedCli, "sync"], { cwd: consumer, stdio: "inherit" });
  const referenceCheckOutput = execFileSync(process.execPath, [packedCli, "check"], { cwd: consumer, encoding: "utf8" });
  if (!referenceCheckOutput.includes("36 deterministic renders")) {
    throw new Error(`Packed custom reference check failed:\n${referenceCheckOutput}`);
  }
  execFileSync(process.execPath, [join(consumer, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], { cwd: consumer, stdio: "inherit" });

  writeFileSync(join(consumer, "api.mjs"), `
import * as root from "@vanillaskyai/video";
import * as server from "@vanillaskyai/video/server";
import * as react from "@vanillaskyai/video/react";
import * as templates from "@vanillaskyai/video/templates";
import { builtinTemplates } from "@vanillaskyai/video/templates/catalog";
if (Object.keys(root).join() !== "VideoValidationError,getVideoDuration,parseVideo") throw new Error("Unexpected root API");
const resolvedStyle = { brand: { font: "Inter", scriptFont: "Caveat", background: { type: "gradient", colors: ["#8711C1", "#2167E3"] }, colors: { primary: "#00E5A0", secondary: "#006BE5", foreground: "#FFFFFF", surface: "#0A0A14", surfaceElevated: "#14152A", muted: "#A7A6B0" } } };
const rootVideo = root.parseVideo({ schemaVersion: "0.1", scenes: [{ id: "one", templateId: "notification", variables: {}, timing: { fixedDuration: 4 } }], style: resolvedStyle });
if (root.getVideoDuration(rootVideo) !== 4 || !Object.isFrozen(rootVideo)) {
  throw new Error("Packed duration helper returned an unexpected timeline");
}
if (Object.keys(server).sort().join() !== "createServerTemplateRegistry,createVideoHandler") throw new Error("Unexpected server API");
if (Object.keys(react).sort().join() !== "VideoError,VideoPlayer,useVideo") throw new Error("Unexpected React API");
if (Object.keys(templates).sort().join() !== "createTemplateRegistry,defineTemplate") throw new Error("Unexpected template API");
if (builtinTemplates.length !== 28) throw new Error("Unexpected built-in template manifest");
try {
  templates.defineTemplate({ id: "removedDuration", useWhen: "Never", schema: { type: "object", properties: {} }, duration: 2, component: () => null });
  throw new Error("Packed template API accepted the removed duration alias");
} catch (error) {
  if (error.message !== "Template duration is not supported; use preferredDuration") throw error;
}
let lifecycleSummary;
const pacingHandler = server.createVideoHandler({
  authorize: "none",
  heartbeatMs: false,
  includeRawProviderData: true,
  onComplete: (summary) => { lifecycleSummary = summary; },
  streamText: () => ({
    textStream: (async function* () {
      yield JSON.stringify({ type: "scene.add", scene: { id: "body-1", templateId: "bigNumber", variables: { texts: "Revenue", value: 42, label: "million" }, timing: { fixedDuration: 29 } } }) + "\\n";
      yield JSON.stringify({ type: "scene.add", scene: { id: "close-1", templateId: "ctaLogo", variables: { url: "openai.com/releases", cta: "Read every new OpenAI release note with your team" }, timing: { fixedDuration: 4 } } }) + "\\n";
      yield JSON.stringify({ type: "plan.complete" }) + "\\n";
    })(),
    finishReason: Promise.resolve("stop"),
    usage: Promise.resolve({ inputTokens: 20, outputTokens: 10, totalTokens: 30, inputTokenDetails: { cacheReadTokens: 5 }, outputTokenDetails: { reasoningTokens: 2 } }),
    providerMetadata: Promise.resolve({ openai: { responseId: "packed-private-response" } }),
    steps: Promise.resolve([{ model: { modelId: "packed-requested-model" } }]),
    response: Promise.resolve({ modelId: "packed-resolved-model" }),
  }),
});
const pacingResponse = await pacingHandler(new Request("https://app.example/api/video", {
  method: "POST",
  body: JSON.stringify({
    protocolVersion: "0.4",
    requestId: "packed-readable-closer",
    input: { input: "Revenue reached 42 million. Acme: Read every new OpenAI release note with your team at openai.com/releases.", maxDurationSec: 30, brand: { name: "Acme", logoUrl: "https://cdn.acme.test/logo.svg", background: "twilight", colors: { primary: "#FF3366" } } },
    capabilities: { templates: ["bigNumber", "ctaLogo"] },
  }),
}));
const pacingEvents = (await pacingResponse.text())
  .split("\\n")
  .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
  .map((line) => JSON.parse(line.slice(6)));
if (lifecycleSummary?.usage?.totalTokens !== 30 || lifecycleSummary?.usage?.cachedInputTokens !== 5 || lifecycleSummary?.usage?.reasoningTokens !== 2) throw new Error("Packed handler did not normalize usage");
if (lifecycleSummary?.requestedModelId !== "packed-requested-model" || lifecycleSummary?.resolvedModelId !== "packed-resolved-model") throw new Error("Packed handler lost model lifecycle metadata");
if (lifecycleSummary?.acceptedSceneCount !== 2 || lifecycleSummary?.providerMetadata?.openai?.responseId !== "packed-private-response") throw new Error("Packed handler lost the server-only completion summary");
if (JSON.stringify(pacingEvents).match(/packed-private-response|packed-requested-model|packed-resolved-model|totalTokens/)) throw new Error("Packed handler leaked server lifecycle metadata into SSE");
const startEvent = pacingEvents.find(({ type }) => type === "response.start");
if (startEvent.data.style.brand.background.type !== "gradient") throw new Error("Packed handler did not resolve the background preset");
if (startEvent.data.style.brand.colors.primary !== "#FF3366") throw new Error("Packed handler lost the semantic primary color");
if (startEvent.data.style.brand.colors.foreground !== "#FFFFFF") throw new Error("Packed handler let the background alter semantic foreground");
if (startEvent.data.style.brand.name !== "Acme" || startEvent.data.style.brand.logoUrl !== "https://cdn.acme.test/logo.svg") throw new Error("Packed handler lost host-owned identity");
const customResponse = await pacingHandler(new Request("https://app.example/api/video", {
  method: "POST",
  body: JSON.stringify({
    protocolVersion: "0.4",
    requestId: "packed-custom-background",
    input: { input: "Revenue reached 42 million. Acme: Read every new OpenAI release note with your team at openai.com/releases.", maxDurationSec: 30, brand: { background: { color: "#F8FAFC" }, colors: { primary: "#FF3366" } } },
    capabilities: { templates: ["bigNumber", "ctaLogo"] },
  }),
}));
const customEvents = (await customResponse.text())
  .split("\\n")
  .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
  .map((line) => JSON.parse(line.slice(6)));
const customStyle = customEvents.find(({ type }) => type === "response.start").data.style;
if (customStyle.brand.colors.foreground !== "#000000") throw new Error("Packed handler did not auto-select a safe foreground");
const pacedScenes = pacingEvents.filter(({ type }) => type === "scene.add").map(({ data }) => data.scene.timing);
if (JSON.stringify(pacedScenes) !== JSON.stringify([
  { fixedDuration: 26.5, startTime: 0, endTime: 26.5 },
  { fixedDuration: 3.5, startTime: 26.5, endTime: 30 },
])) throw new Error("Packed handler did not preserve a readable final CTA");
if (pacingEvents.filter(({ type }) => type === "response.warning").length !== 2) {
  throw new Error("Packed handler omitted pacing warnings");
}
`);
  execFileSync(process.execPath, [join(consumer, "api.mjs")], { cwd: consumer, stdio: "inherit" });

  writeFileSync(join(consumer, "types.ts"), `
import { createElement } from "react";
import { VideoValidationError, parseVideo } from "@vanillaskyai/video";
import type { Video, VideoBackground, VideoBrand, VideoInput, VideoValidationErrorCode } from "@vanillaskyai/video";
// @ts-expect-error VideoState is internal and must not be exported from the root.
import type { VideoState } from "@vanillaskyai/video";
import { VideoError, VideoPlayer } from "@vanillaskyai/video/react";
import type { UseVideoResult } from "@vanillaskyai/video/react";
// @ts-expect-error VideoPlayerBinding is internal and must not be exported from React.
import type { VideoPlayerBinding } from "@vanillaskyai/video/react";
import type { VideoGenerationSummary, VideoHandlerOptions, VideoProviderUsage, VideoWarning } from "@vanillaskyai/video/server";
import type { BuiltinTemplateId, BuiltinTemplateMetadata } from "@vanillaskyai/video/templates/catalog";
import type { SceneTemplate, SceneTemplateMetadata, SceneTemplateProps, TemplateFamily, TemplateRegistry, TemplateTimingMetadata, TemplateTransitionTiming } from "@vanillaskyai/video/templates";
// @ts-expect-error Undocumented Template alias is not part of 0.1.
import type { Template } from "@vanillaskyai/video/templates";
// @ts-expect-error Undocumented TemplateMetadata alias is not part of 0.1.
import type { TemplateMetadata } from "@vanillaskyai/video/templates";
// @ts-expect-error Undocumented TemplateProps alias is not part of 0.1.
import type { TemplateProps } from "@vanillaskyai/video/templates";
// @ts-expect-error AuthoringTemplate is inferred and internal.
import type { AuthoringTemplate } from "@vanillaskyai/video/templates";
// @ts-expect-error TemplateFamily has one canonical home under templates.
import type { TemplateFamily as CatalogTemplateFamily } from "@vanillaskyai/video/templates/catalog";
// @ts-expect-error TemplateTimingMetadata has one canonical home under templates.
import type { TemplateTimingMetadata as CatalogTemplateTimingMetadata } from "@vanillaskyai/video/templates/catalog";
// @ts-expect-error Undocumented manifest-entry name is not part of 0.1.
import type { BuiltinTemplateManifestEntry } from "@vanillaskyai/video/templates/catalog";
const input: VideoInput = { input: "Grounded source" };
const resolvedBackground: VideoBackground = { type: "gradient", colors: ["#112233", "#334455"] };
const semanticBrand: VideoBrand = { font: "Inter", scriptFont: "Caveat", background: resolvedBackground, colors: { primary: "#FF3366", secondary: "#006BE5", foreground: "#FFFFFF", surface: "#0A0A14", surfaceElevated: "#14152A", muted: "#A7A6B0" } };
const brandedInput: VideoInput = { input: "Campaign update", brand: { background: "twilight", colors: { primary: "#FF3366" } } };
const validationCode: VideoValidationErrorCode = "unsupported_video_version";
const parsedVideo = parseVideo({} as unknown);
declare const video: Video;
declare const validationError: VideoValidationError;
declare const error: VideoError;
declare const hook: UseVideoResult;
declare const handlerOptions: VideoHandlerOptions;
declare const summary: VideoGenerationSummary;
declare const usage: VideoProviderUsage;
declare const warning: VideoWarning;
const savedPlayer = createElement(VideoPlayer, { video, autoPlay: false });
const builtinId: BuiltinTemplateId = "bigNumber";
const family: TemplateFamily = "Data & metrics";
declare const builtinMetadata: BuiltinTemplateMetadata;
declare const sceneTemplate: SceneTemplate;
declare const sceneMetadata: SceneTemplateMetadata;
declare const sceneProps: SceneTemplateProps;
declare const templateRegistry: TemplateRegistry;
declare const timingMetadata: TemplateTimingMetadata;
declare const transitionTiming: TemplateTransitionTiming;
sceneProps.motionProgress;
// @ts-expect-error useVideo reducer state is internal.
hook.state;
// @ts-expect-error useVideo exposes video, never an undocumented config alias.
hook.config;
// @ts-expect-error Handler behavior selectors are not callback-shaped.
handlerOptions.onInvalidPart;
void [input, brandedInput, resolvedBackground, semanticBrand, video.schemaVersion, parsedVideo, validationCode, validationError.code, hook.video, hook.warnings, handlerOptions.invalidPartBehavior, summary, usage, warning, error.code, error.status, error.requestId, error.runId, savedPlayer, builtinId, builtinMetadata, family, sceneTemplate, sceneMetadata, sceneProps, templateRegistry, timingMetadata, transitionTiming];
`);
  writeFileSync(join(consumer, "types-tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", skipLibCheck: false }, include: ["types.ts"] }));
  execFileSync(process.execPath, [join(consumer, "node_modules", "typescript", "bin", "tsc"), "-p", "types-tsconfig.json"], { cwd: consumer, stdio: "inherit" });

  writeFileSync(join(consumer, "index.html"), '<main id="root"></main><script type="module" src="/main.jsx"></script>');
  writeFileSync(join(consumer, "main.jsx"), `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { VideoError, VideoPlayer } from "@vanillaskyai/video/react";
import { templates } from "./vanillasky/index.ts";
const video = {
  schemaVersion: "0.1",
  orientation: "portrait",
  scenes: [
    { id: "text", templateId: "minimal-text", variables: { headline: "Customer health", detail: "Activation is up 18%." }, timing: { fixedDuration: 2 } },
    { id: "data", templateId: "structured-data", variables: { label: "Activation", current: 58, previous: 41, unit: "%", explanation: "Guided onboarding helped more users reach value." }, timing: { fixedDuration: 2 } },
    { id: "media", templateId: "supplied-media", variables: { imageUrl: ${previewImageUrl}, headline: "See the change in context.", caption: "The dashboard reflects the grounded result described in the answer." }, timing: { fixedDuration: 2 } },
    { id: "builtin", templateId: "bigNumber", variables: { value: "42", label: "retention" }, timing: { fixedDuration: 1 } },
  ],
  style: { brand: { font: "Inter", scriptFont: "Caveat", background: { type: "gradient", colors: ["#8711C1", "#2167E3"] }, colors: { primary: "#00E5A0", secondary: "#006BE5", foreground: "#FFFFFF", surface: "#0A0A14", surfaceElevated: "#14152A", muted: "#A7A6B0" } } },
};
const error = new VideoError("Safe browser error", { code: "video_failed", cause: new Error("provider secret") });

createRoot(document.getElementById("root")).render(createElement("main", null,
  createElement(VideoPlayer, { video, templates, autoPlay: false, width: 360 }),
  createElement("output", {
    id: "typed-error",
    "data-code": error.code,
    "data-has-cause": String(Object.prototype.hasOwnProperty.call(error, "cause")),
  }, error.message),
));
`);
  execFileSync(process.execPath, [join(consumer, "node_modules", "vite", "bin", "vite.js"), "build"], { cwd: consumer, stdio: "inherit" });

  const preview = spawn(process.execPath, [
    join(consumer, "node_modules", "vite", "bin", "vite.js"),
    "--host", "127.0.0.1", "--port", "4387", "--strictPort",
  ], { cwd: consumer, stdio: "pipe" });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const browserErrors = [];
    let generationRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/video") generationRequests += 1;
    });
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    let opened = false;
    for (let attempt = 0; attempt < 40 && !opened; attempt += 1) {
      try {
        await page.goto("http://127.0.0.1:4387", { waitUntil: "networkidle", timeout: 1_000 });
        opened = true;
      } catch {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      }
    }
    if (!opened) throw new Error("Packed consumer preview did not start");
    await page.waitForTimeout(500);
    if (browserErrors.length > 0) throw new Error(`Packed consumer browser errors before playback:\n${browserErrors.join("\n")}`);
    await page.waitForSelector('[data-template-id="minimal-text"]');
    if ((await page.locator("body").textContent())?.includes("Activation is up 18%.") !== true) {
      throw new Error("Packed saved playback did not render the generated customer template");
    }
    const typedError = page.locator("#typed-error");
    if (await typedError.getAttribute("data-code") !== "video_failed") {
      throw new Error("Packed VideoError lost its safe code");
    }
    if (await typedError.getAttribute("data-has-cause") !== "false") {
      throw new Error("Packed VideoError exposed a raw provider cause");
    }
    await page.getByRole("button", { name: "Play video response" }).click();
    await page.waitForSelector('[data-template-id="structured-data"]', { timeout: 5_000 });
    await page.getByText("Guided onboarding helped more users reach value.").waitFor({ timeout: 5_000 });
    await page.waitForSelector('[data-template-id="supplied-media"]', { timeout: 5_000 });
    await page.getByText("The dashboard reflects the grounded result described in the answer.").waitFor({ timeout: 5_000 });
    const mediaImage = page.locator('[data-template-id="supplied-media"] img');
    await mediaImage.waitFor({ timeout: 5_000 });
    const mediaLoaded = await mediaImage.evaluate((image) => {
      if (image.complete) return image.naturalWidth > 0;
      return new Promise((resolveImage) => {
        image.addEventListener("load", () => resolveImage(image.naturalWidth > 0), { once: true });
        image.addEventListener("error", () => resolveImage(false), { once: true });
      });
    });
    if (!mediaLoaded) throw new Error("Packed supplied-media reference image did not decode");
    await page.waitForSelector('[data-template-id="bigNumber"]', { timeout: 5_000 });
    await page.getByText("retention").waitFor({ timeout: 5_000 });
    if (generationRequests !== 0) throw new Error("Packed saved replay called the generation endpoint");
    if (browserErrors.length > 0) throw new Error(`Packed consumer browser errors:\n${browserErrors.join("\n")}`);
  } finally {
    await browser.close();
    preview.kill("SIGTERM");
  }

  writeFileSync(join(react19Consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", [
    "install", "--ignore-scripts", "--no-audit", "--no-fund", tarball,
    "react@19.2.8", "react-dom@19.2.8", "vite@7.1.7",
  ], { cwd: react19Consumer, stdio: "inherit" });
  writeFileSync(join(react19Consumer, "index.html"), '<main id="root"></main><script type="module" src="/main.jsx"></script>');
  writeFileSync(join(react19Consumer, "main.jsx"), `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { VideoPlayer } from "@vanillaskyai/video/react";
import { createTemplateRegistry, defineTemplate } from "@vanillaskyai/video/templates";

const schema = { type: "object", properties: {}, additionalProperties: false };
const probe = (id) => defineTemplate({
  id,
  useWhen: "The packed transition peer gate selects this deterministic probe.",
  usesGlobalTransition: true,
  transitionTiming: { entryReadyProgress: 0.2, holdProgress: 0.7 },
  schema,
  component: ({ progress, motionProgress }) => createElement("button", {
    "data-probe": id,
    "data-progress": progress.toFixed(3),
    "data-motion-progress": motionProgress?.toFixed(3),
  }, id, createElement("span", {
    "data-transition-semantic": "transient",
    style: { visibility: "var(--vanillasky-transition-semantic-visibility, visible)" },
  }, "0x")),
});
const definitions = [
  probe("react19-opening"),
  probe("react19-incoming"),
  probe("react19-undefined"),
  probe("react19-unknown"),
  probe("react19-isolated"),
];
const templates = createTemplateRegistry({ definitions });
const brand = {
  font: "Inter",
  scriptFont: "Caveat",
  background: { type: "gradient", colors: ["#8711C1", "#2167E3"] },
  colors: { primary: "#00E5A0", secondary: "#006BE5", foreground: "#FFFFFF", surface: "#0A0A14", surfaceElevated: "#14152A", muted: "#A7A6B0" },
};
const video = {
  schemaVersion: "0.1",
  orientation: "portrait",
  scenes: [
    { id: "react19-opening-scene", templateId: "react19-opening", variables: { mediaUrl: "opening.jpg" }, timing: { fixedDuration: 0.6 } },
    { id: "react19-incoming-scene", templateId: "react19-incoming", variables: { mediaUrl: "incoming.jpg" }, timing: { fixedDuration: 0.6 } },
  ],
  style: {
    defaultTransition: "crossfade",
    brand,
  },
};
const sharedBackgroundVideo = {
  ...video,
  scenes: video.scenes.map((scene) => ({ ...scene, variables: {} })),
};
const isolatedVideo = (id, defaultTransition) => ({
  schemaVersion: "0.1",
  orientation: "portrait",
  scenes: [{ id: id + "-scene", templateId: id, variables: {}, timing: { fixedDuration: 1 } }],
  style: { brand, ...(defaultTransition === undefined ? {} : { defaultTransition }) },
});
const players = [
  { id: "transition", label: "React 19 transition probe", video },
  { id: "shared", label: "React 19 shared-background probe", video: sharedBackgroundVideo },
  { id: "undefined", label: "React 19 undefined hard-cut probe", video: isolatedVideo("react19-undefined", undefined) },
  { id: "unknown", label: "React 19 unknown hard-cut probe", video: isolatedVideo("react19-unknown", "wipe") },
  { id: "isolated", label: "React 19 isolated crossfade probe", video: isolatedVideo("react19-isolated", "crossfade") },
];
createRoot(document.getElementById("root")).render(createElement("main", null,
  players.map((player) => createElement("section", { key: player.id, "data-case": player.id },
    createElement(VideoPlayer, {
      video: player.video,
      templates,
      autoPlay: false,
      width: 360,
      ariaLabel: player.label,
    }),
  )),
));
`);
  const react19Preview = spawn(process.execPath, [
    join(react19Consumer, "node_modules", "vite", "bin", "vite.js"),
    "--host", "127.0.0.1", "--port", "4391", "--strictPort",
  ], { cwd: react19Consumer, stdio: "pipe" });
  const react19Browser = await chromium.launch({ headless: true });
  try {
    const page = await react19Browser.newPage();
    const browserErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    let opened = false;
    for (let attempt = 0; attempt < 40 && !opened; attempt += 1) {
      try {
        await page.goto("http://127.0.0.1:4391", { waitUntil: "networkidle", timeout: 1_000 });
        opened = true;
      } catch {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      }
    }
    if (!opened) throw new Error("React 19 transition consumer did not start");
    await page.clock.install();
    const startedPlayers = await page
      .locator('[data-case] button[aria-label="Play video response"]')
      .evaluateAll((buttons) => {
        for (const button of buttons) button.click();
        return buttons.length;
      });
    if (startedPlayers !== 5) {
      throw new Error("React 19 transition players did not start synchronously");
    }
    await page.clock.fastForward(450);
    const transitionCase = page.locator('[data-case="transition"]');
    await transitionCase.locator('[data-scene-layer="outgoing"]').waitFor({ timeout: 4_000 });
    const outgoingProgress = await transitionCase.locator('[data-scene-layer="outgoing"] [data-probe]').evaluate((element) => ({
      raw: Number(element.getAttribute("data-progress")),
      motion: Number(element.getAttribute("data-motion-progress")),
    }));
    if (!Number.isFinite(outgoingProgress.raw) || !Number.isFinite(outgoingProgress.motion)
      || outgoingProgress.raw <= 0.5 || outgoingProgress.raw >= 1
      || Math.abs(outgoingProgress.raw - outgoingProgress.motion) > 0.0005) {
      throw new Error("React 19 transition did not preserve the outgoing template timeline");
    }
    const incomingProgress = await transitionCase.locator('[data-scene-layer="incoming"] [data-probe]').evaluate((element) => ({
      raw: Number(element.getAttribute("data-progress")),
      motion: Number(element.getAttribute("data-motion-progress")),
    }));
    const incomingOpacity = Number(await transitionCase
      .locator('[data-scene-layer="incoming"]')
      .evaluate((element) => element.ownerDocument.defaultView?.getComputedStyle(element).opacity));
    if (!Number.isFinite(incomingProgress.raw) || !Number.isFinite(incomingProgress.motion)
      || !Number.isFinite(incomingOpacity) || incomingOpacity <= 0 || incomingOpacity >= 1
      || incomingProgress.raw !== 0
      || incomingProgress.motion !== 0) {
      throw new Error("React 19 transition preview advanced the incoming template timeline");
    }
    const incomingTransientSemantic = transitionCase.locator('[data-scene-layer="incoming"] [data-transition-semantic="transient"]');
    if (await incomingTransientSemantic.evaluate((element) => element.ownerDocument.defaultView?.getComputedStyle(element).visibility) !== "hidden") {
      throw new Error("Packed transition exposed transient placeholder semantics");
    }
    const sharedCase = page.locator('[data-case="shared"]');
    if (await sharedCase.locator('[data-scene-layer="outgoing"], [data-scene-layer="incoming"]').count() !== 0) {
      throw new Error("React 19 shared background incorrectly crossfaded scene layers");
    }
    const sharedProgress = await sharedCase.locator('[data-scene-layer="active"] [data-probe]').evaluate((element) => ({
      raw: Number(element.getAttribute("data-progress")),
      motion: Number(element.getAttribute("data-motion-progress")),
    }));
    if (!Number.isFinite(sharedProgress.raw) || !Number.isFinite(sharedProgress.motion)
      || sharedProgress.raw <= 0 || sharedProgress.raw >= 1
      || Math.abs(sharedProgress.raw - sharedProgress.motion) > 0.0005) {
      throw new Error("React 19 shared background did not preserve native template motion");
    }
    for (const [id, message] of [
      ["undefined", "React 19 undefined hard-cut motion progress diverged from raw progress"],
      ["unknown", "React 19 unknown hard-cut motion progress diverged from raw progress"],
      ["isolated", "React 19 isolated crossfade motion progress diverged from raw progress"],
    ]) {
      const progress = await page.locator(`[data-case="${id}"] [data-probe]`).evaluate((element) => ({
        raw: Number(element.getAttribute("data-progress")),
        motion: Number(element.getAttribute("data-motion-progress")),
      }));
      if (!Number.isFinite(progress.raw) || !Number.isFinite(progress.motion)
        || progress.raw <= 0 || progress.raw >= 1
        || Math.abs(progress.raw - progress.motion) > 0.0005) throw new Error(message);
    }
    const hiddenLayer = transitionCase.locator("[data-scene-layer][inert]");
    if (await hiddenLayer.count() !== 1
      || !await hiddenLayer.evaluate((element) => element.hasAttribute("inert"))) {
      throw new Error("React 19 transition layer did not retain inert focus isolation");
    }
    const hiddenButton = hiddenLayer.locator("button");
    if (await hiddenButton.evaluate((button) => {
      button.focus();
      return button.ownerDocument.activeElement === button;
    })) throw new Error("React 19 transition layer did not retain inert focus isolation");
    if (await transitionCase.locator('[data-video-frame="ready"][data-scene-id]').count() !== 1
      || await transitionCase.locator("[data-layer-scene-id]").count() !== 2) {
      throw new Error("React 19 transition scene identity was duplicated or missing");
    }
    await page.clock.fastForward(600);
    for (const id of ["undefined", "unknown", "isolated"]) {
      const progress = await page.locator(`[data-case="${id}"] [data-probe]`).evaluate((element) => ({
        raw: Number(element.getAttribute("data-progress")),
        motion: Number(element.getAttribute("data-motion-progress")),
      }));
      if (progress.raw !== 1 || progress.motion !== 0.7) {
        throw new Error("React 19 terminal poster did not settle at the readable hold frame");
      }
    }
    await transitionCase.locator('[data-scene-layer="active"][data-layer-scene-id="react19-incoming-scene"]').waitFor({ timeout: 4_000 });
    const settledProgress = await transitionCase.locator('[data-scene-layer="active"] [data-probe]').evaluate((element) => ({
      raw: Number(element.getAttribute("data-progress")),
      motion: Number(element.getAttribute("data-motion-progress")),
    }));
    if (!Number.isFinite(settledProgress.raw) || !Number.isFinite(settledProgress.motion)
      || settledProgress.raw <= 0 || settledProgress.raw >= 1
      || Math.abs(settledProgress.raw - settledProgress.motion) > 0.0005) {
      throw new Error("React 19 settled scene did not resume its complete template timeline");
    }
    const activeTransientSemantic = transitionCase.locator('[data-scene-layer="active"] [data-transition-semantic="transient"]');
    if (await activeTransientSemantic.evaluate((element) => element.ownerDocument.defaultView?.getComputedStyle(element).visibility) !== "visible") {
      throw new Error("Packed settled scene kept transient semantics hidden");
    }
    if (browserErrors.length > 0) throw new Error(`React 19 transition browser errors:\n${browserErrors.join("\n")}`);
  } finally {
    await react19Browser.close();
    react19Preview.kill("SIGTERM");
  }

  verifyPackedMarkdownDocumentation({ packageRoot, repositoryRoot: root });
  for (const relative of ["dist/index.js", "dist/server.js", "dist/react.js", "dist/templates.js", "dist/template-catalog.js", "dist/test.js", "dist/check-runtime.js", "bin/vanillasky.js", "registry/items/notification.json"]) {
    if (!existsSync(join(packageRoot, relative))) throw new Error(`Packed package is missing ${relative}`);
  }
  execFileSync(process.execPath, [join(packageRoot, "bin", "vanillasky.js"), "list"], { cwd: consumer, stdio: "ignore" });
  console.log(`Packed SDK artifact ${selectedArtifact.integrity} created, checked, built, parsed, and replayed with zero generation requests.`);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
