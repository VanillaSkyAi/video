import type {
  Video,
  VideoAudio,
  VideoInput,
  VideoOrientation,
  VideoScene,
  VideoStyle,
} from "../index.js";
import type { VideoFinishReason, VideoWarning } from "../server.js";

export type MockVideoStreamPart =
  | { type: "scene.add"; placement?: "closer"; scene: VideoScene }
  | {
      type: "scene.patch";
      sceneId: string;
      patch: Partial<Omit<VideoScene, "id" | "templateId">>;
    }
  | { type: "asset.patch"; sceneId: string; variables: Record<string, unknown> }
  | { type: "plan.complete"; finishReason?: "stop" | "length" | "content-filter" | "other" }
  | { type: "plan.error"; error: { message: string; code?: string; recoverable?: boolean } }
  | { type: "mock.delay"; durationMs: number }
  | { type: "mock.raw"; text: string }
  | { type: "mock.error"; message: string }
  | { type: "mock.wait-for-abort" };

export interface VideoGenerationFixture {
  input: VideoInput;
  parts: readonly MockVideoStreamPart[];
}

export interface MockVideoPlannerContext {
  request: { requestId: string };
  signal: AbortSignal;
}

export interface MockProviderTextStream {
  textStream: AsyncIterable<string>;
  finishReason: Promise<"stop" | "length" | "content-filter">;
}

type SimulatedEventEnvelope<TType extends string, TData> = {
  protocolVersion: "0.4";
  runId: string;
  sequence: number;
  eventId: string;
  type: TType;
  data: TData;
};

export type SimulatedVideoEvent =
  | SimulatedEventEnvelope<"response.start", {
      requestId: string;
      format: { orientation: VideoOrientation };
      style: VideoStyle;
      meta?: Video["meta"];
      capabilities?: { templates?: string[]; extensions?: string[] };
    }>
  | SimulatedEventEnvelope<"audio.set", { audio: VideoAudio }>
  | SimulatedEventEnvelope<"scene.add", { scene: VideoScene; position: number; revision: number }>
  | SimulatedEventEnvelope<"scene.patch", {
      sceneId: string;
      revision: number;
      patch: Partial<Omit<VideoScene, "id" | "templateId">>;
    }>
  | SimulatedEventEnvelope<"asset.patch", {
      sceneId: string;
      revision: number;
      variables: Record<string, unknown>;
    }>
  | SimulatedEventEnvelope<"response.warning", { warning: VideoWarning }>
  | SimulatedEventEnvelope<"response.complete", {
      finishReason: VideoFinishReason;
      snapshot: Video;
      checksum: string;
    }>
  | SimulatedEventEnvelope<"response.error", {
      error: { code: string; message: string; recoverable: boolean };
      terminal: boolean;
      snapshot?: Video;
    }>
  | SimulatedEventEnvelope<"response.abort", { reason: string; snapshot?: Video }>
  | SimulatedEventEnvelope<`data.${string}`, unknown>;
