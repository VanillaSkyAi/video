import { describe, expect, it } from "vitest";
import { parseNpmPackJson } from "../scripts/lib/parse-npm-pack-json.mjs";

describe("npm pack JSON parsing", () => {
  it("ignores colored lifecycle output before artifact metadata", () => {
    const output = `\u001b[34mCLI\u001b[39m Building entry: {"index":"src/index.ts"}\n${JSON.stringify([{
      filename: "vanillaskyai-video-1.3.0.tgz",
      version: "1.3.0",
    }], null, 2)}\n`;
    expect(parseNpmPackJson(output)).toEqual([{
      filename: "vanillaskyai-video-1.3.0.tgz",
      version: "1.3.0",
    }]);
  });

  it("fails clearly without artifact metadata", () => {
    expect(() => parseNpmPackJson("build failed")).toThrow("valid JSON artifact description");
  });
});
