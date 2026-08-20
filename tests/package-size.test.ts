import { describe, expect, it } from "vitest";

describe("release package size budget", () => {
  it("parses emitted ESM imports without depending on quote or whitespace formatting", async () => {
    const { listLocalModuleSpecifiers } = await import("../scripts/verify-package-size");
    const source = [
      "import './side-effect.js';",
      "import value from\n  './single-quoted.js';",
      'export { named } from "./re-export.js";',
      'const later = import("./dynamic.js");',
      'import "external-package";',
    ].join("\n");

    expect(listLocalModuleSpecifiers(source)).toEqual([
      "./side-effect.js",
      "./single-quoted.js",
      "./re-export.js",
    ]);
    expect(listLocalModuleSpecifiers(source, { includeDynamic: true })).toEqual([
      "./side-effect.js",
      "./single-quoted.js",
      "./re-export.js",
      "./dynamic.js",
    ]);
  });

  it("rejects packed artifacts that exceed either budget", async () => {
    const { assertPackageSizeWithinBudget } = await import("../scripts/verify-package-size");
    expect(() => assertPackageSizeWithinBudget({ size: 1_200_000, unpackedSize: 4_500_000 })).not.toThrow();
    expect(() => assertPackageSizeWithinBudget({ size: 1_250_001, unpackedSize: 4_500_000 })).toThrow(/packed size/i);
    expect(() => assertPackageSizeWithinBudget({ size: 1_200_000, unpackedSize: 5_000_001 })).toThrow(/unpacked size/i);
  });

  it("keeps the default browser entry small by loading selected renderers on demand", async () => {
    const { assertInitialClientWithinBudget } = await import("../scripts/verify-package-size");
    expect(() => assertInitialClientWithinBudget(47_000)).not.toThrow();
    expect(() => assertInitialClientWithinBudget(47_001)).toThrow(/headroom/i);
    expect(() => assertInitialClientWithinBudget(52_001)).toThrow(/initial client gzip size/i);
  });

  it("bounds the transitive React-free test entry", async () => {
    const { assertLoadedTestKitWithinBudget, assertTestKitWithinBudget } = await import("../scripts/verify-package-size");
    expect(() => assertTestKitWithinBudget(45_000)).not.toThrow();
    expect(() => assertTestKitWithinBudget(45_001)).toThrow(/headroom/i);
    expect(() => assertTestKitWithinBudget(50_001)).toThrow(/test kit gzip size/i);
    expect(() => assertLoadedTestKitWithinBudget(54_999)).not.toThrow();
    expect(() => assertLoadedTestKitWithinBudget(55_001)).toThrow(/loaded test kit gzip size/i);
  });
});
