import type { VideoEvent } from "../../src/protocol/events.js";

export interface TimedVideoEvent {
  event: VideoEvent;
  elapsedMs: number;
}

export interface VideoAcceptanceThresholds {
  openingMs: number;
  firstGeneratedSceneMs: number;
  completionMs: number;
  minBodyScenes: number;
  minTemplateDiversity: number;
  minHumanQualityScore: number;
}

export interface VideoAcceptanceCheck {
  id: string;
  passed: boolean;
  detail: string;
}

export interface VideoAcceptanceMetrics {
  openingMs?: number;
  firstGeneratedSceneMs?: number;
  completionMs?: number;
  bodyScenes: number;
  templateDiversity: number;
  humanQualityScore?: number;
}

export interface EvaluateVideoAcceptanceOptions {
  events: TimedVideoEvent[];
  requireAudio?: boolean;
  humanQualityScore?: number;
  thresholds?: Partial<VideoAcceptanceThresholds>;
}

export interface VideoAcceptanceReport {
  passed: boolean;
  thresholds: VideoAcceptanceThresholds;
  metrics: VideoAcceptanceMetrics;
  checks: VideoAcceptanceCheck[];
}

export const DEFAULT_VIDEO_ACCEPTANCE_THRESHOLDS: VideoAcceptanceThresholds = {
  openingMs: 250,
  firstGeneratedSceneMs: 15_000,
  completionMs: 30_000,
  minBodyScenes: 3,
  minTemplateDiversity: 3,
  minHumanQualityScore: 80,
};

const MEDIA_TEMPLATES = new Set(["media", "ctaMedia", "reaction"]);
const MEDIA_VARIABLES = ["mediaUrl", "mediaPoster", "mediaKeyword"];
const LIST_VARIABLES = new Set([
  "items",
  "itemEmojis",
  "steps",
  "stepEmojis",
  "problemEmojis",
  "solutionEmojis",
]);

type SceneAddEvent = Extract<VideoEvent, { type: "scene.add" }>;
type TimedSceneAddEvent = TimedVideoEvent & { event: SceneAddEvent };

function isSceneAddEvent(item: TimedVideoEvent): item is TimedSceneAddEvent {
  return item.event.type === "scene.add";
}

function addSceneEvents(events: TimedVideoEvent[]): TimedSceneAddEvent[] {
  return events.filter(isSceneAddEvent);
}

