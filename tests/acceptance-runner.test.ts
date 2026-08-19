import { describe, expect, it } from "vitest";
import type { VideoPlanner } from "../src/internal";

describe("acceptance runner", () => {
  it("classifies provider and planner failures into stable redacted categories", async () => {
    const { classifyAcceptanceFailure } = await import("../scripts/acceptance/failures");

    expect(classifyAcceptanceFailure(Object.assign(new Error("socket failed"), { code: "ENOTFOUND" }))).toBe("network");
    expect(classifyAcceptanceFailure(Object.assign(new Error("nope"), { status: 401 }))).toBe("authentication");
    expect(classifyAcceptanceFailure(Object.assign(new Error("missing"), { status: 404 }))).toBe("model_not_found");
    expect(classifyAcceptanceFailure(Object.assign(new Error("slow down"), { status: 429 }))).toBe("rate_limit");
    expect(classifyAcceptanceFailure(new SyntaxError("Unexpected token"))).toBe("planner_parse");
    expect(classifyAcceptanceFailure(new Error("Scene validation failed: unknown template"))).toBe("scene_validation");
    expect(classifyAcceptanceFailure(Object.assign(new Error("upstream"), { status: 500 }))).toBe("provider");
  });

  it("replays all canonical experiences through the SDK and passes the release gates", async () => {
    const runner = await import("../scripts/acceptance/run").catch(() => undefined);
    const fixtures = await import("../scripts/acceptance/fixtures");
    expect(runner?.runAcceptanceFixture).toBeTypeOf("function");
    if (!runner?.runAcceptanceFixture) return;

    for (const fixture of fixtures.ACCEPTANCE_FIXTURES) {
      const generate: VideoPlanner = async function* () {
        for (const part of fixture.replayParts) yield part;
      };
      const result = await runner.runAcceptanceFixture({
        fixture,
        generate,
        selectAudio: runner.selectAcceptanceAudio,
        humanQualityScore: 100,
      });
      expect(result.report.passed, `${fixture.id}: ${JSON.stringify(result.report.checks)}`)
        .toBe(true);
      expect(result.state.status).toBe("complete");
      expect(result.events.at(1)?.event.type).toBe("audio.set");
      expect(result.events.at(2)?.event.type).toBe("scene.add");
    }
  });
});
