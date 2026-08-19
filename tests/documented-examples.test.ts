import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const rootPackage = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  version: string;
  scripts: Record<string, string>;
};

function examplePackage(name: string): {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
} {
  return JSON.parse(readFileSync(resolve(root, "examples", name, "package.json"), "utf8"));
}

describe("documented examples", () => {
  it("gives coding agents one concise public integration path and keeps evaluation guidance maintainer-only", () => {
    const guidePath = resolve(root, "docs/agent-integration.md");
    const evaluationPath = resolve(root, "docs/maintainers/cold-start-evaluation.md");
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const agentInstructions = readFileSync(resolve(root, "AGENTS.md"), "utf8");

    expect(existsSync(guidePath)).toBe(true);
    expect(existsSync(evaluationPath)).toBe(true);
    const guide = readFileSync(guidePath, "utf8");
    const evaluation = readFileSync(evaluationPath, "utf8");
    expect(guide).toContain("## Build the first response");
    expect(guide).toContain("createVideoHandler");
    expect(guide).toContain("useVideo()");
    expect(guide).toContain("Never invent another provider");
    expect(guide).toContain(".env.local");
    expect(guide).not.toMatch(/101 demo|proof of concept|cold-start evaluation/i);
    expect(evaluation).toContain("Do not inspect SDK source");
    expect(evaluation).toContain("npm pack --silent --json");
    expect(readme).toContain("[Agent integration guide](docs/agent-integration.md)");
    expect(agentInstructions).toContain("docs/agent-integration.md");
  });

  it("defines audio as a soundtrack and names narration as outside the 0.1 contract", () => {
    const guide = readFileSync(resolve(root, "docs/media-and-audio.md"), "utf8");

    expect(guide).toContain("soundtrack");
    expect(guide).toContain("does not provide narration, TTS, or speech synchronization");
  });

  it("documents Vitest, route-handler, fake-timer, abort, and timeout testing", () => {
    const guide = readFileSync(new URL("../docs/testing.md", import.meta.url), "utf8");
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

    expect(guide).toContain('from "@vanillaskyai/video/test"');
    expect(guide).toContain("createMockVideoPlanner");
    expect(guide).toContain("simulateVideoStream");
    expect(guide).toContain("vi.useFakeTimers()");
    expect(guide).toContain("createVideoHandler");
    expect(guide).toContain("new Request");
    expect(guide).toContain("AbortController");
    expect(guide).toContain("timeoutMs");
    expect(readme).toContain("[Test integrations](docs/testing.md)");
  });

  it("documents which catalog commands execute trusted application code", () => {
    const security = readFileSync(new URL("../docs/security.md", import.meta.url), "utf8");
    expect(security).toContain("trusted application build code");
    expect(security).toMatch(/`vanillasky list`[\s\S]*`vanillasky describe`/);
    expect(security).toMatch(/`vanillasky add`[\s\S]*`--dry-run`[\s\S]*`--diff`/);
    expect(security).toMatch(/`vanillasky sync`[\s\S]*`vanillasky check`/);
    expect(security).toContain("--builtin");
    expect(security).toContain("does not execute project template modules");
  });

  it("documents that add previews include generated browser and server registries", () => {
    const guide = readFileSync(new URL("../docs/custom-templates.md", import.meta.url), "utf8");

    expect(guide).toMatch(/`--dry-run`[\s\S]*`--diff`[\s\S]*browser and server registries/);
    expect(guide).toMatch(/does not apply\s+any proposed file write/);
    expect(guide).toContain("trusted project source can have its own side effects");
    expect(guide).not.toContain("leave the project byte-identical");
  });

  it("strictly compiles the exact transition semantic value example", () => {
    const guide = readFileSync(resolve(root, "docs/custom-templates.md"), "utf8");
    const source = guide.match(
      /<!-- verify:transition-semantic-value:start -->\s*```tsx\r?\n([\s\S]*?)\r?\n```\s*<!-- verify:transition-semantic-value:end -->/,
    )?.[1];
    expect(source).toBeTruthy();

    const workspace = mkdtempSync(resolve(root, ".transition-semantic-doc-"));
    try {
      writeFileSync(resolve(workspace, "example.tsx"), source!);
      writeFileSync(resolve(workspace, "tsconfig.json"), JSON.stringify({
        compilerOptions: {
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noEmit: true,
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "react-jsx",
          skipLibCheck: false,
          isolatedModules: true,
        },
        include: ["example.tsx"],
      }));
      execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.json"], {
        cwd: workspace,
        stdio: "inherit",
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
  it.each(["react-vite", "server-integrations", "nextjs-quickstart"])(
    "%s pins the repository's current public protocol version",
    (name) => {
      expect(examplePackage(name).dependencies["@vanillaskyai/video"]).toBe(rootPackage.version);
    },
  );

  it("includes a committed copy-and-run full-stack Next.js quickstart", () => {
    const exampleRoot = resolve(root, "examples", "nextjs-quickstart");
    expect(existsSync(resolve(exampleRoot, "package.json"))).toBe(true);
    expect(existsSync(resolve(exampleRoot, "src/app/api/video/route.ts"))).toBe(true);
    expect(existsSync(resolve(exampleRoot, "src/app/page.tsx"))).toBe(true);
  });

  it("exposes separate verification for documented examples and the packed candidate", () => {
    expect(rootPackage.scripts["examples:verify-documented"]).toBe(
      "node scripts/verify-documented-examples.mjs",
    );
    expect(rootPackage.scripts["examples:install-current"]).toBe(
      "npm run build && node scripts/install-current-examples.mjs",
    );
    expect(rootPackage.scripts["verify:nextjs"]).toBe(
      "node scripts/verify-nextjs-onboarding.mjs",
    );
  });

  it("runs documented commands against the unpublished packed candidate", () => {
    const verifier = readFileSync(resolve(root, "scripts/verify-documented-examples.mjs"), "utf8");
    expect(verifier).toContain('"pack", "--silent", "--json", "--pack-destination", workspace');
    expect(verifier).toContain('manifest.dependencies["@vanillaskyai/video"] = `file:${candidateTarball}`');
    expect(verifier).toContain("installedVersion !== candidateVersion");
  });
});
