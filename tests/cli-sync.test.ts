import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { syncTemplates } from "../src/cli/sync";

const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function project(): string {
  const cwd = mkdtempSync(join(tmpdir(), "vanillasky-sync-"));
  fixtures.push(cwd);
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ type: "commonjs" }));
  mkdirSync(join(cwd, "vanillasky/templates"), { recursive: true });
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
  const fixtureSchema = join(cwd, "node_modules/fixture-schema");
  mkdirSync(fixtureSchema, { recursive: true });
  writeFileSync(join(fixtureSchema, "package.json"), JSON.stringify({ type: "module", main: "index.js" }));
  writeFileSync(join(fixtureSchema, "index.js"), "export const decorate = (value) => `fixture:${value}`;\n");
  return cwd;
}

function templateSource(id: string, exportName: string): string {
  return [
    'import { defineTemplate } from "@vanillaskyai/video/templates";',
    'import { decorate } from "fixture-schema";',
    `export const ${exportName} = defineTemplate({`,
    `  id: "${id}",`,
    `  useWhen: decorate("Use ${id}"),`,
    '  schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } as const,',
    "  component: () => null,",
    "});",
    "",
  ].join("\n");
}

describe("vanillasky sync", () => {
  it("loads one-file TSX templates and generates deterministic browser and React-free server entrypoints", async () => {
    const cwd = project();
    writeFileSync(join(cwd, "vanillasky/templates/zeta.tsx"), templateSource("zeta", "zetaTemplate"));
    writeFileSync(join(cwd, "vanillasky/templates/alpha.tsx"), templateSource("alpha", "alphaTemplate"));

    await syncTemplates({ cwd });

    const browser = readFileSync(join(cwd, "vanillasky/index.ts"), "utf8");
    expect(browser).toContain('import { createTemplateRegistry } from "@vanillaskyai/video/templates";');
    expect(browser).toContain('import { alphaTemplate as template0 } from "./templates/alpha";');
    expect(browser).toContain('import { zetaTemplate as template1 } from "./templates/zeta";');
    expect(browser.indexOf("alphaTemplate")).toBeLessThan(browser.indexOf("zetaTemplate"));
    expect(browser).toContain("createTemplateRegistry({ definitions })");

    const server = readFileSync(join(cwd, "vanillasky/server.ts"), "utf8");
    expect(server).toContain('import { createServerTemplateRegistry } from "@vanillaskyai/video/server";');
    expect(server).toContain('import type { ServerTemplateMetadata } from "@vanillaskyai/video/server";');
    expect(server).toContain("createServerTemplateRegistry({ templates: templateMetadata })");
    expect(server).not.toContain('@vanillaskyai/video/templates');
    expect(server).toContain('"id": "alpha"');
    expect(server).toContain('"useWhen": "fixture:Use alpha"');
    expect(server).toContain('"schema"');
    expect(server).not.toContain("component");
    expect(server).not.toContain("react");
    expect(server).not.toContain("./templates/");

    await expect(syncTemplates({ cwd, check: true })).resolves.toMatchObject({ changed: false });
  });

  it("reports drift in check mode without changing generated files", async () => {
    const cwd = project();
    writeFileSync(join(cwd, "vanillasky/templates/card.tsx"), templateSource("card", "cardTemplate"));

    await expect(syncTemplates({ cwd, check: true })).rejects.toThrow("vanillasky/index.ts");
    expect(() => readFileSync(join(cwd, "vanillasky/index.ts"))).toThrow();
  });

  it("removes imports for deleted template files", async () => {
    const cwd = project();
    const first = join(cwd, "vanillasky/templates/first.tsx");
    const second = join(cwd, "vanillasky/templates/second.tsx");
    writeFileSync(first, templateSource("first", "firstTemplate"));
    writeFileSync(second, templateSource("second", "secondTemplate"));
    await syncTemplates({ cwd });

    rmSync(second);
    await syncTemplates({ cwd });

    expect(readFileSync(join(cwd, "vanillasky/index.ts"), "utf8")).not.toContain("secondTemplate");
    expect(readFileSync(join(cwd, "vanillasky/server.ts"), "utf8")).not.toContain('"id": "second"');
  });

  it("reloads an edited template during a long-running dev process", async () => {
    const cwd = project();
    const card = join(cwd, "vanillasky/templates/card.tsx");
    writeFileSync(card, templateSource("first", "cardTemplate"));
    await syncTemplates({ cwd });

    writeFileSync(card, templateSource("updated", "cardTemplate"));
    await syncTemplates({ cwd });

    expect(readFileSync(join(cwd, "vanillasky/server.ts"), "utf8")).toContain('"id": "updated"');
  });

  it("cites both source paths for duplicate template IDs", async () => {
    const cwd = project();
    writeFileSync(join(cwd, "vanillasky/templates/first.tsx"), templateSource("same", "firstTemplate"));
    writeFileSync(join(cwd, "vanillasky/templates/second.tsx"), templateSource("same", "secondTemplate"));

    await expect(syncTemplates({ cwd })).rejects.toThrow(/templates\/first\.tsx[\s\S]*templates\/second\.tsx|templates\/second\.tsx[\s\S]*templates\/first\.tsx/);
  });

  it("cites the source path when a template cannot be loaded", async () => {
    const cwd = project();
    writeFileSync(join(cwd, "vanillasky/templates/broken.tsx"), "export const broken = ;\n");

    await expect(syncTemplates({ cwd })).rejects.toThrow(/vanillasky\/templates\/broken\.tsx/);
  });

  it("rejects metadata that JSON serialization would silently discard", async () => {
    const cwd = project();
    writeFileSync(join(cwd, "vanillasky/templates/unsafe.tsx"), [
      'import { defineTemplate } from "@vanillaskyai/video/templates";',
      "export const unsafe = defineTemplate({",
      '  id: "unsafe", useWhen: "Never",',
      '  schema: { type: "object", properties: { title: { type: "string" } } },',
      '  category: () => "not JSON", component: () => null,',
      "});",
    ].join("\n"));

    await expect(syncTemplates({ cwd })).rejects.toThrow(/serializ|undefined/i);
  });

  it("keeps named examples out of the React-free server registry", async () => {
    const cwd = project();
    writeFileSync(join(cwd, "vanillasky/templates/card.tsx"), [
      'import { defineTemplate } from "@vanillaskyai/video/templates";',
      "export const cardTemplate = defineTemplate({",
      '  id: "card", useWhen: "Show a card",',
      '  schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },',
      '  examples: [{ name: "Launch", variables: { title: "Now shipping" } }],',
      "  component: () => null,",
      "});",
    ].join("\n"));

    await syncTemplates({ cwd });

    const server = readFileSync(join(cwd, "vanillasky/server.ts"), "utf8");
    expect(server).not.toContain("examples");
    expect(server).not.toContain("Now shipping");
  });

  it("exposes sync and --check through the installable CLI", async () => {
    const cwd = project();
    writeFileSync(join(cwd, "vanillasky/templates/card.tsx"), templateSource("card", "cardTemplate"));
    const { runVanillaSkyCli } = await import("../src/cli/index");
    const output: string[] = [];

    await expect(runVanillaSkyCli(["sync"], { cwd, write: (line) => output.push(line) })).resolves.toBe(0);
    await expect(runVanillaSkyCli(["sync", "--check"], { cwd, write: (line) => output.push(line) })).resolves.toBe(0);
    expect(output).toEqual([
      "Synced 1 template to vanillasky/index.ts and vanillasky/server.ts.",
      "Template entrypoints are up to date.",
    ]);
  });
});
