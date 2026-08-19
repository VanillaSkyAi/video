import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_TEMPLATE_SCHEMAS } from "../src/visual-system/scene-templates/schemas";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("final candidate feedback regressions", () => {
  it("ships one minimal OpenAI quickstart configuration owned by the package", () => {
    const manifest = JSON.parse(read("package.json")) as { files: string[] };
    const environment = read("examples/nextjs-quickstart/.env.example");

    expect(manifest.files).toContain("examples/nextjs-quickstart/.env.example");
    expect(manifest.files).not.toContain("examples/nextjs-quickstart/config");
    expect(environment).toBe("OPENAI_API_KEY=replace-me\nOPENAI_MODEL=gpt-4.1\n");
    expect(environment).not.toMatch(/ANTHROPIC|VIDEO_PROVIDER/);
  });

  it("links shipped quickstart documentation to the immutable release tag", () => {
    const version = (JSON.parse(read("package.json")) as { version: string }).version;
    const expected = `https://github.com/VanillaSkyAi/video/tree/v${version}/examples/nextjs-quickstart`;
    for (const path of ["README.md", "docs/getting-started.md", "docs/integrate-nextjs.md"]) {
      const source = read(path);
      expect(source, path).toContain(expected);
      expect(source, path).not.toContain("/tree/main/examples/nextjs-quickstart");
    }
  });

  it("uses only real public VanillaSky APIs in the code editor default", () => {
    const schema = BUILTIN_TEMPLATE_SCHEMAS.codeEditor;
    const code = schema.properties.code.default;

    expect(code).toContain('from "@vanillaskyai/video"');
    expect(code).toContain("getVideoDuration");
    expect(code).toContain("import type { Video }");
    expect(code).not.toContain('from "vanillasky"');
    expect(code).not.toMatch(/\bcreate\s*\(/);
    expect(code).not.toContain("video.url");
  });

  it("uses a supported CLI command in the terminal default", () => {
    const command = BUILTIN_TEMPLATE_SCHEMAS.terminal.properties.command.default;

    expect(command).toBe("npx vanillasky check");
    expect(command).not.toContain("create --");
  });

  it("keeps server prompt construction out of browser and test entry graphs", () => {
    const browserCatalog = read("src/visual-system/catalog/builtin.ts");
    const testCatalog = read("src/visual-system/catalog/builtin-server.ts");
    const serverCatalog = read("src/visual-system/catalog/catalog.ts");
    const composer = read("src/server/compose-video.ts");
    const simulator = read("src/test/simulate-video-stream.ts");

    expect(browserCatalog).toContain('from "./builtin-metadata.js"');
    expect(browserCatalog).not.toContain('from "./catalog.js"');
    expect(testCatalog).toContain('from "./builtin-metadata.js"');
    expect(testCatalog).not.toContain('from "./catalog.js"');
    expect(serverCatalog).toContain('from "./builtin-metadata.js"');
    expect(serverCatalog).toContain('from "./prompt.js"');
    expect(composer).not.toContain('import { DEFAULT_VIDEO_SYSTEM_PROMPT } from "./prompts/system-prompt.js"');
    expect(composer).toContain('await import("./prompts/system-prompt.js")');
    expect(simulator).not.toMatch(/^import \{ createVideo \}/m);
    expect(simulator).not.toMatch(/^import \{ createTextDeltaVideoPlanner \}/m);
    expect(simulator).not.toMatch(/^import \{ BUILTIN_SERVER_TEMPLATE_KIT \}/m);
    expect(simulator).toContain('await import("../server/compose-video.js")');
    expect(simulator).toContain('await import("../visual-system/catalog/builtin-server.js")');
  });

  it("documents the optional compiler only for source-owned templates", () => {
    const loader = read("src/cli/project-templates.ts");

    for (const path of ["README.md", "docs/customization.md", "docs/custom-templates.md"]) {
      const guide = read(path);
      expect(guide, path).toContain("npm install --save-dev tsx");
      expect(guide, path).toMatch(/only.*source-owned template|source-owned templates.*only/is);
    }
    expect(loader).not.toContain("const resolvedTsxLoader =");
    expect(loader).toContain("resolveProjectTsxRuntime");
  });

  it("states that max duration is a ceiling and encoded video export is app-owned", () => {
    const concepts = read("docs/concepts.md");
    const protocol = read("docs/reference/protocol.md");
    const readme = read("README.md");

    expect(protocol).toMatch(/maxDurationSec.*ceiling/is);
    expect(protocol).toMatch(/may complete.*below.*ceiling/is);
    expect(concepts).toMatch(/does not (?:include|provide).*MP4|MP4.*not included/is);
    expect(readme).toMatch(/MP4.*application-owned|application-owned.*MP4/is);
  });
});
