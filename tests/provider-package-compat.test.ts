import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const verifier = readFileSync(
  resolve(root, "scripts", "verify-nextjs-onboarding.mjs"),
  "utf8",
);
const ciWorkflow = readFileSync(resolve(root, ".github", "workflows", "ci.yml"), "utf8");

describe("packed provider package compatibility", () => {
  it("pins the real Google, OpenRouter, and AI SDK packages without changing SDK dependencies", () => {
    expect(verifier).toContain('packageName: "@ai-sdk/google"');
    expect(verifier).toContain('version: "4.0.44"');
    expect(verifier).toContain('packageName: "@openrouter/ai-sdk-provider"');
    expect(verifier).toContain('version: "3.0.0"');
    expect(verifier).toContain('const aiVersion = "7.0.66"');
    expect(verifier).toContain("bmRTDg06jQD+eX8nf214pET9+Oe8O1+lUIRGbWsGXj9IN2UJkpl1O1x7cvtiboyTtKSLvSRdVtItUfSl8sQ2GA==");
    expect(verifier).toContain("m9XTSWoODH2RM5OsZpaGiN7QRR8cdP5paBWq699Tu3JVmGPBKT8xF8XwV0ZBVVsjikD/JgWfak4VSsTR4wAVbg==");
    expect(verifier).toContain("wBUyoCYF3GVr+62nelBgR8YbpTSsMZrzFyOOjiwijylNSM2TFCW35C+Pml2vc59/WLMpyhS/LWZ55M+B9DAcSg==");

    const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    expect(manifest.dependencies ?? {}).not.toHaveProperty("@ai-sdk/google");
    expect(manifest.dependencies ?? {}).not.toHaveProperty("@openrouter/ai-sdk-provider");
    expect(manifest.peerDependencies).not.toHaveProperty("@ai-sdk/google");
    expect(manifest.peerDependencies).not.toHaveProperty("@openrouter/ai-sdk-provider");
    expect(manifest.peerDependencies).not.toHaveProperty("ai");
  });

  it("keeps Google and OpenRouter fixture-only and compares their complete lock graphs", () => {
    const fixturePath = resolve(root, "tests", "fixtures", "provider-compatibility-locks.json");
    expect(existsSync(fixturePath)).toBe(true);
    expect(verifier).toContain("fixtureOnly: true");
    expect(verifier).toContain("canonicalizeCompatibilityLockGraph");
    expect(verifier).toContain("lockGraphSha256");
    expect(verifier).toContain("provider-compatibility-locks.json");
    expect(verifier).toContain("expectation.fixtureOnly !== true");
    expect(verifier).toContain('mode: "fixture-only"');
  });

  it("uses the declared npm CLI in every parallel CI job", () => {
    expect(ciWorkflow.match(/Install the locked npm CLI/g)).toHaveLength(6);
    expect(ciWorkflow.match(/npm install --global npm@11\.17\.0/g)).toHaveLength(6);
  });

  it("clears every supported real provider key before creating child environments", () => {
    for (const name of [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "GOOGLE_API_KEY",
      "GEMINI_API_KEY",
      "OPENROUTER_API_KEY",
    ]) {
      expect(verifier).toContain(`delete process.env.${name}`);
    }
  });

  it("uses the real provider factories with injected fetch and native SSE fixtures", () => {
    expect(verifier).toContain('from "@ai-sdk/google"');
    expect(verifier).toContain("createGoogleGenerativeAI");
    expect(verifier).toContain('from "@openrouter/ai-sdk-provider"');
    expect(verifier).toContain("createOpenRouter");
    expect(verifier).toContain("compatibilityFetch");
    expect(verifier).toContain("new Request(input, init)");
    expect(verifier).toContain('"content-type": "text/event-stream"');
    expect(verifier).toContain(":streamGenerateContent?alt=sse");
    expect(verifier).toContain("/chat/completions");
    expect(verifier).toContain("providerMetadataSentinel");
    expect(verifier).toContain('rmSync(join(app, "src/app/api/video/providers")');
  });

  it("proves one native request, private metadata, lifecycle normalization, and replay isolation", () => {
    expect(verifier).toContain("video.compatibility.fetch");
    expect(verifier).toContain("video.compatibility.metadata");
    expect(verifier).toContain("fetchCount !== 1");
    expect(verifier).toContain("metadata.private !== true");
    expect(verifier).toContain("metadata.sentinelMatched !== true");
    expect(verifier).toContain("generationPostCount !== 1");
    expect(verifier).toContain("reload issued");
    expect(verifier).toContain("expectedCompatibilityUsage");
    expect(verifier).toContain("finishReason");
    expect(verifier).toContain("configuredModel");
    expect(verifier).toContain("resolvedModel");
  });

  it("keeps credentials and provider diagnostics out of every browser-retained surface", () => {
    expect(verifier).toContain("compatibilityCredentialForbiddenValues");
    expect(verifier).toContain('"successful SSE"');
    expect(verifier).toContain("DOM:");
    expect(verifier).toContain("localStorage:");
    expect(verifier).toContain('"static bundle"');
    expect(verifier).toContain('"public lifecycle evidence"');
    expect(verifier).toContain("verifyCompatibilityBrowserBoundary");
  });

  it("guards the unchanged canonical route, planner, client, and TypeScript settings", () => {
    expect(verifier).toContain("routeHash");
    expect(verifier).toContain("plannerHash");
    expect(verifier).toContain("clientHash");
    expect(verifier).toContain("tsconfigHash");
    expect(verifier).toContain("route drifted");
    expect(verifier).toContain("planner drifted");
    expect(verifier).toContain("client drifted");
    expect(verifier).toContain("TypeScript config drifted");
  });
});
