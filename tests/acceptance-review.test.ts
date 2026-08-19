import { describe, expect, it } from "vitest";

import { applyHumanQualityReview } from "../scripts/acceptance/review-artifact";

describe("acceptance artifact review", () => {
  it("adds a human score without rerunning the provider and recomputes pass status", () => {
    const artifact = {
      provider: "anthropic",
      fixture: "personalized-recap",
      report: {
        passed: false,
        thresholds: {
          openingMs: 250,
          firstGeneratedSceneMs: 15_000,
          completionMs: 30_000,
          minBodyScenes: 3,
          minTemplateDiversity: 3,
          minHumanQualityScore: 80,
        },
        metrics: { bodyScenes: 4, templateDiversity: 4 },
        checks: [
          { id: "response-complete", passed: true, detail: "Complete" },
          { id: "human-quality", passed: false, detail: "Human quality review is pending" },
        ],
      },
      state: { status: "complete", errors: [] },
      timeline: [],
    };

    const reviewed = applyHumanQualityReview(artifact, 86, "2026-08-11T12:00:00.000Z");

    expect(reviewed.report.passed).toBe(true);
    expect(reviewed.report.metrics.humanQualityScore).toBe(86);
    expect(reviewed.report.checks.at(-1)).toEqual({
      id: "human-quality",
      passed: true,
      detail: "Human quality score 86; requires 80",
    });
    expect(reviewed.review).toEqual({ score: 86, reviewedAt: "2026-08-11T12:00:00.000Z" });
  });

  it("does not hide another failed release check", () => {
    const artifact = {
      provider: "anthropic",
      fixture: "daily-briefing",
      report: {
        passed: false,
        thresholds: {
          openingMs: 250,
          firstGeneratedSceneMs: 15_000,
          completionMs: 30_000,
          minBodyScenes: 3,
          minTemplateDiversity: 3,
          minHumanQualityScore: 80,
        },
        metrics: { bodyScenes: 2, templateDiversity: 2 },
        checks: [
          { id: "body-scene-count", passed: false, detail: "2 scenes" },
          { id: "human-quality", passed: false, detail: "Pending" },
        ],
      },
      state: { status: "complete", errors: [] },
      timeline: [],
    };

    expect(applyHumanQualityReview(artifact, 90, "now").report.passed).toBe(false);
  });
});
