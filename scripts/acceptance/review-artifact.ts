import type { VideoAcceptanceReport } from "./evaluate";

export interface LiveAcceptanceArtifact {
  provider: string;
  fixture: string;
  report: VideoAcceptanceReport;
  state: {
    status: string;
    errors: Array<{ code: string; message: string; recoverable: boolean }>;
    finishReason?: string;
  };
  timeline: Array<{ sequence: number; type: string; elapsedMs: number }>;
  review?: { score: number; reviewedAt: string };
}

export function applyHumanQualityReview(
  artifact: LiveAcceptanceArtifact,
  score: number,
  reviewedAt: string,
): LiveAcceptanceArtifact {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error("Human quality score must be between 0 and 100");
  }
  const passed = score >= artifact.report.thresholds.minHumanQualityScore;
  const checks = artifact.report.checks.map((item) => item.id === "human-quality"
    ? {
        id: item.id,
        passed,
        detail: `Human quality score ${score}; requires ${artifact.report.thresholds.minHumanQualityScore}`,
      }
    : item);
  return {
    ...artifact,
    report: {
      ...artifact.report,
      passed: checks.every((item) => item.passed),
      metrics: { ...artifact.report.metrics, humanQualityScore: score },
      checks,
    },
    review: { score, reviewedAt },
  };
}
