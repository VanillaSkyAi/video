import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHANGESETS_CLI_NODE_RANGE,
  changesetsCliSupportsNode,
} from "./helpers/changesets-cli-runtime";

describe("release toolchain", () => {
  it("models the exact Node boundary of the pinned Changesets CLI", () => {
    const changesetsManifest = JSON.parse(readFileSync(
      resolve(import.meta.dirname, "../node_modules/@changesets/cli/package.json"),
      "utf8",
    ));

    expect(changesetsManifest.engines.node).toBe(CHANGESETS_CLI_NODE_RANGE);
    expect(changesetsCliSupportsNode("20.20.2")).toBe(false);
    expect(changesetsCliSupportsNode("22.10.0")).toBe(false);
    expect(changesetsCliSupportsNode("22.11.0")).toBe(true);
    expect(changesetsCliSupportsNode("24.0.0")).toBe(true);
    expect(changesetsCliSupportsNode("25.9.0")).toBe(false);
    expect(changesetsCliSupportsNode("26.0.0")).toBe(true);
  });

  it("exposes one shared exact-version assertion", async () => {
    const module = await import("../scripts/lib/release-toolchain.mjs");

    expect(module).toHaveProperty("assertReleaseToolchain");
    expect(module.assertReleaseToolchain).toBeTypeOf("function");
  });

  it("rejects release commands outside the pinned Node and npm versions", async () => {
    const { assertReleaseToolchain } = await import("../scripts/lib/release-toolchain.mjs");

    expect(assertReleaseToolchain({ nodeVersion: "22.23.1", npmVersion: "11.17.0" })).toEqual({
      node: "22.23.1",
      npm: "11.17.0",
    });
    expect(() => assertReleaseToolchain({ nodeVersion: "24.19.0", npmVersion: "11.17.0" }))
      .toThrow(/Node.*22\.23\.1/);
    expect(() => assertReleaseToolchain({ nodeVersion: "22.23.1", npmVersion: "11.16.0" }))
      .toThrow(/npm.*11\.17\.0/);
  });
});