function hasMediaIntent(item: TimedVideoEvent): boolean {
  if (item.event.type !== "scene.add") return false;
  const scene = item.event.data.scene;
  if (MEDIA_TEMPLATES.has(scene.templateId)) return true;
  return MEDIA_VARIABLES.some((key) => {
    const value = scene.variables[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function hasUnresolvedMedia(item: TimedVideoEvent): boolean {
  if (item.event.type !== "scene.add") return false;
  const variables = item.event.data.scene.variables;
  const visibleText = Object.values(variables)
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  if (/loading\s+(media|asset)|media\s+loading/i.test(visibleText)) return true;
  const mediaUrl = typeof variables.mediaUrl === "string" ? variables.mediaUrl.trim() : "";
  const mediaKeyword = typeof variables.mediaKeyword === "string"
    ? variables.mediaKeyword.trim()
    : "";
  if (mediaKeyword && !mediaUrl) return true;
  if (!MEDIA_TEMPLATES.has(item.event.data.scene.templateId)) return false;
  return variables.mediaType !== "gradient" && !mediaUrl;
}

function hasInvalidListEncoding(item: TimedVideoEvent): boolean {
  if (item.event.type !== "scene.add") return false;
  return Object.entries(item.event.data.scene.variables).some(([name, value]) =>
    LIST_VARIABLES.has(name) && typeof value === "string" && /[|\n\r]/.test(value));
}

function check(id: string, passed: boolean, detail: string): VideoAcceptanceCheck {
  return { id, passed, detail };
}

export function evaluateVideoAcceptance({
  events,
  requireAudio = false,
  humanQualityScore,
  thresholds: thresholdOverrides,
}: EvaluateVideoAcceptanceOptions): VideoAcceptanceReport {
  const thresholds = {
    ...DEFAULT_VIDEO_ACCEPTANCE_THRESHOLDS,
    ...thresholdOverrides,
  };
  const sceneEvents = addSceneEvents(events);
  const opening = sceneEvents.find((item) =>
    item.event.type === "scene.add" && item.event.data.scene.id === "supplied-opening");
  const body = sceneEvents.filter((item) =>
    item.event.type === "scene.add" && item.event.data.scene.id !== "supplied-opening");
  const firstBody = body[0];
  const completion = events.find((item) => item.event.type === "response.complete");
  const audio = events.find((item) => item.event.type === "audio.set");
  const firstSceneIndex = events.findIndex((item) => item.event.type === "scene.add");
  const audioIndex = events.findIndex((item) => item.event.type === "audio.set");
  const audioValue = audio?.event.type === "audio.set" ? audio.event.data.audio : undefined;
  const diversity = new Set(body.map((item) =>
    item.event.type === "scene.add" ? item.event.data.scene.templateId : "")).size;

  const metrics: VideoAcceptanceMetrics = {
    ...(opening ? { openingMs: opening.elapsedMs } : {}),
    ...(firstBody ? { firstGeneratedSceneMs: firstBody.elapsedMs } : {}),
    ...(completion ? { completionMs: completion.elapsedMs } : {}),
    bodyScenes: body.length,
    templateDiversity: diversity,
    ...(humanQualityScore == null ? {} : { humanQualityScore }),
  };

  const checks = [
    check(
      "opening-immediate",
      opening != null && opening.elapsedMs <= thresholds.openingMs,
      opening ? `Opening arrived in ${opening.elapsedMs}ms` : "No supplied opening was emitted",
    ),
    check(
      "first-generated-scene-latency",
      firstBody != null && firstBody.elapsedMs <= thresholds.firstGeneratedSceneMs,
      firstBody
        ? `First generated scene arrived in ${firstBody.elapsedMs}ms`
        : "No generated body scene was emitted",
    ),
    check(
      "first-generated-scene-playable",
      firstBody != null && !hasMediaIntent(firstBody),
      firstBody && !hasMediaIntent(firstBody)
        ? "First generated scene is asset-free"
        : "First generated scene depends on media",
    ),
    check(
      "media-resolved-before-commit",
      sceneEvents.every((item) => !hasUnresolvedMedia(item)),
      sceneEvents.every((item) => !hasUnresolvedMedia(item))
        ? "No committed scene exposes unresolved media"
        : "A committed scene exposes loading or unresolved media",
    ),
    check(
      "template-variable-shape",
      sceneEvents.every((item) => !hasInvalidListEncoding(item)),
      sceneEvents.every((item) => !hasInvalidListEncoding(item))
        ? "List variables use supported JSON-array or comma encoding"
        : "A list variable uses an unsupported pipe or newline delimiter",
    ),
    check(
      "audio-ready-at-start",
      !requireAudio || (audioIndex >= 0 && firstSceneIndex >= 0 && audioIndex < firstSceneIndex),
      requireAudio ? "Audio must be emitted before the opening" : "Audio is optional for this run",
    ),
    check(
      "audio-fades-out",
      !requireAudio || (audioValue?.fadeOutMs ?? 0) > 0,
      requireAudio ? "Audio must declare a positive fade-out" : "Audio is optional for this run",
    ),
    check(
      "body-scene-count",
      body.length >= thresholds.minBodyScenes,
      `${body.length} body scenes; requires ${thresholds.minBodyScenes}`,
    ),
    check(
      "template-diversity",
      diversity >= thresholds.minTemplateDiversity,
      `${diversity} distinct body templates; requires ${thresholds.minTemplateDiversity}`,
    ),
    check(
      "response-complete",
      completion != null && completion.elapsedMs <= thresholds.completionMs,
      completion
        ? `Response completed in ${completion.elapsedMs}ms`
        : "No response.complete event was emitted",
    ),
    check(
      "human-quality",
      humanQualityScore != null && humanQualityScore >= thresholds.minHumanQualityScore,
      humanQualityScore == null
        ? "Human quality review is pending"
        : `Human quality score ${humanQualityScore}; requires ${thresholds.minHumanQualityScore}`,
    ),
  ];

  return {
    passed: checks.every((item) => item.passed),
    thresholds,
    metrics,
    checks,
  };
}
