import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVanillaSkyCli } from "../src/cli/index";
import { checkTemplates } from "../src/cli/check";
import { syncTemplates } from "../src/cli/sync";

const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function emptyProject(): string {
  const cwd = mkdtempSync(join(tmpdir(), "vanillasky-check-"));
  fixtures.push(cwd);
  mkdirSync(join(cwd, "vanillasky/templates"), { recursive: true });
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ type: "module" }));
  return cwd;
}

function project(source: string): string {
  const cwd = emptyProject();
  const sdk = join(cwd, "node_modules/@vanillaskyai/video");
  mkdirSync(sdk, { recursive: true });
  writeFileSync(join(sdk, "package.json"), JSON.stringify({
    type: "module",
    exports: {
      "./templates": "./templates.js",
      "./server": "./server.js",
    },
  }));
  writeFileSync(join(sdk, "templates.js"), [
    "const metadata = ({ component, examples, ...value }) => value;",
    "export const defineTemplate = (definition) => Object.freeze({",
    '  label: definition.id, description: "", usesGlobalTextEffect: false,',
    "  usesGlobalTransition: false, usesGlobalBackgroundEffect: false,",
    "  ...definition, schema: { ...definition.schema, additionalProperties: definition.schema.additionalProperties ?? false },",
    "});",
    "export const createTemplateRegistry = ({ definitions }) => {",
    "  const values = definitions.map(metadata);",
    "  return { listTemplateMetadata: () => values, capabilities: { templates: values.map(({ id }) => id) } };",
    "};",
  ].join("\n"));
  writeFileSync(join(sdk, "server.js"), [
    "export const createServerTemplateRegistry = ({ templates }) => ({",
    "  listTemplateMetadata: () => templates,",
    "  capabilities: { templates: templates.map(({ id }) => id) },",
    "});",
  ].join("\n"));
  writeFileSync(join(cwd, "vanillasky/templates/card.tsx"), source);
  return cwd;
}

function template(): string {
  return [
    'import { defineTemplate } from "@vanillaskyai/video/templates";',
    "let renders = 0;",
    "export const card = defineTemplate({",
    '  id: "card", label: "Card", useWhen: "Show a concise card.",',
    '  schema: { type: "object", properties: { title: { type: "string", default: "Ready" } }, required: ["title"] },',
    '  examples: [{ name: "Launch", variables: { title: "Now shipping" } }],',
    "  minDuration: 2, preferredDuration: 4,",
    "  component: () => null,",
    "});",
  ].join("\n");
}

