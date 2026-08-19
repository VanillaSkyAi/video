import type { Video, VideoScene } from "./types.js";

export interface VideoSceneRange {
  scene: VideoScene;
  start: number;
  end: number;
}

export function resolveVideoTimeline(config: Video): VideoSceneRange[] {
  const ranges: VideoSceneRange[] = [];
  let cursor = 0;
  for (const scene of config.scenes) {
    const timing = scene.timing ?? {};
    const beatStart = timing.beatStart == null
      ? undefined
      : config.audio?.beatMarkers[timing.beatStart]?.time;
    const beatEnd = timing.beatEnd == null
      ? undefined
      : config.audio?.beatMarkers[timing.beatEnd]?.time;
    const start = timing.startTime ?? beatStart ?? cursor;
    const duration = Math.max(0.001, timing.fixedDuration ?? 5);
    const end = Math.max(start + 0.001, timing.endTime ?? beatEnd ?? start + duration);
    ranges.push({ scene, start, end });
    cursor = end;
  }
  return ranges;
}

export function getVideoDuration(config: Video): number {
  return resolveVideoTimeline(config).at(-1)?.end ?? 0;
}
