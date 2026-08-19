import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { previewTemplateSync, syncTemplates } from "../src/cli/sync";

const EXPECTED_TEMPLATE_IDS = [
  "media", "reaction", "confetti", "emojiBurst", "bigNumber", "barChart",
  "progressRing", "phoneMockup", "webMockup", "codeEditor", "terminal", "tweet",
  "notification", "chatMessenger", "chatWhatsapp", "milestone", "reviewStack",
  "testimonial", "incomingCall", "brandMessage", "promptInput", "beforeAfter",
  "tripleStats", "problemSolution", "cardList", "steps", "ctaLogo", "ctaMedia",
].sort();

function snapshotTree(root: string): string[] {
  return (readdirSync(root, { recursive: true }) as string[])
    .sort((left, right) => left.localeCompare(right))
    .map((path) => {
      const absolute = join(root, path);
      return statSync(absolute).isDirectory()
        ? `${path}/`
        : `${path}\0${readFileSync(absolute).toString("base64")}`;
    });
}

describe("customer-owned template registry", () => {
  it("describes a template schema as text and JSON", async () => {
    const { runVanillaSkyCli } = await import("../src/cli/index");
    const text: string[] = [];
    expect(runVanillaSkyCli(["describe", "steps"], { write: (line) => text.push(line) })).toBe(0);
    expect(text.join("\n")).toContain("steps — Steps");
    expect(text.join("\n")).toContain("steps\tstring-array[2..3]\trequired");
    expect(text.join("\n")).toContain("stepEmojis\tstring-array[0..3]\toptional");

    const json: string[] = [];
    expect(runVanillaSkyCli(["describe", "beforeAfter", "--json"], { write: (line) => json.push(line) })).toBe(0);
    const described = JSON.parse(json.join("\n"));
    expect(described.id).toBe("beforeAfter");
    expect(described).not.toHaveProperty("type");
    expect(described.schema.required).toContain("problemHeadline");
    expect(described.schema.properties.problemEmojis.type).toBe("array");
  });

  it("installs the same schema and runtime defaults that describe reports", async () => {
    const api = await import("../src/cli/registry");
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-described-schema-"));
    api.addRegistryTemplates({ cwd, names: ["steps", "terminal", "ctaLogo"] });

    const steps = readFileSync(join(cwd, "vanillasky/templates/steps.tsx"), "utf8");
    expect(steps).toContain('"type": "array"');
    expect(steps).toContain('"stepEmojis"');
    const terminal = readFileSync(join(cwd, "vanillasky/templates/terminal.tsx"), "utf8");
    expect(terminal).toContain('"output": {');
    expect(terminal).toContain('"default": []');
    const cta = readFileSync(join(cwd, "vanillasky/templates/ctaLogo.tsx"), "utf8");
    expect(cta).toMatch(/"url": \{[\s\S]*?"default": ""/);

    api.addRegistryTemplates({ cwd, names: ["testimonial", "cardList", "phoneMockup"] });
    const testimonial = readFileSync(join(cwd, "vanillasky/templates/testimonial.tsx"), "utf8");
    expect(testimonial).toContain('"format": "grounded-quote"');
    const cardList = readFileSync(join(cwd, "vanillasky/templates/cardList.tsx"), "utf8");
    expect(cardList).toContain('"minItems": 2');
    expect(cardList).toContain('"maxItems": 3');
    const phone = readFileSync(join(cwd, "vanillasky/templates/phoneMockup.tsx"), "utf8");
    expect(phone).toContain('"format": "supplied-image"');
  });

  it("preserves built-in planner and render metadata in copied template definitions", async () => {
    const { addRegistryTemplates } = await import("../src/cli/registry");
    const { getBuiltinTemplateMetadata } = await import("../src/visual-system/catalog/catalog");
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-template-metadata-"));

    addRegistryTemplates({ cwd, names: ["bigNumber"] });

    const source = readFileSync(join(cwd, "vanillasky/templates/bigNumber.tsx"), "utf8");
    const definitionStart = source.indexOf("export const bigNumberTemplate = defineTemplate({\n")
      + "export const bigNumberTemplate = defineTemplate({\n".length;
    const componentStart = source.indexOf("  component: ChartCounterTemplate,", definitionStart);
    const serializedMetadata = source.slice(definitionStart, componentStart).replace(/,\n$/, "\n");
    const canonical = getBuiltinTemplateMetadata("bigNumber");

    expect(JSON.parse(`{\n${serializedMetadata}}`)).toEqual(canonical);

    const require = createRequire(import.meta.url);
    const nodeModules = join(cwd, "node_modules");
    mkdirSync(nodeModules, { recursive: true });
    symlinkSync(dirname(require.resolve("react/package.json")), join(nodeModules, "react"));
    const sdkPackage = join(nodeModules, "@vanillaskyai/video");
    mkdirSync(sdkPackage, { recursive: true });
    writeFileSync(join(sdkPackage, "package.json"), JSON.stringify({
      type: "module",
      exports: { "./templates": "./templates.js" },
    }));
    writeFileSync(
      join(sdkPackage, "templates.js"),
      `export { defineTemplate } from ${JSON.stringify(pathToFileURL(join(process.cwd(), "src/templates.ts")).href)};\n`,
    );

    await syncTemplates({ cwd });

    const server = readFileSync(join(cwd, "vanillasky/server.ts"), "utf8");
    const syncedMetadata = server.match(/const templateMetadata: ServerTemplateMetadata\[\] = ([\s\S]*);\nexport const templates/)?.[1];
    expect(syncedMetadata).toBeDefined();
    expect(JSON.parse(syncedMetadata!)).toEqual([{
      label: "bigNumber",
      description: "",
      ...canonical,
    }]);
  });

  it("fails clearly when describe receives an unknown template", async () => {
    const { runVanillaSkyCli } = await import("../src/cli/index");
    const output: string[] = [];
    expect(runVanillaSkyCli(["describe", "missing"], { write: (line) => output.push(line) })).toBe(1);
    expect(output).toEqual(["Unknown template: missing. Run `vanillasky list` to see the catalog."]);
  });

  it("lists all templates and installs selected source plus a shared motion kit", async () => {
    let api: typeof import("../src/cli/registry") | undefined;
    try {
      api = await import("../src/cli/registry");
    } catch {
      // Expected red phase before the registry installer exists.
    }
    expect(api, "the source-template registry installer should exist").toBeDefined();
    if (!api) return;

    expect(api.listRegistryTemplates().map(({ id }) => id).sort()).toEqual(EXPECTED_TEMPLATE_IDS);

    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-registry-"));
    const result = api.addRegistryTemplates({ cwd, names: ["bigNumber", "bigNumber"] });

    expect(result.added).toEqual(["bigNumber"]);
    expect(existsSync(join(cwd, "vanillasky/scene-templates/chart-counter.tsx"))).toBe(false);
    const installedTemplate = readFileSync(join(cwd, "vanillasky/templates/bigNumber.tsx"), "utf8");
    expect(installedTemplate).toContain("defineTemplate");
    expect(installedTemplate).toContain("export const ChartCounterTemplate");
    expect(installedTemplate).toContain("component: ChartCounterTemplate");
    expect(installedTemplate).toContain('from "../scene-templates/scene-background"');
    expect(installedTemplate, "installed source should be straightforward to edit").not.toContain("...{");
    expect(existsSync(join(cwd, "vanillasky/emoji/emoji-map.generated.cjs"))).toBe(false);
    expect(existsSync(join(cwd, "vanillasky/emoji/emoji-map.generated.d.cts"))).toBe(false);
    expect(existsSync(join(cwd, "vanillasky/vanillasky.json"))).toBe(false);

    expect(api.addRegistryTemplates({ cwd, names: ["bigNumber"] }).added).toEqual([]);
  });

  it("infers installed templates from source files without registry bookkeeping", async () => {
    const api = await import("../src/cli/registry");
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-inferred-install-"));

    api.addRegistryTemplates({ cwd, names: ["bigNumber", "steps"] });

    expect(api.listInstalledTemplates(cwd)).toEqual(["bigNumber", "steps"]);
    expect(existsSync(join(cwd, "vanillasky/vanillasky.json"))).toBe(false);
    expect(api.addRegistryTemplates({ cwd, names: ["steps"] }).added).toEqual([]);
  });

  it("exposes list and add through the installable vanillasky command", async () => {
    let api: typeof import("../src/cli/index") | undefined;
    try {
      api = await import("../src/cli/index");
    } catch {
      // Expected red phase before the executable command exists.
    }
    expect(api?.runVanillaSkyCli, "the package should expose an executable CLI").toBeTypeOf("function");
    if (!api?.runVanillaSkyCli) return;

    const output: string[] = [];
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-cli-"));
    mkdirSync(join(cwd, "node_modules"));
    symlinkSync(dirname(createRequire(import.meta.url).resolve("react/package.json")), join(cwd, "node_modules/react"));
    const sdkPackage = join(cwd, "node_modules/@vanillaskyai/video");
    mkdirSync(sdkPackage, { recursive: true });
    writeFileSync(join(sdkPackage, "package.json"), JSON.stringify({
      type: "module",
      exports: { "./templates": "./templates.js" },
    }));
    writeFileSync(join(sdkPackage, "templates.js"), [
      "export const defineTemplate = (definition) => ({",
      "  ...definition,",
      "});",
    ].join("\n"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(api.runVanillaSkyCli(["list"], { cwd, write: (line) => output.push(line) })).toBe(0);
    expect(output.join("\n")).toContain("bigNumber");

    const exitCode = await api.runVanillaSkyCli(["add", "notification"], {
      cwd,
      write: (line) => output.push(line),
    });
    expect(exitCode, output.join("\n")).toBe(0);
    expect(readFileSync(join(cwd, "vanillasky/templates/notification.tsx"), "utf8"))
      .toContain("notificationTemplate");
    expect(readFileSync(join(cwd, "vanillasky/index.ts"), "utf8"))
      .toContain("notificationTemplate");
    expect(readFileSync(join(cwd, "vanillasky/server.ts"), "utf8"))
      .toContain('"id": "notification"');
    expect(output.slice(-2)).toEqual([
      "Added notification.",
      "Template source: vanillasky/templates/notification.tsx",
    ]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("keeps support files transitive and removes direct library operations", async () => {
    const api = await import("../src/cli/registry");
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-transitive-support-"));

    expect(api).not.toHaveProperty("listRegistryItems");
    expect(api).not.toHaveProperty("addRegistryItems");
    expect(api).not.toHaveProperty("describeRegistryItem");
    expect(api.listRegistryTemplates()).not.toContainEqual(expect.objectContaining({ type: expect.anything() }));
    expect(api.describeRegistryTemplate("motion")).toBeUndefined();
    expect(() => api.addRegistryTemplates({ cwd, names: ["motion"] }))
      .toThrow("motion is not a template");

    api.addRegistryTemplates({ cwd, names: ["bigNumber"] });
    expect(existsSync(join(cwd, "vanillasky/motion/index.ts"))).toBe(true);
    expect(existsSync(join(cwd, "vanillasky/theme/index.ts"))).toBe(true);
    expect(existsSync(join(cwd, "vanillasky/templates/motion.tsx"))).toBe(false);
  });

  it("compiles copied template ownership sources with strict Vite TypeScript settings", async () => {
    const { addRegistryTemplates } = await import("../src/cli/registry");
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-strict-template-"));
    addRegistryTemplates({ cwd, names: EXPECTED_TEMPLATE_IDS });

    const require = createRequire(import.meta.url);
    const nodeModules = join(cwd, "node_modules");
    mkdirSync(join(nodeModules, "@types"), { recursive: true });
    symlinkSync(dirname(require.resolve("react/package.json")), join(nodeModules, "react"));
    symlinkSync(dirname(require.resolve("@types/react/package.json")), join(nodeModules, "@types/react"));
    symlinkSync(dirname(require.resolve("@types/react-dom/package.json")), join(nodeModules, "@types/react-dom"));
    symlinkSync(dirname(require.resolve("csstype/package.json")), join(nodeModules, "csstype"));
    writeFileSync(join(cwd, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noEmit: true,
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        skipLibCheck: false,
        baseUrl: ".",
        paths: {
          "@vanillaskyai/video/templates": [join(process.cwd(), "src/templates.ts")],
        },
      },
      include: ["vanillasky/**/*.ts", "vanillasky/**/*.tsx"],
    }));

    expect(() => execFileSync(process.execPath, [
      join(dirname(require.resolve("typescript/package.json")), "bin/tsc"),
      "--project", join(cwd, "tsconfig.json"),
    ], { cwd, stdio: "pipe" })).not.toThrow();
  }, 20_000);

  it("keeps the public CLI template-only and rejects removed type options", async () => {
    const api = await import("../src/cli/index");
    const output: string[] = [];
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-template-only-"));

    expect(api.runVanillaSkyCli(["list"], {
      cwd,
      write: (line) => output.push(line),
    })).toBe(0);
    expect(output.join("\n")).toContain("bigNumber");
    expect(output.join("\n")).not.toMatch(/\tmotion\t|\tlib\t/);

    output.length = 0;
    expect(api.runVanillaSkyCli(["list", "--type", "lib"], {
      cwd,
      write: (line) => output.push(line),
    })).toBe(1);
    expect(output).toEqual(["Unknown list option: --type"]);
  });

  it("previews safely and requires explicit overwrite for owned source", async () => {
    const registry = await import("../src/cli/registry");
    const { runVanillaSkyCli } = await import("../src/cli/index");
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-preview-"));
    registry.addRegistryTemplates({ cwd, names: ["bigNumber"] });
    const sourcePath = join(cwd, "vanillasky/templates/bigNumber.tsx");
    const canonical = readFileSync(sourcePath, "utf8");
    const customized = `${canonical}\n// customer customization\n`;
    writeFileSync(sourcePath, customized);

    expect(() => registry.addRegistryTemplates({ cwd, names: ["bigNumber"] }))
      .toThrow("Refusing to overwrite customer-owned file: vanillasky/templates/bigNumber.tsx");

    const dryRunCwd = mkdtempSync(join(tmpdir(), "vanillasky-dry-run-"));
    const dryRunBefore = snapshotTree(dryRunCwd);
    const dryOutput: string[] = [];
    await expect(runVanillaSkyCli(["add", "steps", "--dry-run"], {
      cwd: dryRunCwd,
      write: (line) => dryOutput.push(line),
    })).resolves.toBe(0);
    expect(snapshotTree(dryRunCwd)).toEqual(dryRunBefore);
    expect(existsSync(join(dryRunCwd, "vanillasky"))).toBe(false);
    expect(dryOutput.join("\n")).toContain("Would add steps.");
    expect(dryOutput.join("\n")).toContain("vanillasky/templates/steps.tsx");
    expect(dryOutput.join("\n")).toContain("vanillasky/index.ts");
    expect(dryOutput.join("\n")).toContain("vanillasky/server.ts");

    const diffBefore = snapshotTree(join(cwd, "vanillasky"));
    const diffOutput: string[] = [];
    await expect(runVanillaSkyCli(["add", "bigNumber", "--diff"], {
      cwd,
      write: (line) => diffOutput.push(line),
    })).resolves.toBe(0);
    expect(snapshotTree(join(cwd, "vanillasky"))).toEqual(diffBefore);
    expect(readFileSync(sourcePath, "utf8")).toBe(customized);
    expect(diffOutput.join("\n")).toContain("--- vanillasky/templates/bigNumber.tsx");
    expect(diffOutput.join("\n")).toContain("+++ vanillasky/templates/bigNumber.tsx");
    expect(diffOutput.join("\n")).toContain("-// customer customization");
    expect(diffOutput.join("\n")).toContain("--- vanillasky/index.ts");
    expect(diffOutput.join("\n")).toContain("+++ vanillasky/index.ts");
    expect(diffOutput.join("\n")).toContain("--- vanillasky/server.ts");
    expect(diffOutput.join("\n")).toContain("+++ vanillasky/server.ts");

    const overwrite = registry.addRegistryTemplates({
      cwd,
      names: ["bigNumber"],
      overwrite: true,
    });
    expect(overwrite.updated).toEqual(["bigNumber"]);
    expect(readFileSync(sourcePath, "utf8")).toBe(canonical);
  });

  it("previews the exact bytes written by the subsequent add", async () => {
    const registry = await import("../src/cli/registry");
    const { runVanillaSkyCli } = await import("../src/cli/index");
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-exact-preview-"));
    const require = createRequire(import.meta.url);
    const nodeModules = join(cwd, "node_modules");
    mkdirSync(nodeModules, { recursive: true });
    symlinkSync(dirname(require.resolve("react/package.json")), join(nodeModules, "react"));
    const sdkPackage = join(nodeModules, "@vanillaskyai/video");
    mkdirSync(sdkPackage, { recursive: true });
    writeFileSync(join(sdkPackage, "package.json"), JSON.stringify({
      type: "module",
      exports: { "./templates": "./templates.js" },
    }));
    writeFileSync(join(sdkPackage, "templates.js"), [
      "export const defineTemplate = (definition) => {",
      "  const { schema, ...definitionWithoutSchema } = definition;",
      "  return Object.freeze({",
      "  label: definition.id, description: '', usesGlobalTextEffect: false,",
      "  usesGlobalTransition: false, usesGlobalBackgroundEffect: false,",
      "  ...definitionWithoutSchema, schema: { ...schema, additionalProperties: schema.additionalProperties ?? false },",
      "  });",
      "};",
    ].join("\n"));
    const before = snapshotTree(cwd);
    const planned = registry.addRegistryTemplates({
      cwd,
      names: ["bigNumber"],
      dryRun: true,
    });
    const changes = [
      ...planned.changes,
      ...await previewTemplateSync({ cwd, templates: planned.previewTemplates }),
    ];

    expect(snapshotTree(cwd)).toEqual(before);
    await expect(runVanillaSkyCli(["add", "bigNumber"], { cwd })).resolves.toBe(0);

    for (const change of changes) {
      expect(readFileSync(join(cwd, change.path), "utf8"), change.path).toBe(change.after);
    }
  });

  it("detects every conflict before writing any part of an install", async () => {
    const registry = await import("../src/cli/registry");
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-install-preflight-"));
    registry.addRegistryTemplates({ cwd, names: ["bigNumber"] });
    const supportPath = join(cwd, "vanillasky/theme/index.ts");
    writeFileSync(supportPath, `${readFileSync(supportPath, "utf8")}\n// local support edit\n`);

    expect(() => registry.addRegistryTemplates({ cwd, names: ["steps"] }))
      .toThrow("Refusing to overwrite customer-owned file: vanillasky/theme/index.ts");
    expect(existsSync(join(cwd, "vanillasky/templates/steps.tsx"))).toBe(false);
  });

  it("rejects a symlinked install root before writing outside the project", async () => {
    const { addRegistryTemplates } = await import("../src/cli/registry");
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-symlink-project-"));
    const outside = mkdtempSync(join(tmpdir(), "vanillasky-symlink-outside-"));
    symlinkSync(outside, join(cwd, "vanillasky"), "dir");

    expect(() => addRegistryTemplates({ cwd, names: ["bigNumber"] }))
      .toThrow(/symbolic link|symlink/i);
    expect(readdirSync(outside)).toEqual([]);
  });

  it("atomically replaces an overwritten bundled template", async () => {
    const { addRegistryTemplates } = await import("../src/cli/registry");
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-atomic-install-"));
    addRegistryTemplates({ cwd, names: ["bigNumber"] });
    const target = join(cwd, "vanillasky/templates/bigNumber.tsx");
    const canonical = readFileSync(target, "utf8");
    writeFileSync(target, `${canonical}\n// local edit\n`);
    const inodeBefore = statSync(target).ino;

    addRegistryTemplates({ cwd, names: ["bigNumber"], overwrite: true });

    expect(readFileSync(target, "utf8")).toBe(canonical);
    expect(statSync(target).ino).not.toBe(inodeBefore);
    expect(readdirSync(dirname(target)).some((name) => name.includes(".vanillasky-tmp-"))).toBe(false);
  });

  it("rejects removed remote addresses without fetching or writing", async () => {
    const { runVanillaSkyCli } = await import("../src/cli/index");
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-no-remote-"));
    const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("must not fetch"));
    const addresses = [
      `https://registry.example/template.json#sha256=${"a".repeat(64)}`,
      "owner/repository/template#v1.0.0",
    ];

    for (const address of addresses) {
      const output: string[] = [];
      await expect(runVanillaSkyCli(["add", address], {
        cwd,
        write: (line) => output.push(line),
      })).resolves.toBe(1);
      expect(output.join("\n")).toMatch(/Invalid template|Unknown template/);
    }

    expect(fetcher).not.toHaveBeenCalled();
    expect(existsSync(join(cwd, "vanillasky"))).toBe(false);
    fetcher.mockRestore();
  });

  it("removes terminal control bytes from CLI diagnostics", async () => {
    const { runVanillaSkyCli } = await import("../src/cli/index");
    const output: string[] = [];
    const cwd = mkdtempSync(join(tmpdir(), "vanillasky-safe-diagnostic-"));
    const malicious = "missing\u001b[31m\u0007-template";

    const result = runVanillaSkyCli(["add", malicious], {
      cwd,
      write: (line) => output.push(line),
    });
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe(1);

    const diagnostic = output.join("\n");
    expect([...diagnostic].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 8 || (code >= 11 && code <= 31) || (code >= 127 && code <= 159);
    })).toBe(false);
    expect(diagnostic).toContain("missing[31m-template");
  });

  it("documents preview and overwrite flags without public library vocabulary", async () => {
    const { runVanillaSkyCli } = await import("../src/cli/index");
    const output: string[] = [];
    expect(runVanillaSkyCli(["--help"], { write: (line) => output.push(line) })).toBe(0);
    const help = output.join("\n");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--diff");
    expect(help).toContain("--overwrite");
    expect(help).not.toContain("https-url");
    expect(help).not.toContain("owner/repo");
    expect(help).not.toContain("--type");
    expect(help).not.toMatch(/\blib(?:rary|raries)?\b/i);
  });

});
