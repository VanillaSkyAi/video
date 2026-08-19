import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { rename, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runVanillaSkyCli } from "../src/cli/index";
import { createTemplate } from "../src/cli/create";
import { syncTemplates } from "../src/cli/sync";

const fixtures: string[] = [];
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const typescriptCli = createRequire(import.meta.url).resolve("typescript/bin/tsc");

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function project(): string {
  const cwd = mkdtempSync(join(tmpdir(), "vanillasky-create-"));
  fixtures.push(cwd);
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ type: "module" }));
  const sdk = join(cwd, "node_modules/@vanillaskyai/video");
  mkdirSync(sdk, { recursive: true });
  writeFileSync(join(sdk, "package.json"), JSON.stringify({
    type: "module",
    exports: { "./templates": "./templates.js" },
  }));
  writeFileSync(join(sdk, "templates.js"), [
    "export const defineTemplate = (definition) => Object.freeze({",
    '  label: definition.id, description: "", usesGlobalTextEffect: false,',
    "  usesGlobalTransition: false, usesGlobalBackgroundEffect: false,",
    "  ...definition, schema: { ...definition.schema, additionalProperties: definition.schema.additionalProperties ?? false },",
    "});",
    "export const createTemplateRegistry = ({ definitions, metadata }) => {",
    "  const values = metadata ?? definitions.map(({ component, examples, ...value }) => value);",
    "  return { listTemplateMetadata: () => values, capabilities: { templates: values.map(({ id }) => id) } };",
    "};",
  ].join("\n"));
  const react = join(cwd, "node_modules/react");
  mkdirSync(react, { recursive: true });
  writeFileSync(join(react, "package.json"), JSON.stringify({ type: "module", exports: { "./jsx-runtime": "./jsx-runtime.js" } }));
  writeFileSync(join(react, "jsx-runtime.js"), "export const jsx = () => null; export const jsxs = jsx; export const Fragment = Symbol.for('react.fragment');\n");
  writeFileSync(join(react, "jsx-runtime.d.ts"), [
    "export namespace JSX { interface IntrinsicElements { [element: string]: unknown } }",
    "export declare const jsx: (...args: unknown[]) => unknown;",
    "export declare const jsxs: typeof jsx;",
    "export declare const Fragment: symbol;",
  ].join("\n"));
  return cwd;
}

async function run(cwd: string, args: string[]): Promise<{ exit: number; output: string[] }> {
  const output: string[] = [];
  const exit = await Promise.resolve(runVanillaSkyCli(args, { cwd, write: (line) => output.push(line) }));
  return { exit, output };
}

