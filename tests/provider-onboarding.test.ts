import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const example = resolve(root, "examples", "nextjs-quickstart");
const read = (path: string) => readFileSync(resolve(example, path), "utf8");
const packageVersion = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version as string;

describe("canonical provider onboarding", () => {
  it("ships one small OpenAI path without custom-template or persistence setup", () => {
    const manifest = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(manifest.dependencies).toMatchObject({
      "@ai-sdk/openai": expect.any(String),
      "@vanillaskyai/video": packageVersion,
      ai: expect.any(String),
      next: expect.any(String),
      react: expect.any(String),
      "react-dom": expect.any(String),
    });
    expect(manifest.dependencies).not.toHaveProperty("@ai-sdk/anthropic");
    expect(manifest.devDependencies).not.toHaveProperty("tsx");
    expect(existsSync(resolve(example, "config"))).toBe(false);
    expect(existsSync(resolve(example, "vanillasky"))).toBe(false);
    expect(existsSync(resolve(example, "src/app/api/video/provider.ts"))).toBe(false);
    expect(existsSync(resolve(example, "src/app/api/video/planner.ts"))).toBe(false);
  });

  it("connects the model directly in one fail-closed server route", () => {
    const route = read("src/app/api/video/route.ts");
    const manifest = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(route).toContain('from "@ai-sdk/openai"');
    expect(route).toContain('from "ai"');
    expect(route).toContain('from "@vanillaskyai/video/server"');
    expect(route).toContain("createVideoHandler({");
    expect(route).toContain("streamText:");
    expect(route).toContain('process.env.VANILLASKY_LOCAL_DEMO !== "1"');
    expect(manifest.scripts.dev).toBe("cross-env VANILLASKY_LOCAL_DEMO=1 next dev");
    expect(manifest.devDependencies["cross-env"]).toBe("10.1.0");
    expect(route).not.toMatch(/templates,|onWarning:|onComplete:|onError:|providerMetadata/);
  });

  it("generates and plays one personalized video without replay plumbing", () => {
    const page = read("src/app/page.tsx");

    expect(page).toContain('VideoPlayer, useVideo');
    expect(page).toContain("video.generate({");
    expect(page).toContain("personalization:");
    expect(page).toContain("<VideoPlayer {...video.playerProps}");
    expect(page).not.toMatch(/parseVideo|getVideoDuration|localStorage|templates=|vanillasky\//);
  });

  it("documents only the copy-run-generate path", () => {
    const readme = read("README.md");
    const environment = read(".env.example");

    expect(environment).toBe("OPENAI_API_KEY=replace-me\nOPENAI_MODEL=gpt-4.1\n");
    expect(readme).toContain("npm install");
    expect(readme).toContain("cp .env.example .env.local");
    expect(readme).toContain("npm run dev");
    expect(readme).toContain("Replace the local-only authorization before deploying");
    expect(readme).not.toMatch(/Anthropic|provider selector|custom template|localStorage|replay/i);
  });

  it("keeps broad provider compatibility in an internal fixture, not the public quickstart", () => {
    const verifier = readFileSync(resolve(root, "scripts", "verify-nextjs-onboarding.mjs"), "utf8");

    expect(verifier).toContain('"tests", "fixtures", "nextjs-provider-app"');
    expect(verifier).toContain('const providers = ["openai", "anthropic"]');
    expect(verifier).toContain("MockLanguageModelV4");
    expect(verifier).toContain("response.status !== 401");
    expect(verifier).toContain("provider_warning");
    expect(verifier).toContain("credentialForbiddenValues");
    expect(verifier).toContain("allocateLocalPort");
    expect(verifier).toContain('assertSavedDuration(page, "8 seconds"');
    expect(verifier).toContain('scenes?.[0]?.id !== "supplied-opening"');
    expect(verifier).not.toMatch(/const (?:production|development)Port = 43\d{2}/);
  });

  it("keeps live provider acceptance explicitly gated and separate from deterministic CI", () => {
    const packageManifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const audit = readFileSync(resolve(root, "docs", "maintainers", "provider-onboarding.md"), "utf8");

    expect(packageManifest.scripts["acceptance:live"]).toBe("tsx scripts/acceptance/run-live.ts");
    expect(packageManifest.scripts["verify:nextjs"]).toBe("node scripts/verify-nextjs-onboarding.mjs");
    expect(audit).toContain("Deterministic CI does not read real provider credentials");
  });
});
