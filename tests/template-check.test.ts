import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  checkTemplateIntegrity,
  formatTemplateCheckReport,
  type TemplateCheckSurfaces,
} from "../scripts/template-check";

const metadata = {
  id: "bigNumber",
  label: "Big number",
  description: "A number.",
  family: "Data & metrics",
  jobs: ["proof"],
  register: "typography-led",
  useWhen: "One number matters.",
  avoidWhen: "Several numbers matter.",
  usesGlobalTextEffect: false,
  usesGlobalTransition: true,
  transitionTiming: { entryReadyProgress: 0.2, holdProgress: 0.7 },
  usesGlobalBackgroundEffect: true,
  textCanvas: "tight",
  minDuration: 1,
  preferredDuration: 3,
  timing: { contentFields: ["value"], contentUnit: "words" },
  schema: {
    type: "object",
    properties: { value: { type: "number", default: 42 } },
    required: ["value"],
    additionalProperties: false,
  },
};

function fixtureRoot(
  registryMetadata: Record<string, unknown> & {
    id: string;
    label: string;
    description: string;
  } = metadata,
): string {
  const root = mkdtempSync(join(tmpdir(), "vanillasky-template-check-"));
  mkdirSync(join(root, "registry/items"), { recursive: true });
  const { id, ...withoutId } = registryMetadata;
  writeFileSync(join(root, `registry/items/${id}.json`), `${JSON.stringify({
    name: id,
    title: registryMetadata.label,
    description: registryMetadata.description,
    files: [{ path: "src/visual-system/scene-templates/chart-counter.tsx" }],
    meta: { vanillasky: { layer: "template", tier: "free", ...withoutId } },
  }, null, 2)}\n`);
  return root;
}

function completeSurfaces(): TemplateCheckSurfaces {
  return {
    manifest: [metadata],
    schemas: { bigNumber: metadata.schema },
    sourceTemplates: [{ ...metadata, component: () => null }],
    generatedCatalog: [metadata],
    generatedLoaders: { bigNumber: async () => ({ default: () => null }) },
    promptIds: ["bigNumber"],
  };
}

