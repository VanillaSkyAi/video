import { describe, expect, it } from "vitest";

describe("release toolchain", () => {
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