describe("vanillasky create", () => {
  it("is discoverable and creates, syncs, and explains one source-owned template", async () => {
    const cwd = project();
    const help = await run(cwd, ["help"]);
    const result = await run(cwd, ["create", "customer-health"]);

    expect(help.output.join("\n")).toContain("vanillasky create <id>");
    expect(result).toEqual({
      exit: 0,
      output: [
        "Created template: vanillasky/templates/customer-health.tsx",
        "Synced 1 template to vanillasky/index.ts and vanillasky/server.ts.",
        "Source: vanillasky/templates/customer-health.tsx",
        "Validate templates: vanillasky check",
      ],
    });
    expect(readdirSync(join(cwd, "vanillasky/templates"))).toEqual(["customer-health.tsx"]);
    expect(readFileSync(join(cwd, "vanillasky/index.ts"), "utf8")).toContain("customer-health");
    expect(readFileSync(join(cwd, "vanillasky/server.ts"), "utf8")).toContain('"id": "customer-health"');
  });

  it.each([
    [[], "Choose one template id. Usage: vanillasky create <id>."],
    [["one", "two"], "Unexpected create argument: two"],
    [["metric", "--overwrite"], "Unknown create option: --overwrite"],
    [["../metric"], 'Invalid template id: "../metric". Use a letter first, followed by letters, numbers, _ or -.' ],
    [["2metric"], 'Invalid template id: "2metric". Use a letter first, followed by letters, numbers, _ or -.' ],
    [["metric.tsx"], 'Invalid template id: "metric.tsx". Use a letter first, followed by letters, numbers, _ or -.' ],
    [["CON"], 'Invalid template id: "CON". This name is reserved on Windows.'],
    [["com1"], 'Invalid template id: "com1". This name is reserved on Windows.'],
    [["a".repeat(129)], 'Invalid template id: template ids must be at most 128 UTF-8 bytes.'],
  ])("rejects invalid CLI input %#", async (args, message) => {
    const cwd = project();
    const result = await run(cwd, ["create", ...args]);

    expect(result).toEqual({ exit: 1, output: [message] });
    expect(existsSync(join(cwd, "vanillasky"))).toBe(false);
  });

  it("refuses an existing destination without changing its bytes", async () => {
    const cwd = project();
    const destination = join(cwd, "vanillasky/templates/metric.tsx");
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, "customer owned\n");

    const result = await run(cwd, ["create", "metric"]);

    expect(result.exit).toBe(1);
    expect(result.output.join("\n")).toContain("already exists");
    expect(readFileSync(destination, "utf8")).toBe("customer owned\n");
  });

  it.each(["destination", "templates ancestor", "vanillasky ancestor"])("refuses a symlinked %s", async (kind) => {
    const cwd = project();
    const outside = mkdtempSync(join(tmpdir(), "vanillasky-create-outside-"));
    fixtures.push(outside);
    mkdirSync(join(cwd, "vanillasky/templates"), { recursive: true });
    if (kind === "destination") symlinkSync(join(outside, "metric.tsx"), join(cwd, "vanillasky/templates/metric.tsx"));
    if (kind === "templates ancestor") {
      rmSync(join(cwd, "vanillasky/templates"), { recursive: true });
      symlinkSync(outside, join(cwd, "vanillasky/templates"));
    }
    if (kind === "vanillasky ancestor") {
      rmSync(join(cwd, "vanillasky"), { recursive: true });
      symlinkSync(outside, join(cwd, "vanillasky"));
    }

    const result = await run(cwd, ["create", "metric"]);

    expect(result.exit).toBe(1);
    expect(result.output.join("\n")).toContain("symbolic link");
    expect(existsSync(join(outside, "metric.tsx"))).toBe(false);
  });

  it.each(["index.ts", "server.ts"])("does not follow a symlinked generated %s outside the project", async (output) => {
    const cwd = project();
    const outside = mkdtempSync(join(tmpdir(), "vanillasky-create-output-outside-"));
    fixtures.push(outside);
    mkdirSync(join(cwd, "vanillasky"), { recursive: true });
    const outsideFile = join(outside, output);
    writeFileSync(outsideFile, "outside user file\n");
    symlinkSync(outsideFile, join(cwd, "vanillasky", output));

    const result = await run(cwd, ["create", "metric"]);

    expect(result.exit).toBe(1);
    expect(result.output.join("\n")).toMatch(/symbolic link|symlink/i);
    expect(readFileSync(outsideFile, "utf8")).toBe("outside user file\n");
    expect(existsSync(join(cwd, "vanillasky/templates/metric.tsx"))).toBe(false);
  });

  it("writes deterministic public-only source with one template export", async () => {
    const first = project();
    const second = project();
    await run(first, ["create", "customerHealth"]);
    await run(second, ["create", "customerHealth"]);

    const firstSource = readFileSync(join(first, "vanillasky/templates/customerHealth.tsx"), "utf8");
    const secondSource = readFileSync(join(second, "vanillasky/templates/customerHealth.tsx"), "utf8");
    expect(firstSource).toBe(secondSource);
    expect(firstSource).toContain('import { defineTemplate } from "@vanillaskyai/video/templates";');
    expect(firstSource).not.toMatch(/src\/|visual-system|internal|createElement/);
    expect(firstSource.match(/\bexport\s+(?:default\s+)?(?:const|function|class)\b/g)).toHaveLength(1);
    expect(firstSource).toContain("useWhen:");
    expect(firstSource).toContain("description:");
    expect(firstSource).toContain("minLength:");
    expect(firstSource).toContain("maxLength:");
    expect(firstSource).toContain("default:");
    expect(firstSource.match(/examples:\s*\[/g)).toHaveLength(1);
    expect(firstSource).toContain("progress");
    expect(firstSource).toContain("width");
    expect(firstSource).toContain("height");
    expect(firstSource).toContain("safeZone");
  });

  it("removes only its atomically-created source when sync fails", async () => {
    const cwd = project();
    const keep = join(cwd, "vanillasky/keep.txt");
    mkdirSync(dirname(keep), { recursive: true });
    writeFileSync(keep, "keep\n");

    await expect(createTemplate({
      cwd,
      id: "metric",
      sync: async () => { throw new Error("sync exploded"); },
    })).rejects.toThrow("sync exploded");

    expect(existsSync(join(cwd, "vanillasky/templates/metric.tsx"))).toBe(false);
    expect(readFileSync(keep, "utf8")).toBe("keep\n");
    expect(existsSync(join(cwd, "vanillasky/templates"))).toBe(false);
  });

  it("rolls back both generated entrypoints and the new source when the second commit fails", async () => {
    const cwd = project();
    const original = join(cwd, "vanillasky/templates/original.tsx");
    mkdirSync(dirname(original), { recursive: true });
    writeFileSync(original, [
      'import { defineTemplate } from "@vanillaskyai/video/templates";',
      'export const original = defineTemplate({ id: "original", useWhen: "Original",',
      'schema: { type: "object", properties: {} }, component: () => null });',
    ].join("\n"));
    await syncTemplates({ cwd });
    const browserBefore = readFileSync(join(cwd, "vanillasky/index.ts"), "utf8");
    const serverBefore = readFileSync(join(cwd, "vanillasky/server.ts"), "utf8");
    const keep = join(cwd, "vanillasky/keep.txt");
    writeFileSync(keep, "customer owned\n");
    let failed = false;

    await expect(createTemplate({
      cwd,
      id: "metric",
      sync: (options) => syncTemplates({
        ...options,
        renameFile: async (from, to) => {
          if (!failed && to.endsWith("server.ts")) {
            failed = true;
            throw new Error("injected second commit failure");
          }
          await rename(from, to);
        },
      }),
    })).rejects.toThrow("injected second commit failure");

    expect(readFileSync(join(cwd, "vanillasky/index.ts"), "utf8")).toBe(browserBefore);
    expect(readFileSync(join(cwd, "vanillasky/server.ts"), "utf8")).toBe(serverBefore);
    expect(readFileSync(original, "utf8")).toContain('id: "original"');
    expect(readFileSync(keep, "utf8")).toBe("customer owned\n");
    expect(existsSync(join(cwd, "vanillasky/templates/metric.tsx"))).toBe(false);
  });

  it("keeps a committed source and registries coherent when backup cleanup fails", async () => {
    const cwd = project();
    const original = join(cwd, "vanillasky/templates/original.tsx");
    mkdirSync(dirname(original), { recursive: true });
    writeFileSync(original, [
      'import { defineTemplate } from "@vanillaskyai/video/templates";',
      'export const original = defineTemplate({ id: "original", useWhen: "Original",',
      'schema: { type: "object", properties: {} }, component: () => null });',
    ].join("\n"));
    await syncTemplates({ cwd });
    const keep = join(cwd, "vanillasky/keep.txt");
    writeFileSync(keep, "customer owned\n");

    const result = await createTemplate({
      cwd,
      id: "metric",
      sync: (options) => syncTemplates({
        ...options,
        unlinkFile: async (path) => {
          if (path.includes(".vanillasky-backup-")) throw new Error("injected cleanup failure");
          await unlink(path);
        },
      }),
    });

    const warnings = result.warnings ?? [];
    expect(warnings).toHaveLength(2);
    expect(warnings.join("\n")).toContain("Could not remove transaction backup");
    expect(readFileSync(join(cwd, "vanillasky/index.ts"), "utf8")).toContain("metric");
    expect(readFileSync(join(cwd, "vanillasky/server.ts"), "utf8")).toContain('"id": "metric"');
    expect(readFileSync(join(cwd, "vanillasky/templates/metric.tsx"), "utf8")).toContain('id: "metric"');
    expect(readFileSync(keep, "utf8")).toBe("customer owned\n");
    expect(readdirSync(join(cwd, "vanillasky")).filter((name) => name.includes(".vanillasky-backup-"))).toHaveLength(2);
  });

  it("compiles the scaffold with strict noUnused Vite React settings", async () => {
    const cwd = project();
    await run(cwd, ["create", "customer-health"]);
    const source = join(cwd, "vanillasky/templates/customer-health.tsx");
    const tsconfig = join(cwd, "tsconfig.json");
    writeFileSync(tsconfig, JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noEmit: true,
        jsx: "react-jsx",
        module: "ESNext",
        moduleResolution: "Bundler",
        skipLibCheck: false,
        baseUrl: cwd,
        paths: { "@vanillaskyai/video/templates": [join(repositoryRoot, "src/templates.ts")] },
      },
      include: [source],
    }));

    execFileSync(process.execPath, [typescriptCli, "-p", tsconfig], {
      cwd,
      stdio: "inherit",
    });
    expect(lstatSync(source).isFile()).toBe(true);
  }, 20_000);
});