describe("template integrity checker", () => {
  it("is exposed through the documented npm command", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.scripts["template:check"]).toBe("tsx scripts/template-check.ts");
  });

  it("passes a complete existing built-in", async () => {
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(),
      ids: ["bigNumber"],
      surfaces: completeSurfaces(),
      artifactCheck: async () => ({ ok: true, output: "Registry check passed." }),
    });

    expect(result.ok).toBe(true);
    expect(result.checkedIds).toEqual(["bigNumber"]);
    expect(result.issues).toEqual([]);
    expect(formatTemplateCheckReport(result)).toContain("bigNumber: complete");
  });

  it("reports every missing integration point with actionable paths", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanillasky-template-check-"));
    const result = await checkTemplateIntegrity({
      root,
      ids: ["newTemplate"],
      surfaces: {
        manifest: [],
        schemas: {},
        sourceTemplates: [],
        generatedCatalog: [],
        generatedLoaders: {},
        promptIds: [],
      },
      artifactCheck: async () => ({ ok: false, output: "Built-in catalog drifted" }),
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "manifest-missing",
      "schema-missing",
      "source-registry-missing",
      "generated-catalog-missing",
      "generated-loader-missing",
      "registry-item-missing",
      "prompt-missing",
      "generated-artifacts-stale",
    ]));
    const report = formatTemplateCheckReport(result);
    expect(report).toContain("src/visual-system/catalog/builtin-manifest.ts");
    expect(report).toContain("src/visual-system/scene-templates/schemas.ts");
    expect(report).toContain("src/visual-system/scene-templates/registry.ts");
    expect(report).toContain("scripts/generate-builtin-catalog.ts");
    expect(report).toContain("registry/items/newTemplate.json");
    expect(report).toContain("npm run registry:sync");
  });

  it("rejects a malformed camelCase ID without hiding other failures", async () => {
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(),
      ids: ["Not-valid"],
      surfaces: completeSurfaces(),
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(result.issues.some(({ code }) => code === "invalid-id")).toBe(true);
    expect(result.issues.some(({ code }) => code === "manifest-missing")).toBe(true);
  });

  it("detects required fields without defaults", async () => {
    const surfaces = completeSurfaces();
    surfaces.schemas.bigNumber = {
      ...metadata.schema,
      properties: { value: { type: "number" } },
    };
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(),
      ids: ["bigNumber"],
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "required-default-missing",
      id: "bigNumber",
    }));
  });

  it("detects generated and registry metadata drift", async () => {
    const surfaces = completeSurfaces();
    surfaces.generatedCatalog = [{ ...metadata, label: "Stale number" }];
    const root = fixtureRoot({ ...metadata, preferredDuration: 2 });
    const result = await checkTemplateIntegrity({
      root,
      ids: ["bigNumber"],
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "generated-metadata-mismatch",
      "registry-metadata-mismatch",
    ]));
  });

  it("treats absent and undefined optional metadata as the same JSON contract", async () => {
    const manifestMetadata = { ...metadata, usesGlobalTransition: false, transitionTiming: undefined };
    const generatedMetadata = JSON.parse(JSON.stringify(manifestMetadata));
    const surfaces = completeSurfaces();
    surfaces.manifest = [manifestMetadata];
    surfaces.generatedCatalog = [generatedMetadata];
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(manifestMetadata),
      ids: ["bigNumber"],
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(result.issues).not.toContainEqual(expect.objectContaining({
      code: "generated-metadata-mismatch",
    }));
    expect(result.issues).not.toContainEqual(expect.objectContaining({
      code: "registry-metadata-mismatch",
    }));
    expect(result.ok).toBe(true);
  });

  it("still rejects transition timing value drift after undefined stripping", async () => {
    const staleTiming = {
      ...metadata,
      transitionTiming: { ...metadata.transitionTiming, holdProgress: 0.6 },
    };
    const surfaces = completeSurfaces();
    surfaces.generatedCatalog = [staleTiming];
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(staleTiming),
      ids: ["bigNumber"],
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "generated-metadata-mismatch",
      "registry-metadata-mismatch",
    ]));
  });

  it.each([
    ["NaN and null", NaN, null],
    ["array undefined and null", [undefined], [null]],
    ["a function and absence", () => "value", undefined],
    ["a symbol and absence", Symbol("value"), undefined],
  ])("does not collapse %s", async (_label, manifestValue, generatedValue) => {
    const manifestMetadata = { ...metadata, comparisonProbe: manifestValue };
    const generatedMetadata = generatedValue === undefined
      ? { ...metadata }
      : { ...metadata, comparisonProbe: generatedValue };
    const surfaces = completeSurfaces();
    surfaces.manifest = [manifestMetadata];
    surfaces.generatedCatalog = [generatedMetadata];
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(manifestMetadata),
      ids: ["bigNumber"],
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "generated-metadata-mismatch",
      "registry-metadata-mismatch",
    ]));
  });

  it("does not compare a nonstandard array prototype as an ordinary array", async () => {
    class SpecialArray<T> extends Array<T> {}

    const manifestMetadata = {
      ...metadata,
      comparisonProbe: new SpecialArray("value"),
    };
    const generatedMetadata = {
      ...metadata,
      comparisonProbe: ["value"],
    };
    const surfaces = completeSurfaces();
    surfaces.manifest = [manifestMetadata];
    surfaces.generatedCatalog = [generatedMetadata];
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(manifestMetadata),
      ids: ["bigNumber"],
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "generated-metadata-mismatch",
      id: "bigNumber",
    }));
  });

  it("treats distinct class instances as opaque without invoking enumerable getters", async () => {
    let getterCalls = 0;
    class SpecialMetadataValue {
      constructor() {
        Object.defineProperty(this, "value", {
          enumerable: true,
          get() {
            getterCalls += 1;
            return "same-value";
          },
        });
      }
    }

    const manifestMetadata = {
      ...metadata,
      comparisonProbe: new SpecialMetadataValue(),
    };
    const generatedMetadata = {
      ...metadata,
      comparisonProbe: new SpecialMetadataValue(),
    };
    const surfaces = completeSurfaces();
    surfaces.manifest = [manifestMetadata];
    surfaces.generatedCatalog = [generatedMetadata];
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(),
      ids: ["bigNumber"],
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(getterCalls).toBe(0);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "generated-metadata-mismatch",
      id: "bigNumber",
    }));
  });

  it("keeps the same opaque class instance stable without invoking its getter", async () => {
    let getterCalls = 0;
    class SpecialMetadataValue {
      constructor() {
        Object.defineProperty(this, "value", {
          enumerable: true,
          get() {
            getterCalls += 1;
            return "same-value";
          },
        });
      }
    }

    const comparisonProbe = new SpecialMetadataValue();
    const manifestMetadata = { ...metadata, comparisonProbe };
    const generatedMetadata = { ...metadata, comparisonProbe };
    const surfaces = completeSurfaces();
    surfaces.manifest = [manifestMetadata];
    surfaces.generatedCatalog = [generatedMetadata];
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(),
      ids: ["bigNumber"],
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(getterCalls).toBe(0);
    expect(result.issues).not.toContainEqual(expect.objectContaining({
      code: "generated-metadata-mismatch",
    }));
  });

  it("compares accessor metadata without invoking the getter", async () => {
    let getterCalls = 0;
    const getter = () => {
      getterCalls += 1;
      return "value";
    };
    const manifestMetadata = { ...metadata } as typeof metadata & { comparisonProbe?: string };
    const generatedMetadata = { ...metadata } as typeof metadata & { comparisonProbe?: string };
    Object.defineProperty(manifestMetadata, "comparisonProbe", { enumerable: true, get: getter });
    Object.defineProperty(generatedMetadata, "comparisonProbe", { enumerable: true, get: getter });
    const surfaces = completeSurfaces();
    surfaces.manifest = [manifestMetadata];
    surfaces.generatedCatalog = [generatedMetadata];
    await checkTemplateIntegrity({
      root: fixtureRoot(),
      ids: ["bigNumber"],
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(getterCalls).toBe(0);
  });

  it("does not enumerate trusted metadata proxies during comparison", async () => {
    let ownKeyCalls = 0;
    const proxiedMetadata = new Proxy({ ...metadata }, {
      ownKeys(target) {
        ownKeyCalls += 1;
        return Reflect.ownKeys(target);
      },
    });
    const surfaces = completeSurfaces();
    surfaces.manifest = [proxiedMetadata];
    surfaces.generatedCatalog = [proxiedMetadata];
    await checkTemplateIntegrity({
      root: fixtureRoot(),
      ids: ["bigNumber"],
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(ownKeyCalls).toBe(0);
  });

  it("rejects a top-level metadata proxy without executing any proxy trap", async () => {
    const trapCalls = { get: 0, ownKeys: 0, getPrototypeOf: 0 };
    const proxiedMetadata = new Proxy({ ...metadata }, {
      get() {
        trapCalls.get += 1;
        throw new Error("top-level metadata proxy get trap executed");
      },
      ownKeys() {
        trapCalls.ownKeys += 1;
        throw new Error("top-level metadata proxy ownKeys trap executed");
      },
      getPrototypeOf() {
        trapCalls.getPrototypeOf += 1;
        throw new Error("top-level metadata proxy getPrototypeOf trap executed");
      },
    });
    const surfaces = completeSurfaces();
    surfaces.manifest = [proxiedMetadata];
    surfaces.generatedCatalog = [metadata];
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(),
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "manifest-metadata-unsupported",
    }));
    expect(trapCalls).toEqual({ get: 0, ownKeys: 0, getPrototypeOf: 0 });
  });

  it("rejects a proxied metadata collection before reading its length or entries", async () => {
    const trapCalls = { get: 0, ownKeys: 0, getPrototypeOf: 0 };
    const proxiedManifest = new Proxy([metadata], {
      get() {
        trapCalls.get += 1;
        throw new Error("metadata collection proxy get trap executed");
      },
      ownKeys() {
        trapCalls.ownKeys += 1;
        throw new Error("metadata collection proxy ownKeys trap executed");
      },
      getPrototypeOf() {
        trapCalls.getPrototypeOf += 1;
        throw new Error("metadata collection proxy getPrototypeOf trap executed");
      },
    });
    const surfaces = completeSurfaces();
    surfaces.manifest = proxiedManifest;
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(),
      ids: ["bigNumber"],
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "manifest-metadata-unsupported",
    }));
    expect(trapCalls).toEqual({ get: 0, ownKeys: 0, getPrototypeOf: 0 });
  });

  it("rejects an accessor-backed metadata collection entry without invoking its getter", async () => {
    let getterCalls = 0;
    const manifestEntries = [metadata];
    Object.defineProperty(manifestEntries, 0, {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        return metadata;
      },
    });
    const surfaces = completeSurfaces();
    surfaces.manifest = manifestEntries;
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(),
      ids: ["bigNumber"],
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "manifest-metadata-unsupported",
    }));
    expect(getterCalls).toBe(0);
  });

  it("rejects a shared nested metadata proxy without executing any proxy trap", async () => {
    const trapCalls = { get: 0, ownKeys: 0, getPrototypeOf: 0 };
    const comparisonProbe = new Proxy({ value: "same-value" }, {
      get() {
        trapCalls.get += 1;
        throw new Error("nested metadata proxy get trap executed");
      },
      ownKeys() {
        trapCalls.ownKeys += 1;
        throw new Error("nested metadata proxy ownKeys trap executed");
      },
      getPrototypeOf() {
        trapCalls.getPrototypeOf += 1;
        throw new Error("nested metadata proxy getPrototypeOf trap executed");
      },
    });
    const manifestMetadata = { ...metadata, comparisonProbe };
    const generatedMetadata = { ...metadata, comparisonProbe };
    const surfaces = completeSurfaces();
    surfaces.manifest = [manifestMetadata];
    surfaces.generatedCatalog = [generatedMetadata];
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(),
      ids: ["bigNumber"],
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "generated-metadata-mismatch",
      id: "bigNumber",
    }));
    expect(trapCalls).toEqual({ get: 0, ownKeys: 0, getPrototypeOf: 0 });
  });

  it("rejects a shared nested callable proxy without executing any proxy trap", async () => {
    const trapCalls = { apply: 0, get: 0, ownKeys: 0, getPrototypeOf: 0 };
    const comparisonProbe = new Proxy(() => "same-value", {
      apply() {
        trapCalls.apply += 1;
        throw new Error("nested callable proxy apply trap executed");
      },
      get() {
        trapCalls.get += 1;
        throw new Error("nested callable proxy get trap executed");
      },
      ownKeys() {
        trapCalls.ownKeys += 1;
        throw new Error("nested callable proxy ownKeys trap executed");
      },
      getPrototypeOf() {
        trapCalls.getPrototypeOf += 1;
        throw new Error("nested callable proxy getPrototypeOf trap executed");
      },
    });
    const manifestMetadata = { ...metadata, comparisonProbe };
    const generatedMetadata = { ...metadata, comparisonProbe };
    const surfaces = completeSurfaces();
    surfaces.manifest = [manifestMetadata];
    surfaces.generatedCatalog = [generatedMetadata];
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(),
      ids: ["bigNumber"],
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "generated-metadata-mismatch",
      id: "bigNumber",
    }));
    expect(trapCalls).toEqual({ apply: 0, get: 0, ownKeys: 0, getPrototypeOf: 0 });
  });

  it("checks all manifest IDs when no ID is supplied", async () => {
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(),
      surfaces: completeSurfaces(),
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(result.checkedIds).toEqual(["bigNumber"]);
    expect(result.ok).toBe(true);
  });

  it("reports a loader that exists but cannot load a renderer", async () => {
    const surfaces = completeSurfaces();
    surfaces.generatedLoaders.bigNumber = async () => {
      throw new Error("missing module");
    };
    const result = await checkTemplateIntegrity({
      root: fixtureRoot(),
      ids: ["bigNumber"],
      surfaces,
      artifactCheck: async () => ({ ok: true, output: "ok" }),
    });

    expect(result.issues).toContainEqual(expect.objectContaining({ code: "renderer-load-failed" }));
  });
});
