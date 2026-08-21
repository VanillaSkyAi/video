import { describe, expect, it } from "vitest";

describe("canonical acceptance fixtures", () => {
  it("covers the four public experience families and the visual-answer proof", async () => {
    const api = await import("../scripts/acceptance/fixtures").catch(() => undefined);
    expect(api?.ACCEPTANCE_FIXTURES).toHaveLength(5);
    if (!api?.ACCEPTANCE_FIXTURES) return;

    expect(api.ACCEPTANCE_FIXTURES.map(({ id }) => id)).toEqual([
      "personalized-recap",
      "daily-briefing",
      "welcome-onboarding",
      "release-update",
      "visual-answer",
    ]);
    for (const fixture of api.ACCEPTANCE_FIXTURES) {
      expect(fixture.input.opening).toBeTruthy();
      expect(fixture.input.brand?.name).toBeTruthy();
      expect(fixture.input.brand?.colors?.primary).toMatch(/^#/);
      expect(fixture.replayParts.at(-1)).toEqual({ type: "plan.complete" });
      expect(fixture.templateIds).toContain("notification");
      expect(fixture.templateIds.length).toBeGreaterThanOrEqual(4);
    }
    expect(api.ACCEPTANCE_FIXTURES[1].input.personalization)
      .toEqual(expect.objectContaining({ firstName: "Maya", role: "Product leader" }));
    expect(api.ACCEPTANCE_FIXTURES[3].input.suppliedMedia).toHaveLength(1);
    expect(api.ACCEPTANCE_FIXTURES[3].input.suppliedMedia?.[0]?.url)
      .not.toContain(".example");
    expect(JSON.stringify(api.ACCEPTANCE_FIXTURES)).not.toContain(".example");
    expect(api.BRAND_INPUT_FIXTURES.withLogo.logoUrl).toMatch(/^https:/);
    expect(api.BRAND_INPUT_FIXTURES.withoutLogo.logoUrl).toBeUndefined();
    expect(api.BRAND_INPUT_FIXTURES.light).toMatchObject({
      background: { color: "#F8FAFC" },
      colors: { foreground: "#111827" },
    });
    expect(Object.keys(api.BRAND_INPUT_FIXTURES.partial.colors)).toEqual(["primary"]);
    expect(api.BRAND_INPUT_FIXTURES.invalidColor.colors.primary).toBe("violet");
  });
});
