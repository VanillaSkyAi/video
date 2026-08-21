import {
  createVideo,
  type VideoAudio,
  type VideoEvent,
  type VideoPlanner,
  type VideoSceneValidator,
  type VideoState,
} from "../../src/internal";
import {
  evaluateVideoAcceptance,
  type VideoAcceptanceReport,
  type TimedVideoEvent,
} from "./evaluate";
import type { AcceptanceFixture } from "./fixtures";

export const ACCEPTANCE_AUDIO: VideoAudio = {
  trackId: "acceptance-calm",
  audioUrl: "data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAAAAgICAgICAgICAgICAgA==",
  sourceDuration: 30,
  duration: 30,
  beatDetection: { sensitivity: 0.5 },
  beatMarkers: Array.from({ length: 30 }, (_, index) => ({ time: index })),
  volume: 0.2,
  fadeOutMs: 3000,
};

export function selectAcceptanceAudio(): VideoAudio {
  return ACCEPTANCE_AUDIO;
}

export interface RunAcceptanceFixtureOptions {
  fixture: AcceptanceFixture;
  generate: VideoPlanner;
  selectAudio?: typeof selectAcceptanceAudio;
  humanQualityScore?: number;
  capabilities?: string[];
  validateScene?: VideoSceneValidator;
}

export interface AcceptanceFixtureResult {
  fixtureId: string;
  events: TimedVideoEvent[];
  state: VideoState;
  report: VideoAcceptanceReport;
}

export async function runAcceptanceFixture({
  fixture,
  generate,
  selectAudio = selectAcceptanceAudio,
  humanQualityScore,
  capabilities,
  validateScene,
}: RunAcceptanceFixtureOptions): Promise<AcceptanceFixtureResult> {
  const startedAt = performance.now();
  const requestedTemplates = capabilities ?? fixture.replayParts
    .filter((part) => part.type === "scene.add")
    .map((part) => part.scene.templateId);
  const run = createVideo(fixture.input, {
    generate,
    selectAudio,
    capabilities: {
      templates: [...new Set([
        ...(typeof fixture.input.opening === "string" && fixture.input.opening.trim()
          ? ["media"]
          : []),
        ...requestedTemplates,
      ])],
    },
    validateScene,
  });
  const events: TimedVideoEvent[] = [];
  for await (const event of run.stream) {
    events.push({
      event: event as VideoEvent,
      elapsedMs: Math.round(performance.now() - startedAt),
    });
  }
  const state = await run.result;
  return {
    fixtureId: fixture.id,
    events,
    state,
    report: evaluateVideoAcceptance({
      events,
      requireAudio: true,
      humanQualityScore,
    }),
  };
}