describe("vanillasky check", () => {
  it("is exposed by CLI help and reports when a project has no templates", async () => {
    const cwd = emptyProject();
    const help: string[] = [];
    const errors: string[] = [];

    expect(runVanillaSkyCli(["help"], { cwd, write: (line) => help.push(line) })).toBe(0);
    await expect(Promise.resolve(runVanillaSkyCli(["check"], { cwd, write: (line) => errors.push(line) }))).resolves.toBe(1);

    expect(help.join("\n")).toContain("vanillasky check");
    expect(errors).toEqual(["No templates found in vanillasky/templates."]);
  });

  it("checks named examples, generated registry parity, and deterministic orientation renders", async () => {
    const cwd = project(template());
    await syncTemplates({ cwd });
    const output: string[] = [];

    const exit = await Promise.resolve(runVanillaSkyCli(["check"], { cwd, write: (line) => output.push(line) }));

    expect(output).toEqual([
      "Checked 1 template, 1 example, and 12 deterministic renders.",
      "Generated browser/server registries match. Application imports were not inspected.",
    ]);
    expect(exit).toBe(0);
  });

  it("accepts numeric grounded stats and optional empty media sentinels", async () => {
    const source = template().replace(
      '{ type: "string", default: "Ready" }',
      '{ type: "number", format: "grounded-stat", default: 42 }, mediaUrl: { type: "string", format: "uri", default: "" }',
    ).replace(
      '{ title: "Now shipping" }',
      '{ title: 58, mediaUrl: "" }',
    );
    const cwd = project(source);
    await syncTemplates({ cwd });
    const output: string[] = [];

    await expect(Promise.resolve(runVanillaSkyCli(["check"], { cwd, write: (line) => output.push(line) }))).resolves.toBe(0);

    expect(output[0]).toBe("Checked 1 template, 1 example, and 12 deterministic renders.");
  });

  it("accepts declared conditional presence groups", async () => {
    const source = template().replace(
      'required: ["title"] }',
      'required: ["title"], "x-vanillasky": { requiredAnyOf: [["title"]] } }',
    );
    const cwd = project(source);
    await syncTemplates({ cwd });
    const output: string[] = [];

    await expect(Promise.resolve(runVanillaSkyCli(["check"], { cwd, write: (line) => output.push(line) }))).resolves.toBe(0);

    expect(output[0]).toBe("Checked 1 template, 1 example, and 12 deterministic renders.");
  });

  it("rejects explicitly supplied examples that do not satisfy conditional presence", async () => {
    const source = template().replace(
      '{ title: { type: "string", default: "Ready" } }',
      '{ title: { type: "string", default: "Ready" }, cta: { type: "string", default: "" } }',
    ).replace(
      'required: ["title"] }',
      'required: ["title"], "x-vanillasky": { requiredAnyOf: [["cta"]] } }',
    );
    const cwd = project(source);
    await syncTemplates({ cwd });
    const output: string[] = [];

    await expect(Promise.resolve(runVanillaSkyCli(["check"], { cwd, write: (line) => output.push(line) }))).resolves.toBe(1);

    expect(output.join("\n")).toContain('example "Launch" requires a non-empty value for cta');
  });

  it("keeps incomplete property defaults as renderer smoke data instead of committed-scene examples", async () => {
    const source = template().replace(
      '{ title: { type: "string", default: "Ready" } }',
      '{ title: { type: "string", default: "Ready" }, cta: { type: "string", default: "" } }',
    ).replace(
      'required: ["title"] }',
      'required: ["title"], "x-vanillasky": { requiredAnyOf: [["cta"]] } }',
    ).replace(
      '  examples: [{ name: "Launch", variables: { title: "Now shipping" } }],',
      "  // Property defaults exercise rendering; they are not a complete committed scene.",
    );
    const cwd = project(source);
    await syncTemplates({ cwd });
    const output: string[] = [];

    await expect(Promise.resolve(runVanillaSkyCli(["check"], { cwd, write: (line) => output.push(line) }))).resolves.toBe(0);

    expect(output[0]).toBe("Checked 1 template, 1 example, and 12 deterministic renders.");
  });

  it("keeps required media URLs strict when the empty sentinel is used", async () => {
    const source = template().replace(
      '{ type: "string", default: "Ready" }',
      '{ type: "string", format: "uri", default: "" }',
    );
    const cwd = project(source);
    const output: string[] = [];

    await expect(Promise.resolve(runVanillaSkyCli(["check"], { cwd, write: (line) => output.push(line) }))).resolves.toBe(1);

    expect(output.join("\n")).toContain("schema.properties.title.default must be a valid URL");
  });

  it.each([
    [
      "unsupported schema keywords",
      template().replace('{ type: "string", default: "Ready" }', '{ type: "string", pattern: "x" }'),
      "schema.properties.title.pattern is not supported",
    ],
    [
      "unsupported schema formats",
      template().replace('{ type: "string", default: "Ready" }', '{ type: "string", format: "email", default: "Ready" }'),
      "schema.properties.title.format is not supported",
    ],
    [
      "invalid VanillaSky schema extensions",
      template().replace('required: ["title"] }', 'required: ["title"], "x-vanillasky": "invalid" }'),
      "schema.x-vanillasky must be an object",
    ],
    [
      "conditional presence groups with undeclared fields",
      template().replace(
        'required: ["title"] }',
        'required: ["title"], "x-vanillasky": { requiredAnyOf: [["missing"]] } }',
      ),
      'schema.x-vanillasky.requiredAnyOf[0] references undeclared property "missing"',
    ],
    [
      "empty conditional presence groups",
      template().replace(
        'required: ["title"] }',
        'required: ["title"], "x-vanillasky": { requiredAnyOf: [[]] } }',
      ),
      "schema.x-vanillasky.requiredAnyOf[0] must contain at least one property",
    ],
    [
      "invalid defaults",
      template().replace('{ type: "string", default: "Ready" }', '{ type: "string", default: 3 }'),
      "schema.properties.title.default must be string",
    ],
    [
      "invalid URL defaults",
      template().replace('{ type: "string", default: "Ready" }', '{ type: "string", format: "uri", default: "not a URL" }'),
      "schema.properties.title.default must be a valid URL",
    ],
    [
      "invalid named examples",
      template().replace('{ name: "Launch", variables: { title: "Now shipping" } }', '{ name: "Broken", variables: { title: 3 } }'),
      'example "Broken".title must be string',
    ],
    [
      "invalid duration ranges",
      template().replace("minDuration: 2", "minDuration: 5"),
      "minDuration must not exceed preferredDuration",
    ],
    [
      "unknown metadata fields",
      template().replace('label: "Card"', 'label: "Card", internalOnly: true'),
      "metadata.internalOnly is not supported",
    ],
    [
      "invalid metadata field types",
      template().replace('label: "Card"', "label: 3"),
      "label must be string",
    ],
    [
      "null metadata fields",
      template().replace('label: "Card"', "label: null"),
      "label must be string",
    ],
    [
      "falsy invalid metadata collections",
      template().replace('label: "Card"', 'label: "Card", jobs: ""'),
      "jobs contains an unsupported value",
    ],
    [
      "duplicate metadata jobs",
      template().replace('label: "Card"', 'label: "Card", jobs: ["proof", "proof"]'),
      'jobs contains duplicate value "proof"',
    ],
    [
      "unknown manifest families",
      template().replace('label: "Card"', 'label: "Card", family: "Internal grouping"'),
      "family contains an unsupported value",
    ],
    [
      "timing fields that are absent from the schema",
      template().replace("minDuration: 2", 'timing: { contentFields: ["missing"], contentUnit: "words" }, minDuration: 2'),
      'timing.contentFields references undeclared property "missing"',
    ],
    [
      "schema keywords on the wrong property type",
      template().replace('{ type: "string", default: "Ready" }', '{ type: "string", minimum: 1, default: "Ready" }'),
      "schema.properties.title.minimum is only supported for numbers",
    ],
    [
      "invalid nested schema containers",
      template().replace('{ type: "string", default: "Ready" }', '{ type: "object", properties: {}, additionalProperties: "yes", default: {} }'),
      "schema.properties.title.additionalProperties must be boolean",
    ],
    [
      "null schema keyword values",
      template().replace('{ type: "string", default: "Ready" }', '{ type: "string", title: null, default: "Ready" }'),
      "schema.properties.title.title must be string",
    ],
    [
      "null VanillaSky schema extensions",
      template().replace('required: ["title"] }', 'required: ["title"], "x-vanillasky": null }'),
      "schema.x-vanillasky must be an object",
    ],
    [
      "named examples that are not arrays",
      template().replace('[{ name: "Launch", variables: { title: "Now shipping" } }]', '{ name: "Launch", variables: { title: "Now shipping" } }'),
      "examples must be an array",
    ],
    [
      "null named examples",
      template().replace('[{ name: "Launch", variables: { title: "Now shipping" } }]', "null"),
      "examples must be an array",
    ],
    [
      "named examples with non-object variables",
      template().replace('{ name: "Launch", variables: { title: "Now shipping" } }', '{ name: "Launch", variables: null }'),
      'example "Launch" variables must be a plain object',
    ],
  ])("rejects %s", async (_name, source, message) => {
    const cwd = project(source);
    const output: string[] = [];

    await expect(Promise.resolve(runVanillaSkyCli(["check"], { cwd, write: (line) => output.push(line) }))).resolves.toBe(1);

    expect(output.join("\n")).toContain(message);
  });

  it("reports stale generated files without writing them", async () => {
    const cwd = project(template());
    const output: string[] = [];

    await expect(Promise.resolve(runVanillaSkyCli(["check"], { cwd, write: (line) => output.push(line) }))).resolves.toBe(1);

    expect(output.join("\n")).toContain("Generated template files are out of date");
    expect(existsSync(join(cwd, "vanillasky/index.ts"))).toBe(false);
    expect(existsSync(join(cwd, "vanillasky/server.ts"))).toBe(false);
  });

  it("rejects generated browser/server registry fingerprint mismatches", async () => {
    const cwd = project(template());
    await syncTemplates({ cwd });
    const sdkTemplates = join(cwd, "node_modules/@vanillaskyai/video/templates.js");
    writeFileSync(sdkTemplates, readFileSync(sdkTemplates, "utf8").replace(
      "const values = definitions.map(metadata);",
      'const values = definitions.map((definition) => ({ ...metadata(definition), label: "tampered" }));',
    ));
    const output: string[] = [];

    await expect(Promise.resolve(runVanillaSkyCli(["check"], { cwd, write: (line) => output.push(line) }))).resolves.toBe(1);

    expect(output.join("\n")).toContain("browser registry metadata/IDs/order fingerprint differs from template sources");
  });

  it("identifies the orientation when a component render fails", async () => {
    const cwd = project(template().replace(
      "component: () => null",
      'component: ({ width, height }) => { if (width > height) throw new Error("wide failed"); return null; }',
    ));
    await syncTemplates({ cwd });
    const output: string[] = [];

    await expect(Promise.resolve(runVanillaSkyCli(["check"], { cwd, write: (line) => output.push(line) }))).resolves.toBe(1);

    expect(output.join("\n")).toContain('card example "Launch" landscape at progress 0');
    expect(output.join("\n")).toContain("wide failed");
  });

  it("rejects render output that changes for the same inputs", async () => {
    const cwd = project(template().replace(
      "let renders = 0;",
      "const randomValue = Math.random();",
    ).replace("component: () => null", "component: () => String(randomValue)"));
    await syncTemplates({ cwd });
    const output: string[] = [];

    await expect(Promise.resolve(runVanillaSkyCli(["check"], { cwd, write: (line) => output.push(line) }))).resolves.toBe(1);

    expect(output.join("\n")).toContain('card example "Launch" portrait at progress 0 is nondeterministic');
  });

  it("rejects alias exports instead of deduplicating them by object identity", async () => {
    const cwd = project(template().replace(
      "export const card = defineTemplate",
      "const card = defineTemplate",
    ).replace("});", "});\nexport { card, card as cardAlias };"));
    const output: string[] = [];

    await expect(Promise.resolve(runVanillaSkyCli(["check"], { cwd, write: (line) => output.push(line) }))).resolves.toBe(1);

    expect(output.join("\n")).toContain("must export exactly one template created with defineTemplate (found 2)");
  });

  it("times out a template render that blocks forever", async () => {
    const cwd = project(template().replace(
      "component: () => null",
      "component: () => { while (true) {} }",
    ));
    await syncTemplates({ cwd });

    await expect(checkTemplates({ cwd, timeoutMs: 1_000 })).rejects.toThrow(/template rendering timed out after 1000ms/i);
  });

  it("times out template modules that do not finish loading", async () => {
    const cwd = project(`while (true) {}\n${template()}`);

    await expect(checkTemplates({ cwd, timeoutMs: 100 })).rejects.toThrow(/loading timed out after 100ms/i);
  });

  it("removes parent environment values from template rendering", async () => {
    const cwd = project(template().replace(
      "component: () => null",
      'component: () => { if (process.env.VANILLASKY_CHECK_PARENT_SECRET) throw new Error("parent environment leaked"); return null; }',
    ));
    await syncTemplates({ cwd });
    const previous = process.env.VANILLASKY_CHECK_PARENT_SECRET;
    process.env.VANILLASKY_CHECK_PARENT_SECRET = "must-not-reach-customer-code";

    try {
      await expect(checkTemplates({ cwd })).resolves.toMatchObject({ renders: 12 });
    } finally {
      if (previous == null) delete process.env.VANILLASKY_CHECK_PARENT_SECRET;
      else process.env.VANILLASKY_CHECK_PARENT_SECRET = previous;
    }
  });

  it("removes parent environment values from generated registry parity loading", async () => {
    const cwd = project([
      'if (!import.meta.url.includes("?") && process.env.VANILLASKY_PARITY_PARENT_SECRET) {',
      '  throw new Error("parent environment reached registry parity");',
      '}',
      template(),
    ].join("\n"));
    await syncTemplates({ cwd });
    const previous = process.env.VANILLASKY_PARITY_PARENT_SECRET;
    process.env.VANILLASKY_PARITY_PARENT_SECRET = "must-not-reach-customer-code";

    try {
      await expect(checkTemplates({ cwd })).resolves.toMatchObject({ renders: 12 });
    } finally {
      if (previous == null) delete process.env.VANILLASKY_PARITY_PARENT_SECRET;
      else process.env.VANILLASKY_PARITY_PARENT_SECRET = previous;
    }
  });

  it("bounds output produced while rendering customer source", async () => {
    const cwd = project([
      'if (import.meta.url.includes("vanillasky-render")) process.stderr.write("x".repeat(2048));',
      template(),
    ].join("\n"));
    await syncTemplates({ cwd });

    await expect(checkTemplates({ cwd, maxOutputBytes: 1024 })).rejects.toThrow(
      /template rendering output exceeded 1024 bytes/i,
    );
  });

  it("cleans up rendering descendants after a timeout", async () => {
    const cwd = project([
      'import { spawn } from "node:child_process";',
      'import { writeFileSync } from "node:fs";',
      'import { join } from "node:path";',
      'if (import.meta.url.includes("vanillasky-render")) {',
      '  const descendant = spawn(process.execPath, ["-e", "setInterval(() => undefined, 1000)"], { stdio: "ignore" });',
      '  writeFileSync(join(process.cwd(), "render-descendant.pid"), String(descendant.pid));',
      '}',
      template().replace("component: () => null", "component: () => { throw new Promise(() => undefined); }"),
    ].join("\n"));
    await syncTemplates({ cwd });

    await expect(checkTemplates({ cwd, timeoutMs: 1_000 })).rejects.toThrow(/timed out/i);
    const pid = Number(readFileSync(join(cwd, "render-descendant.pid"), "utf8"));
    let alive = true;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        process.kill(pid, 0);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
      } catch {
        alive = false;
        break;
      }
    }
    if (alive) process.kill(pid, "SIGKILL");
    expect(alive).toBe(false);
  });

  it("sanitizes render diagnostics to project-relative paths", async () => {
    const cwd = project(template().replace(
      "component: () => null",
      'component: () => { throw new Error(`private path: ${process.cwd()}/secret.txt`); }',
    ));
    await syncTemplates({ cwd });

    const failure = await checkTemplates({ cwd }).then(
      () => "unexpected success",
      (error: unknown) => error instanceof Error ? error.message : String(error),
    );
    expect(failure).toContain("./secret.txt");
    expect(failure).not.toContain(cwd);
  });
});
