import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPublicApiSignatureReport,
  verifyPublicApiSurface,
} from "../scripts/lib/public-api-surface.mjs";

const fixtures: string[] = [];

interface PatchCompatibilityInput {
  baselineVersion: string;
  candidateVersion: string;
  baselineManifest: {
    exports: Record<string, { import: string }>;
    engines: { node: string };
    peerDependencies: Record<string, string>;
    peerDependenciesMeta: Record<string, { optional: boolean }>;
  };
  candidateManifest: {
    exports: Record<string, { import: string }>;
    engines: { node: string };
    peerDependencies: Record<string, string>;
    peerDependenciesMeta: Record<string, { optional: boolean }>;
  };
  baselineSignatures: Record<string, {
    exports: Record<string, { kinds: string[]; declaration: string[] }>;
    support: string[];
  }>;
  candidateSignatures: Record<string, {
    exports: Record<string, { kinds: string[]; declaration: string[] }>;
    support: string[];
  }>;
}

function compatiblePatchInput(): PatchCompatibilityInput {
  const stableSignature = {
    kinds: ["value"],
    declaration: ["export declare function parseVideo(value: unknown): Video;"],
  };
  return {
    baselineVersion: "0.1.0",
    candidateVersion: "0.1.1-beta.0",
    baselineManifest: {
      exports: { ".": { import: "./dist/index.js" } },
      engines: { node: ">=20" },
      peerDependencies: { react: ">=18 <20" },
      peerDependenciesMeta: { react: { optional: true } },
    },
    candidateManifest: {
      exports: {
        ".": { import: "./dist/index.js" },
        "./new-entry": { import: "./dist/new-entry.js" },
      },
      engines: { node: ">=20" },
      peerDependencies: { react: ">=18 <20" },
      peerDependenciesMeta: { react: { optional: true } },
    },
    baselineSignatures: {
      root: { exports: { parseVideo: stableSignature }, support: ["export interface Video {}"] },
    },
    candidateSignatures: {
      root: {
        exports: {
          parseVideo: structuredClone(stableSignature),
          newHelper: { kinds: ["value"], declaration: ["export declare function newHelper(): void;"] },
        },
        support: ["export interface Video {}"],
      },
    },
  };
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("public API surface verifier", () => {
  it("extends the surface verifier with patch compatibility comparison", async () => {
    const module = await import("../scripts/lib/public-api-surface.mjs");

    expect(module).toHaveProperty("assertPatchCompatibility");
    expect(module.assertPatchCompatibility).toBeTypeOf("function");
  });

  it("accepts additive exports in a newer patch candidate", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");

    expect(assertPatchCompatibility(compatiblePatchInput())).toEqual({
      baseline: "0.1.0",
      candidate: "0.1.1-beta.0",
      status: "compatible-patch",
    });
  });

  it("accepts support declarations introduced only for an additive export", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateSignatures.root.support.push("export interface NewHelperOptions { enabled?: boolean; }");

    expect(assertPatchCompatibility(input)).toMatchObject({ status: "compatible-patch" });
  });

  it("conservatively rejects optional fields added to existing signature support", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateSignatures.root.support = ["export interface Video { name?: string; }"];

    expect(() => assertPatchCompatibility(input)).toThrow(/changed public signature support.*root/i);
  });

  it("rejects a public package entry removed from a patch candidate", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.baselineManifest.exports["./server"] = { import: "./dist/server.js" };

    expect(() => assertPatchCompatibility(input)).toThrow(/removed package export.*\.\/server/i);
  });

  it("rejects a changed existing declaration signature in a patch candidate", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateSignatures.root.exports.parseVideo.declaration = [
      "export declare function parseVideo(value: string): Video;",
    ];

    expect(() => assertPatchCompatibility(input)).toThrow(/changed public signature.*root.*parseVideo/i);
  });

  it("rejects a narrowed peer dependency in a patch candidate", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateManifest.peerDependencies.react = ">=19 <20";

    expect(() => assertPatchCompatibility(input)).toThrow(/changed peer dependency.*react/i);
  });

  it("accepts a widened peer dependency in a patch candidate", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateManifest.peerDependencies.react = ">=18 <21";

    expect(assertPatchCompatibility(input)).toMatchObject({ status: "compatible-patch" });
  });

  it("rejects making an optional peer required in a patch candidate", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateManifest.peerDependenciesMeta = {};

    expect(() => assertPatchCompatibility(input)).toThrow(/changed peer dependency metadata.*react/i);
  });

  it("rejects a new required peer dependency in a patch candidate", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateManifest.peerDependencies.requiredRuntime = ">=1";

    expect(() => assertPatchCompatibility(input)).toThrow(/new required peer dependency.*requiredRuntime/i);
  });

  it("accepts a new optional peer dependency in a patch candidate", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateManifest.peerDependencies.optionalCompiler = ">=1";
    input.candidateManifest.peerDependenciesMeta.optionalCompiler = { optional: true };

    expect(assertPatchCompatibility(input)).toMatchObject({ status: "compatible-patch" });
  });

  it("rejects a narrowed Node engine in a patch candidate", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateManifest.engines.node = ">=22";

    expect(() => assertPatchCompatibility(input)).toThrow(/narrowed Node engine.*>=20.*>=22/i);
  });

  it("accepts a compatible pre-1.0 minor without migration evidence", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateVersion = "0.2.0";

    expect(assertPatchCompatibility(input)).toEqual({
      baseline: "0.1.0",
      candidate: "0.2.0",
      status: "compatible-minor",
    });
  });

  it("rejects an undocumented breaking pre-1.0 minor", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateVersion = "0.2.0";
    input.candidateManifest.exports = {};

    expect(() => assertPatchCompatibility(input)).toThrow(/breaking.*pre-1\.0 minor.*evidence/i);
  });

  it("accepts a documented breaking pre-1.0 minor", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateVersion = "0.2.0";
    input.candidateManifest.exports = {};

    expect(assertPatchCompatibility({
      ...input,
      releaseIntent: {
        releaseType: "minor",
        evidence: [{
          source: "CHANGELOG.md#0.2.0",
          body: [
            "### Breaking changes",
            "Replace the removed root entry with the scoped entry:",
            "```ts",
            "import { parseVideo } from '@vanillaskyai/video';",
            "```",
            "### Adoption",
            "Adopt the replacement entry:",
            "```ts",
            "import { parseVideo } from '@vanillaskyai/video/server';",
            "```",
          ].join("\n"),
        }],
      },
    })).toMatchObject({
      status: "documented-breaking-minor",
      evidence: "CHANGELOG.md#0.2.0",
    });
  });

  it("accepts a documented future minor while a feature PR retains npm latest version", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateVersion = input.baselineVersion;
    input.candidateManifest.exports = {};

    expect(assertPatchCompatibility({
      ...input,
      releaseIntent: {
        releaseType: "minor",
        evidence: [{
          source: ".changeset/remove-root.md",
          body: [
            "### Breaking changes",
            "Before:",
            "```ts",
            "import { parseVideo } from '@vanillaskyai/video';",
            "```",
            "### Adoption",
            "After:",
            "```ts",
            "import { parseVideo } from '@vanillaskyai/video/server';",
            "```",
          ].join("\n"),
        }],
      },
    })).toMatchObject({ status: "documented-breaking-minor" });
  });

  it("does not let patch release intent authorize a breaking change", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateManifest.exports = {};

    expect(() => assertPatchCompatibility({
      ...input,
      releaseIntent: {
        releaseType: "patch",
        evidence: [{
          source: ".changeset/breaking-patch.md",
          body: "### Breaking changes\n```ts\nbefore()\n```\n### Adoption\n```ts\nafter()\n```",
        }],
      },
    })).toThrow(/patch candidate.*removed package export/i);
  });

  it("requires concrete fenced before and after examples for a breaking minor", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateVersion = "0.2.0";
    input.candidateManifest.exports = {};

    expect(() => assertPatchCompatibility({
      ...input,
      releaseIntent: {
        releaseType: "minor",
        evidence: [{
          source: "CHANGELOG.md#0.2.0",
          body: "### Breaking changes\nDescribe the old API.\n### Adoption\nDescribe the new API.",
        }],
      },
    })).toThrow(/Breaking changes.*fenced.*Adoption.*fenced/is);
  });

  it("preserves the patch exception for experimental exports", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.baselineSignatures.root.exports.experimental_preview = {
      kinds: ["value"],
      declaration: ["export declare function experimental_preview(): string;"],
    };

    expect(assertPatchCompatibility(input)).toMatchObject({ status: "compatible-patch" });
  });

  it("still compares the published contract when the candidate is already npm latest", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateVersion = input.baselineVersion;
    input.candidateManifest.exports = {};

    expect(() => assertPatchCompatibility(input)).toThrow(/removed package export/i);
  });

  it("labels an unchanged published contract as the current version", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.candidateVersion = input.baselineVersion;

    expect(assertPatchCompatibility(input)).toEqual({
      baseline: "0.1.0",
      candidate: "0.1.0",
      status: "current-version",
    });
  });

  it("rejects a candidate older than npm latest", async () => {
    const { assertPatchCompatibility } = await import("../scripts/lib/public-api-surface.mjs");
    const input = compatiblePatchInput();
    input.baselineVersion = "0.1.1";
    input.candidateVersion = "0.1.0";

    expect(() => assertPatchCompatibility(input)).toThrow(/candidate.*newer.*npm latest/i);
  });

  it("rejects a browser entry that hides Node usage behind an external dependency", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanillasky-api-surface-"));
    fixtures.push(root);
    mkdirSync(join(root, "dist"), { recursive: true });
    mkdirSync(join(root, "node_modules", "fixture-node-wrapper"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(root, "dist", "index.d.ts"), "export declare const value: boolean;\n");
    writeFileSync(
      join(root, "dist", "index.js"),
      'export { dependency as value } from "fixture-node-wrapper";\n',
    );
    writeFileSync(
      join(root, "node_modules", "fixture-node-wrapper", "package.json"),
      JSON.stringify({ name: "fixture-node-wrapper", type: "module", exports: "./index.js" }),
    );
    writeFileSync(
      join(root, "node_modules", "fixture-node-wrapper", "index.js"),
      'import "node:fs"; export const dependency = true;\n',
    );
    const manifestPath = join(root, "surface.json");
    writeFileSync(manifestPath, JSON.stringify({
      fixture: {
        declaration: "dist/index.d.ts",
        runtime: "dist/index.js",
        environment: "browser",
        runtimeExports: ["value"],
        typeExports: [],
      },
    }));

    await expect(verifyPublicApiSurface({ packageRoot: root, manifestPath }))
      .rejects.toThrow(/fixture-node-wrapper/);
  });

  it.each([
    ["template-literal Node import", 'export const value = () => import(`node:fs`);\n', /node:fs/],
    ["computed dynamic import", 'const target = "./local.js"; export const value = () => import(target);\n', /non-literal dynamic import/],
  ])("rejects a browser entry with a %s", async (_name, runtime, message) => {
    const root = mkdtempSync(join(tmpdir(), "vanillasky-api-dynamic-"));
    fixtures.push(root);
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(root, "dist", "index.d.ts"), "export declare const value: () => Promise<unknown>;\n");
    writeFileSync(join(root, "dist", "index.js"), runtime);
    writeFileSync(join(root, "dist", "local.js"), "export {};\n");
    const manifestPath = join(root, "surface.json");
    writeFileSync(manifestPath, JSON.stringify({
      fixture: {
        declaration: "dist/index.d.ts",
        runtime: "dist/index.js",
        environment: "browser",
        runtimeExports: ["value"],
        typeExports: [],
      },
    }));

    await expect(verifyPublicApiSurface({ packageRoot: root, manifestPath }))
      .rejects.toThrow(message);
  });

  it("rejects React types crossing into the server declaration graph", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanillasky-api-types-"));
    fixtures.push(root);
    mkdirSync(join(root, "dist"), { recursive: true });
    mkdirSync(join(root, "node_modules", "react"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(root, "dist", "server.js"), "export {};\n");
    writeFileSync(
      join(root, "dist", "server.d.ts"),
      'import type { ReactNode } from "react"; export interface Value { node: ReactNode }\n',
    );
    writeFileSync(
      join(root, "node_modules", "react", "package.json"),
      JSON.stringify({ name: "react", version: "0.0.0", types: "./index.d.ts" }),
    );
    writeFileSync(
      join(root, "node_modules", "react", "index.d.ts"),
      "export type ReactNode = string | number | null;\n",
    );
    const manifestPath = join(root, "surface.json");
    writeFileSync(manifestPath, JSON.stringify({
      fixture: {
        declaration: "dist/server.d.ts",
        runtime: "dist/server.js",
        environment: "server",
        runtimeExports: [],
        typeExports: ["Value"],
      },
    }));

    await expect(verifyPublicApiSurface({ packageRoot: root, manifestPath }))
      .rejects.toThrow(/React.*declaration|declaration.*React/i);
  });

  it("rejects a React type reference directive in the server declaration graph", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanillasky-api-type-reference-"));
    fixtures.push(root);
    mkdirSync(join(root, "dist"), { recursive: true });
    mkdirSync(join(root, "node_modules", "react"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(root, "dist", "server.js"), "export {};\n");
    writeFileSync(
      join(root, "dist", "server.d.ts"),
      '/// <reference types="react" />\nexport interface Value { ok: true }\n',
    );
    writeFileSync(
      join(root, "node_modules", "react", "package.json"),
      JSON.stringify({ name: "react", version: "0.0.0", types: "./index.d.ts" }),
    );
    writeFileSync(join(root, "node_modules", "react", "index.d.ts"), "export {};\n");
    const manifestPath = join(root, "surface.json");
    writeFileSync(manifestPath, JSON.stringify({
      fixture: {
        declaration: "dist/server.d.ts",
        runtime: "dist/server.js",
        environment: "server",
        runtimeExports: [],
        typeExports: ["Value"],
      },
    }));

    await expect(verifyPublicApiSurface({ packageRoot: root, manifestPath }))
      .rejects.toThrow(/React.*declaration|declaration.*React/i);
  });

  it.each([
    [
      "relative import",
      'import type { ReactNode } from "../../react/index.js"; export interface Value { node: ReactNode }\n',
    ],
    [
      "triple-slash path",
      '/// <reference path="../../react/index.d.ts" />\nexport interface Value { ok: true }\n',
    ],
  ])("rejects a declaration %s that escapes the package", async (_name, declaration) => {
    const consumer = mkdtempSync(join(tmpdir(), "vanillasky-api-relative-"));
    fixtures.push(consumer);
    const root = join(consumer, "node_modules", "fixture-package");
    mkdirSync(join(root, "dist"), { recursive: true });
    mkdirSync(join(consumer, "node_modules", "react"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(root, "dist", "server.js"), "export {};\n");
    writeFileSync(join(root, "dist", "server.d.ts"), declaration);
    writeFileSync(join(consumer, "node_modules", "react", "index.d.ts"), "export type ReactNode = string;\n");
    const manifestPath = join(root, "surface.json");
    writeFileSync(manifestPath, JSON.stringify({
      fixture: {
        declaration: "dist/server.d.ts",
        runtime: "dist/server.js",
        environment: "server",
        runtimeExports: [],
        typeExports: ["Value"],
      },
    }));

    await expect(verifyPublicApiSurface({ packageRoot: root, manifestPath }))
      .rejects.toThrow(/declaration.*escaped the package/i);
  });

  it("rejects a relative declaration import into a package-local node_modules subtree", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanillasky-api-nested-dependency-"));
    fixtures.push(root);
    mkdirSync(join(root, "dist"), { recursive: true });
    mkdirSync(join(root, "node_modules", "react"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(root, "dist", "server.js"), "export {};\n");
    writeFileSync(
      join(root, "dist", "server.d.ts"),
      'import type { ReactNode } from "../node_modules/react/index.js"; export interface Value { node: ReactNode }\n',
    );
    writeFileSync(join(root, "node_modules", "react", "index.d.ts"), "export type ReactNode = string;\n");
    const manifestPath = join(root, "surface.json");
    writeFileSync(manifestPath, JSON.stringify({
      fixture: {
        declaration: "dist/server.d.ts",
        runtime: "dist/server.js",
        environment: "server",
        runtimeExports: [],
        typeExports: ["Value"],
      },
    }));

    await expect(verifyPublicApiSurface({ packageRoot: root, manifestPath }))
      .rejects.toThrow(/declaration.*escaped the package/i);
  });

  it("rejects a package-local declaration symlink that resolves outside the package", async () => {
    const consumer = mkdtempSync(join(tmpdir(), "vanillasky-api-symlink-"));
    fixtures.push(consumer);
    const root = join(consumer, "package");
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(root, "dist", "server.js"), "export {};\n");
    writeFileSync(join(consumer, "outside.d.ts"), "export type Outside = string;\n");
    symlinkSync(join(consumer, "outside.d.ts"), join(root, "dist", "escape.d.ts"));
    writeFileSync(
      join(root, "dist", "server.d.ts"),
      'import type { Outside } from "./escape.js"; export interface Value { outside: Outside }\n',
    );
    const manifestPath = join(root, "surface.json");
    writeFileSync(manifestPath, JSON.stringify({
      fixture: {
        declaration: "dist/server.d.ts",
        runtime: "dist/server.js",
        environment: "server",
        runtimeExports: [],
        typeExports: ["Value"],
      },
    }));

    await expect(verifyPublicApiSurface({ packageRoot: root, manifestPath }))
      .rejects.toThrow(/declaration.*escaped the package/i);
  });

  it("rejects a changed public signature even when the export name is unchanged", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanillasky-api-signature-"));
    fixtures.push(root);
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(root, "dist", "index.js"), "export const value = true;\n");
    writeFileSync(join(root, "dist", "index.d.ts"), "export declare const value: (input: string) => boolean;\n");
    const manifestPath = join(root, "surface.json");
    writeFileSync(manifestPath, JSON.stringify({
      fixture: {
        declaration: "dist/index.d.ts",
        runtime: "dist/index.js",
        environment: "universal",
        runtimeExports: ["value"],
        typeExports: [],
      },
    }));
    const signaturePath = join(root, "signatures.json");
    const signatures = createPublicApiSignatureReport({ packageRoot: root, manifestPath });
    writeFileSync(signaturePath, `${JSON.stringify(signatures, null, 2)}\n`);
    await expect(verifyPublicApiSurface({ packageRoot: root, manifestPath, signaturePath })).resolves.toBeDefined();

    writeFileSync(join(root, "dist", "index.d.ts"), "export declare const value: (input: number) => boolean;\n");
    await expect(verifyPublicApiSurface({ packageRoot: root, manifestPath, signaturePath }))
      .rejects.toThrow(/signature report/i);
  });
});
