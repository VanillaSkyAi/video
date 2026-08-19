import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPublicApiSignatureReport,
  verifyPublicApiSurface,
} from "../scripts/lib/public-api-surface.mjs";

const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("public API surface verifier", () => {
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
