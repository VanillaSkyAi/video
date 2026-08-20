import { checksumVideo } from "../protocol/checksum.js";
import { createVideoEventFactory, type VideoEvent } from "../protocol/events.js";
import {
  applyVideoEvent,
  createVideoState,
  type VideoState,
} from "../protocol/state.js";
import {
  createVideoRequest,
  VIDEO_SCHEMA_VERSION,
  type CreateVideoOptions,
  type VideoAudio,
  type Video,
  type VideoInput,
  type VideoRun,
  type VideoScene,
} from "../protocol/types.js";
import {
  MAX_RETAINED_INSTRUCTIONS_LENGTH,
  MAX_RETAINED_MEDIA_URL_LENGTH,
  MAX_RETAINED_MEDIA_URLS,
  MAX_RETAINED_SOURCE_LENGTH,
  parseVideo,
} from "../protocol/persistence.js";
import { resolveVideoBrand } from "../protocol/background.js";
import { parseVideoPlanPart } from "../protocol/validation.js";
import { buildVideoUserPrompt, resolveSuppliedMediaPlanPart } from "./prompts/user-prompt.js";
import { getCloserReserve, getReadableSceneDuration, paceScene } from "./pacing.js";
import type { VideoWarning } from "../protocol/warnings.js";
import { safePublicDiagnostic } from "../protocol/warnings.js";
import type {
  VideoGenerationLifecycleSink,
  VideoGenerationSummary,
  VideoProviderLifecycleResult,
} from "./lifecycle.js";
import { attachGenerationLifecycleSink } from "./lifecycle.js";

const DEFAULT_OPENING_TEXT = "Creating your video...";

function resolveVideoInput(input: VideoInput): VideoInput {
  return {
    ...input,
    opening: input.opening?.trim() || DEFAULT_OPENING_TEXT,
  };
}

function resolveStreamCapabilities(
  capabilities: CreateVideoOptions["capabilities"],
): CreateVideoOptions["capabilities"] {
  if (capabilities?.templates == null) return capabilities;
  return {
    ...capabilities,
    templates: [...new Set(["media", ...capabilities.templates])],
  };
}

function invokeIsolated<T>(callback: ((value: T) => unknown) | undefined, value: T): void {
  if (!callback) return;
  try {
    void Promise.resolve(callback(value)).catch(() => undefined);
  } catch {
    // Lifecycle observers cannot alter generation or the client response.
  }
}

function cloneWarning(warning: VideoWarning): VideoWarning {
  return {
    code: warning.code,
    category: warning.category,
    message: warning.message,
    ...(warning.sceneId != null ? { sceneId: warning.sceneId } : {}),
    recoverable: warning.recoverable,
  };
}

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function safeAbortReason(value: unknown): string {
  if (value instanceof DOMException && value.name === "TimeoutError") return "Request timed out";
  if (value instanceof Error && value.name === "TimeoutError") return "Request timed out";
  return safePublicDiagnostic(value instanceof Error ? value.message : value, "Request aborted");
}

function buildInitialConfig(
  input: VideoInput,
  audio: VideoAudio | undefined,
  snapshotRetention: CreateVideoOptions["snapshotRetention"],
  closerReserveSec: number,
  getTemplatePacing: CreateVideoOptions["getTemplatePacing"],
): { config: Video; warnings: VideoWarning[] } {
  const openingText = input.opening?.trim();
  const rawScenes: VideoScene[] = openingText
    ? [{
        id: "supplied-opening",
        templateId: "media",
        variables: {
          texts: openingText,
          mediaType: "gradient",
        },
        timing: { fixedDuration: 3 },
      }]
    : [];
  const scenes: VideoScene[] = [];
  const warnings: VideoWarning[] = [];
  for (const scene of rawScenes) {
    const maxDurationSec = input.maxDurationSec ?? 30;
    const readableMinimum = getReadableSceneDuration(scene, getTemplatePacing?.(scene.templateId));
    if (maxDurationSec < readableMinimum) {
      throw new Error("Video response maximum duration cannot fit the supplied opening readably");
    }
    const paced = paceScene(scene, {
      previousScenes: scenes,
      audio,
      maxDurationSec,
      closerReserveSec: Math.min(closerReserveSec, maxDurationSec - readableMinimum),
      getTemplatePacing,
    });
    if (!paced.scene) throw new Error("Video response maximum duration cannot fit the supplied opening readably");
    scenes.push(paced.scene);
    warnings.push(...paced.warnings);
  }
  const meta: NonNullable<Video["meta"]> = {
    name: input.brand?.name?.trim() || "Video response",
  };
  if (snapshotRetention?.source) {
    meta.source = input.input.trim().slice(0, MAX_RETAINED_SOURCE_LENGTH);
  }
  if (snapshotRetention?.instructions && input.instructions?.trim()) {
    meta.prompt = input.instructions.trim().slice(0, MAX_RETAINED_INSTRUCTIONS_LENGTH);
  }
  if (snapshotRetention?.suppliedMediaUrls && input.suppliedMedia?.length) {
    meta.uploadedMediaUrls = input.suppliedMedia
      .slice(0, MAX_RETAINED_MEDIA_URLS)
      .map((item) => item.url);
  }

  return { config: {
    schemaVersion: VIDEO_SCHEMA_VERSION,
    orientation: input.orientation ?? "portrait",
    scenes,
    ...(audio ? { audio } : {}),
    style: {
      brand: resolveVideoBrand(input.brand),
      density: input.style?.density ?? "normal",
      motion: input.style?.motion ?? "normal",
      defaultBackgroundEffect: input.style?.backgroundEffect ?? "slow-zoom-in",
      defaultTextArchetype: input.style?.textArchetype ?? "subtle",
    },
    meta,
  }, warnings };
}

function validateInput(input: VideoInput): void {
  if (!input.input.trim()) throw new Error("Video response input is required");
  if (input.knowledgeMode != null && input.knowledgeMode !== "input-only" && input.knowledgeMode !== "general") {
    throw new Error("Video response knowledge mode must be input-only or general");
  }
  if (input.maxDurationSec != null &&
    (!Number.isFinite(input.maxDurationSec) || input.maxDurationSec < 5 || input.maxDurationSec > 120)) {
    throw new Error("Video response maximum duration must be between 5 and 120 seconds");
  }
  if (input.opening != null && !input.opening.trim()) {
    throw new Error("Video response opening must be a non-empty string");
  }
  if (input.audio && !input.audio.src.trim()) {
    throw new Error("Video response audio src must be a non-empty string");
  }
  if (input.audio && input.audio.src.length > MAX_RETAINED_MEDIA_URL_LENGTH) {
    throw new Error(`Video response audio src must be at most ${MAX_RETAINED_MEDIA_URL_LENGTH} characters`);
  }
  for (const [index, media] of (input.suppliedMedia ?? []).entries()) {
    if (media.url.length > MAX_RETAINED_MEDIA_URL_LENGTH) {
      throw new Error(`Video response supplied media ${index} URL must be at most ${MAX_RETAINED_MEDIA_URL_LENGTH} characters`);
    }
    if (media.posterUrl && media.posterUrl.length > MAX_RETAINED_MEDIA_URL_LENGTH) {
      throw new Error(`Video response supplied media ${index} poster URL must be at most ${MAX_RETAINED_MEDIA_URL_LENGTH} characters`);
    }
  }
  resolveVideoBrand(input.brand);
}

function createId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}

function createPatchReadabilityWarning(sceneId: string): VideoWarning {
  return {
    code: "scene_patch_rejected_readability",
    category: "readability",
    message: "Scene update was omitted because it would make the timeline unreadable.",
    sceneId,
    recoverable: true,
  };
}

function createOmittedForCloserWarning(sceneId: string): VideoWarning {
  return {
    code: "scene_omitted_for_closer",
    category: "readability",
    message: "Scene was omitted because the reserved closer must remain the last scene.",
    sceneId,
    recoverable: true,
  };
}

function createDuplicateCloserWarning(): VideoWarning {
  return {
    code: "scene_omitted_for_closer",
    category: "readability",
    message: "An additional closer was omitted because the first valid closer is already reserved.",
    recoverable: true,
  };
}

function createIncompletePlanWarning(): VideoWarning {
  return {
    code: "plan_incomplete",
    category: "provider",
    message: "The planner stopped at a length limit; some requested scenes or the ending may be missing.",
    recoverable: true,
  };
}

function createMissingCloserWarning(): VideoWarning {
  return {
    code: "plan_missing_closer",
    category: "provider",
    message: "The planner completed without a valid closer; the video may end on a body scene.",
    recoverable: true,
  };
}

function pendingCloserReserve(
  scene: VideoScene,
  getTemplatePacing: CreateVideoOptions["getTemplatePacing"],
): number {
  const metadata = getTemplatePacing?.(scene.templateId);
  const readableMinimum = getReadableSceneDuration(scene, metadata);
  const explicitRange = scene.timing.startTime != null && scene.timing.endTime != null
    ? Math.max(0, scene.timing.endTime - scene.timing.startTime)
    : undefined;
  const requested = explicitRange ?? scene.timing.fixedDuration ?? metadata?.preferredDuration ?? readableMinimum;
  return Math.max(readableMinimum, requested);
}

function sceneSlotDuration(scene: VideoScene): number {
  return Math.max(0, (scene.timing.endTime ?? 0) - (scene.timing.startTime ?? 0));
}

function createSceneQualityWarnings(scene: VideoScene): VideoWarning[] {
  if (scene.templateId !== "barChart" || !Array.isArray(scene.variables.bars)) return [];
  const values = scene.variables.bars.flatMap((bar) => {
    if (!bar || typeof bar !== "object") return [];
    const value = (bar as { value?: unknown }).value;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? [value] : [];
  });
  if (values.length < 2 || Math.max(...values) / Math.min(...values) <= 20) return [];
  return [{
    code: "chart_scale_imbalance",
    category: "readability",
    message: "Chart values span more than 20×; verify that they use comparable units.",
    sceneId: scene.id,
    recoverable: true,
  }];
}

export function createVideo(
  rawInput: VideoInput,
  options: CreateVideoOptions,
): VideoRun {
  validateInput(rawInput);
  const usesDefaultOpening = rawInput.opening == null;
  const input = resolveVideoInput(rawInput);
  const requestId = options.requestId ?? createId("request");
  const runId = options.runId ?? createId("run");
  const request = createVideoRequest(input, {
    requestId,
    capabilities: options.capabilities,
  });
  const initialAudio = input.audio === false
    ? undefined
    : input.audio
      ? {
          trackId: "soundtrack",
          audioUrl: input.audio.src,
          duration: input.maxDurationSec ?? 30,
          beatDetection: { sensitivity: 0.5 },
          beatMarkers: [],
          volume: 1,
          fadeOutMs: 3000,
        }
      : options.selectAudio?.(input);
  const closerReserveSec = getCloserReserve(
    options.capabilities?.templates,
    options.getTemplatePacing,
  );
  const initial = buildInitialConfig(
    input,
    initialAudio,
    options.snapshotRetention,
    closerReserveSec,
    options.getTemplatePacing,
  );
  const initialConfig = initial.config;
  for (let position = 0; position < initialConfig.scenes.length; position += 1) {
    options.validateScene?.(initialConfig.scenes[position], {
      input,
      previousScenes: initialConfig.scenes.slice(0, position),
    });
  }
  const userPrompt = buildVideoUserPrompt(
    input,
    initialConfig.scenes.at(-1)?.timing.endTime ?? 0,
  );
  const events = createVideoEventFactory({ runId });
  const controller = new AbortController();
  let abortReason = "Request aborted";
  const forwardAbort = () => {
    abortReason = safeAbortReason(options.signal?.reason);
    controller.abort(options.signal?.reason);
  };
  if (options.signal?.aborted) forwardAbort();
  else options.signal?.addEventListener("abort", forwardAbort, { once: true });

  let resolveResult!: (state: VideoState) => void;
  let rejectResult!: (cause: unknown) => void;
  let settled = false;
  const result = new Promise<VideoState>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const startedAt = now();
  let acceptedSceneCount = 0;
  let rejectedSceneCount = 0;
  let timeToFirstSceneMs: number | undefined;
  const providerResults: Array<Promise<VideoProviderLifecycleResult>> = [];
  const lifecycle: VideoGenerationLifecycleSink = {
    registerProviderResult(providerResult) {
      providerResults.push(providerResult);
    },
  };
  const reportedErrors = new WeakSet<Error>();
  const reportError = (error: Error) => {
    if (reportedErrors.has(error)) return;
    reportedErrors.add(error);
    invokeIsolated(options.onError, error);
  };
  const settleProviderLifecycle = async (): Promise<VideoProviderLifecycleResult> => {
    const results = await Promise.all(providerResults);
    const warnings = results.flatMap((result) => result.warnings);
    const uniqueWarnings = [...new Map(warnings.map((warning) => [
      `${warning.code}\u0000${warning.category}\u0000${warning.message}\u0000${warning.sceneId ?? ""}`,
      warning,
    ])).values()];
    return results.reduce<VideoProviderLifecycleResult>((summary, result) => ({
      ...summary,
      ...result,
      warnings: uniqueWarnings,
    }), { warnings: uniqueWarnings });
  };

  const eventSource = (async function* (): AsyncGenerator<VideoEvent> {
    let state = createVideoState();
    const emit = (event: VideoEvent): VideoEvent => {
      state = applyVideoEvent(state, event);
      if (event.type === "response.warning") {
        invokeIsolated(options.onWarning, cloneWarning(event.data.warning));
      }
      options.onEvent?.(event);
      return event;
    };
    const finish = (finalState: VideoState) => {
      if (!settled) {
        settled = true;
        resolveResult(finalState);
      }
    };
    let planCompleted = false;
    let generatedSceneCount = 0;
    let runtimeDurationLimited = false;
    let pendingCloser: VideoScene | undefined;
    const deferredForCloser: VideoScene[] = [];
    let plannerReportedLength = false;
    let closerCommitted = false;
    let missingCloser = false;
    let finishReason: "stop" | "length" | "content-filter" | "other" = "stop";

    try {
      yield emit(events.create("response.start", {
        requestId,
        format: { orientation: initialConfig.orientation ?? "portrait" },
        style: initialConfig.style,
        meta: initialConfig.meta,
        capabilities: resolveStreamCapabilities(options.capabilities),
      }));
      if (initialConfig.audio) yield emit(events.create("audio.set", { audio: initialConfig.audio }));
      for (const warning of initial.warnings) {
        yield emit(events.create("response.warning", { warning }));
      }
      for (let position = 0; position < initialConfig.scenes.length; position += 1) {
        yield emit(events.create("scene.add", {
          scene: initialConfig.scenes[position],
          position,
          revision: 0,
        }));
      }

      const systemPrompt = options.systemPrompt ??
        (await import("./prompts/system-prompt.js")).createVideoSystemPrompt(input.knowledgeMode);
      const context = { request, systemPrompt, userPrompt, initialConfig, signal: controller.signal };
      attachGenerationLifecycleSink(context, lifecycle);
      for await (const untrustedPart of options.generate(context)) {
        let attemptedScene = false;
        try {
          const part = resolveSuppliedMediaPlanPart(parseVideoPlanPart(untrustedPart), input);
          attemptedScene = part.type === "scene.add";
          if (controller.signal.aborted) throw controller.signal.reason ?? new Error(abortReason);
          if (planCompleted && part.type !== "plan.complete") {
            throw new Error("The planner emitted content after plan.complete");
          }
          if (part.type === "scene.add") {
          if (options.capabilities?.templates != null &&
            !options.capabilities.templates.includes(part.scene.templateId)) {
            throw new Error(`Scene template ${part.scene.templateId} was not negotiated`);
          }
          options.validateScene?.(part.scene, {
            input,
            previousScenes: state.config?.scenes ?? [],
          });
          const templatePacing = options.getTemplatePacing?.(part.scene.templateId);
          const isAskCandidate = templatePacing?.jobs?.includes("ask") === true;
          const isPayoffCandidate = templatePacing?.jobs?.includes("payoff") === true;
          if (part.placement === "closer" && templatePacing && !isAskCandidate && !isPayoffCandidate) {
            throw new Error(`Scene template ${part.scene.templateId} cannot be used as a closer`);
          }
          const isCloserCandidate = part.placement === "closer" || isAskCandidate;
          if (isCloserCandidate) {
            if (pendingCloser) {
              rejectedSceneCount += 1;
              yield emit(events.create("response.warning", {
                warning: createDuplicateCloserWarning(),
              }));
            } else {
              pendingCloser = part.scene;
            }
            continue;
          }
          // Once a body scene is held for the optional closer, hold later body
          // scenes too. Otherwise a shorter later scene could commit first and
          // the recovery pass would silently reorder the planner's narrative.
          if (deferredForCloser.length) {
            deferredForCloser.push(part.scene);
            continue;
          }
          const paced = paceScene(part.scene, {
            previousScenes: state.config?.scenes ?? [],
            audio: state.config?.audio,
            maxDurationSec: input.maxDurationSec ?? 30,
            closerReserveSec: pendingCloser
              ? pendingCloserReserve(pendingCloser, options.getTemplatePacing)
              : closerReserveSec,
            getTemplatePacing: options.getTemplatePacing,
          });
          if (!paced.scene) {
            if (paced.warnings.some(({ code }) => code === "scene_omitted_for_closer")) {
              deferredForCloser.push(part.scene);
              continue;
            }
            for (const warning of paced.warnings) {
              yield emit(events.create("response.warning", { warning }));
            }
            runtimeDurationLimited = true;
            rejectedSceneCount += 1;
            continue;
          }
          const scene = paced.scene;
          for (const warning of paced.warnings) {
            yield emit(events.create("response.warning", { warning }));
          }
          for (const warning of createSceneQualityWarnings(scene)) {
            yield emit(events.create("response.warning", { warning }));
          }
          yield emit(events.create("scene.add", {
            scene,
            position: state.config?.scenes.length ?? 0,
            revision: 0,
          }));
          generatedSceneCount += 1;
          acceptedSceneCount += 1;
          timeToFirstSceneMs ??= Math.max(0, now() - startedAt);
          } else if (part.type === "scene.patch") {
          if (pendingCloser?.id === part.sceneId) {
            const nextPendingCloser = {
              ...pendingCloser,
              ...part.patch,
              variables: part.patch.variables
                ? { ...pendingCloser.variables, ...part.patch.variables }
                : pendingCloser.variables,
              timing: part.patch.timing
                ? { ...pendingCloser.timing, ...part.patch.timing }
                : pendingCloser.timing,
            };
            options.validateScene?.(nextPendingCloser, {
              input,
              previousScenes: state.config?.scenes ?? [],
            });
            pendingCloser = nextPendingCloser;
            continue;
          }
          const scenes = state.config?.scenes ?? [];
          const sceneIndex = scenes.findIndex((scene) => scene.id === part.sceneId);
          if (sceneIndex < 0) throw new Error(`Scene ${part.sceneId} does not exist`);
          if (part.patch.timing && sceneIndex < scenes.length - 1) {
            yield emit(events.create("response.warning", {
              warning: createPatchReadabilityWarning(part.sceneId),
            }));
            continue;
          }
          const currentScene = scenes[sceneIndex];
          if (part.patch.timing?.startTime != null &&
            Math.abs(part.patch.timing.startTime - (currentScene.timing.startTime ?? 0)) > 0.000_001) {
            yield emit(events.create("response.warning", {
              warning: createPatchReadabilityWarning(part.sceneId),
            }));
            continue;
          }
          let timing: VideoScene["timing"] | undefined;
          if (part.patch.timing) {
            const requestedTiming = { ...currentScene.timing, ...part.patch.timing };
            if (part.patch.timing.startTime != null && part.patch.timing.endTime == null) {
              delete requestedTiming.endTime;
            }
            if (part.patch.timing.fixedDuration != null && part.patch.timing.endTime == null) {
              delete requestedTiming.endTime;
            }
            const pacedPatch = paceScene({
              ...currentScene,
              ...part.patch,
              variables: part.patch.variables
                ? { ...currentScene.variables, ...part.patch.variables }
                : currentScene.variables,
              timing: requestedTiming,
            }, {
              previousScenes: scenes.slice(0, sceneIndex),
              audio: state.config?.audio,
              maxDurationSec: input.maxDurationSec ?? 30,
              closerReserveSec: pendingCloser
                ? pendingCloserReserve(pendingCloser, options.getTemplatePacing)
                : closerReserveSec,
              getTemplatePacing: options.getTemplatePacing,
            });
            if (!pacedPatch.scene) {
              yield emit(events.create("response.warning", {
                warning: createPatchReadabilityWarning(part.sceneId),
              }));
              continue;
            }
            for (const warning of pacedPatch.warnings) {
              yield emit(events.create("response.warning", { warning }));
            }
            timing = pacedPatch.scene.timing;
          }
          const patch = {
            ...part.patch,
            ...(timing ? { timing } : {}),
          };
          const nextScene = {
            ...currentScene,
            ...patch,
            variables: patch.variables
              ? { ...currentScene.variables, ...patch.variables }
              : currentScene.variables,
            timing: patch.timing
              ? { ...currentScene.timing, ...patch.timing }
              : currentScene.timing,
          };
          options.validateScene?.(nextScene, { input, previousScenes: scenes });
          if (getReadableSceneDuration(
            nextScene,
            options.getTemplatePacing?.(nextScene.templateId),
          ) > sceneSlotDuration(nextScene) + 0.000_001) {
            yield emit(events.create("response.warning", {
              warning: createPatchReadabilityWarning(part.sceneId),
            }));
            continue;
          }
          yield emit(events.create("scene.patch", {
            sceneId: part.sceneId,
            revision: (state.sceneRevisions[part.sceneId] ?? -1) + 1,
            patch,
          }));
          } else if (part.type === "asset.patch") {
          if (pendingCloser?.id === part.sceneId) {
            const nextPendingCloser = {
              ...pendingCloser,
              variables: { ...pendingCloser.variables, ...part.variables },
            };
            options.validateScene?.(nextPendingCloser, {
              input,
              previousScenes: state.config?.scenes ?? [],
            });
            pendingCloser = nextPendingCloser;
            continue;
          }
          const scenes = state.config?.scenes ?? [];
          const scene = scenes.find((item) => item.id === part.sceneId);
          if (!scene) throw new Error(`Scene ${part.sceneId} does not exist`);
          const nextScene = {
            ...scene,
            variables: { ...scene.variables, ...part.variables },
          };
          options.validateScene?.(nextScene, { input, previousScenes: scenes });
          if (getReadableSceneDuration(
            nextScene,
            options.getTemplatePacing?.(nextScene.templateId),
          ) > sceneSlotDuration(nextScene) + 0.000_001) {
            yield emit(events.create("response.warning", {
              warning: createPatchReadabilityWarning(part.sceneId),
            }));
            continue;
          }
          yield emit(events.create("asset.patch", {
            sceneId: part.sceneId,
            revision: (state.sceneRevisions[part.sceneId] ?? -1) + 1,
            variables: part.variables,
          }));
          } else if (part.type === "plan.error") {
          const internalError = new Error(part.error.message);
          reportError(internalError);
          const terminal = !(part.error.recoverable ?? false);
          const errorEvent = emit(events.create("response.error", {
            error: {
              code: "generation_failed",
              message: "Video response generation failed",
              recoverable: part.error.recoverable ?? false,
            },
            terminal,
            ...(terminal && state.config ? { snapshot: state.config } : {}),
          }));
          if (terminal) {
            finish(state);
            yield errorEvent;
            return;
          }
          yield errorEvent;
          } else if (part.type === "plan.complete") {
            if (planCompleted) throw new Error("The planner emitted plan.complete more than once");
            if (pendingCloser) {
              if (deferredForCloser.length) runtimeDurationLimited = true;
              for (const deferred of deferredForCloser.splice(0)) {
                rejectedSceneCount += 1;
                yield emit(events.create("response.warning", {
                  warning: createOmittedForCloserWarning(deferred.id),
                }));
              }
              const pacedCloser = paceScene(pendingCloser, {
                previousScenes: state.config?.scenes ?? [],
                audio: state.config?.audio,
                maxDurationSec: input.maxDurationSec ?? 30,
                closerReserveSec: 0,
                getTemplatePacing: options.getTemplatePacing,
              });
              for (const warning of pacedCloser.warnings) {
                yield emit(events.create("response.warning", { warning }));
              }
              if (pacedCloser.scene) {
                yield emit(events.create("scene.add", {
                  scene: pacedCloser.scene,
                  position: state.config?.scenes.length ?? 0,
                  revision: 0,
                }));
                generatedSceneCount += 1;
                acceptedSceneCount += 1;
                timeToFirstSceneMs ??= Math.max(0, now() - startedAt);
                closerCommitted = true;
              } else {
                runtimeDurationLimited = true;
                rejectedSceneCount += 1;
              }
            } else if (deferredForCloser.length) {
              for (const deferred of deferredForCloser.splice(0)) {
                const recovered = paceScene(deferred, {
                  previousScenes: state.config?.scenes ?? [],
                  audio: state.config?.audio,
                  maxDurationSec: input.maxDurationSec ?? 30,
                  closerReserveSec: 0,
                  getTemplatePacing: options.getTemplatePacing,
                });
                for (const warning of recovered.warnings) {
                  yield emit(events.create("response.warning", { warning }));
                }
                if (!recovered.scene) {
                  runtimeDurationLimited = true;
                  rejectedSceneCount += 1;
                  continue;
                }
                for (const warning of createSceneQualityWarnings(recovered.scene)) {
                  yield emit(events.create("response.warning", { warning }));
                }
                yield emit(events.create("scene.add", {
                  scene: recovered.scene,
                  position: state.config?.scenes.length ?? 0,
                  revision: 0,
                }));
                generatedSceneCount += 1;
                acceptedSceneCount += 1;
                timeToFirstSceneMs ??= Math.max(0, now() - startedAt);
              }
            }
            if (options.requireCloser && !closerCommitted) {
              missingCloser = true;
              yield emit(events.create("response.warning", {
                warning: createMissingCloserWarning(),
              }));
            }
            planCompleted = true;
            const reportedFinishReason = part.finishReason ?? "stop";
            finishReason = runtimeDurationLimited
              ? "length"
              : reportedFinishReason !== "stop"
                ? reportedFinishReason
                : missingCloser
                  ? "other"
                  : "stop";
            plannerReportedLength = part.finishReason === "length";
            continue;
          }
        } catch (cause) {
          const error = cause instanceof Error ? cause : new Error(String(cause));
          if (attemptedScene || (
            untrustedPart != null &&
            typeof untrustedPart === "object" &&
            (untrustedPart as { type?: unknown }).type === "scene.add"
          )) rejectedSceneCount += 1;
          reportError(error);
          if ((options.invalidPartBehavior ?? "fail") === "fail") throw error;
          yield emit(events.create("response.error", {
            error: {
              code: "invalid_generated_part",
              message: "Generated content was skipped",
              recoverable: true,
            },
            terminal: false,
          }));
        }
      }

      if (controller.signal.aborted) {
        throw controller.signal.reason ?? new Error(abortReason);
      }
      const provider = await settleProviderLifecycle();
      for (const warning of provider.warnings) {
        yield emit(events.create("response.warning", { warning }));
      }

      if (!planCompleted) throw new Error("The planner stream ended before plan.complete");
      // A planner-reported length means generation itself was truncated. The
      // runtime's own duration ceiling is different: the deterministic opening
      // may already be the complete playable response allowed by the host.
      if (plannerReportedLength && generatedSceneCount === 0) {
        throw new Error("The planner was truncated before adding a generated scene");
      }
      if (plannerReportedLength) {
        yield emit(events.create("response.warning", {
          warning: createIncompletePlanWarning(),
        }));
      }
      if (generatedSceneCount === 0 && usesDefaultOpening) {
        throw new Error("The planner completed without adding a scene");
      }
      // The documented persistence boundary must accept every completed value.
      // Validate and detach the terminal snapshot before it reaches SSE.
      const snapshot = parseVideo(state.config);
      const completeEvent = emit(events.create("response.complete", {
        finishReason,
        snapshot,
        checksum: checksumVideo(snapshot),
      }));
      finish(state);
      const summary: VideoGenerationSummary = {
        finishReason,
        ...(provider.usage ? { usage: provider.usage } : {}),
        ...(provider.providerMetadata !== undefined ? { providerMetadata: provider.providerMetadata } : {}),
        ...(provider.requestedModelId ? { requestedModelId: provider.requestedModelId } : {}),
        ...(provider.resolvedModelId ? { resolvedModelId: provider.resolvedModelId } : {}),
        ...(timeToFirstSceneMs != null ? { timeToFirstSceneMs } : {}),
        totalDurationMs: Math.max(0, now() - startedAt),
        acceptedSceneCount,
        rejectedSceneCount,
        videoDurationSec: snapshot.scenes.at(-1)?.timing.endTime ?? 0,
        warnings: state.warnings.map(cloneWarning),
      };
      invokeIsolated(options.onComplete, summary);
      yield completeEvent;
    } catch (cause) {
      if (controller.signal.aborted) {
        const abortEvent = emit(events.create("response.abort", {
          reason: abortReason,
          ...(state.config ? { snapshot: state.config } : {}),
        }));
        finish(state);
        yield abortEvent;
        return;
      }
      try {
        if (pendingCloser && !closerCommitted && state.config?.scenes.length) {
          const pacedCloser = paceScene(pendingCloser, {
            previousScenes: state.config.scenes,
            audio: state.config.audio,
            maxDurationSec: input.maxDurationSec ?? 30,
            closerReserveSec: 0,
            getTemplatePacing: options.getTemplatePacing,
          });
          for (const warning of pacedCloser.warnings) {
            yield emit(events.create("response.warning", { warning }));
          }
          if (pacedCloser.scene) {
            yield emit(events.create("scene.add", {
              scene: pacedCloser.scene,
              position: state.config.scenes.length,
              revision: 0,
            }));
            generatedSceneCount += 1;
            acceptedSceneCount += 1;
            closerCommitted = true;
          }
        }
        const provider = await settleProviderLifecycle();
        for (const warning of provider.warnings) {
          if (!state.warnings.some((existing) => existing.code === warning.code && existing.message === warning.message)) {
            yield emit(events.create("response.warning", { warning }));
          }
        }
        const error = cause instanceof Error ? cause : new Error(String(cause));
        reportError(error);
        const emptyResult = error.message === "The planner completed without adding a scene";
        const errorEvent = emit(events.create("response.error", {
          error: {
            code: "generation_failed",
            message: emptyResult
              ? "No valid scenes were generated; inspect recoverable errors and warnings, then retry with a more capable model."
              : "Video response generation failed",
            recoverable: false,
          },
          terminal: true,
          ...(state.config ? { snapshot: state.config } : {}),
        }));
        finish(state);
        yield errorEvent;
      } catch (terminalCause) {
        if (!settled) {
          settled = true;
          rejectResult(terminalCause);
        }
        throw terminalCause;
      }
    } finally {
      options.signal?.removeEventListener("abort", forwardAbort);
    }
  })();

  const buffered: VideoEvent[] = [];
  const waiters = new Set<() => void>();
  let streamDone = false;
  let streamError: unknown;
  const notify = () => {
    for (const waiter of waiters) waiter();
    waiters.clear();
  };

  void (async () => {
    try {
      for await (const event of eventSource) {
        buffered.push(event);
        notify();
      }
    } catch (cause) {
      streamError = cause;
      if (!settled) {
        settled = true;
        rejectResult(cause);
      }
    } finally {
      streamDone = true;
      notify();
    }
  })();

  const stream: AsyncIterable<VideoEvent> = {
    async *[Symbol.asyncIterator]() {
      let index = 0;
      while (true) {
        while (index < buffered.length) yield buffered[index++];
        if (streamDone) {
          if (streamError) throw streamError;
          return;
        }
        await new Promise<void>((resolve) => waiters.add(resolve));
      }
    },
  };

  return {
    request,
    initialConfig,
    initialStyle: initialConfig.style,
    stream,
    result,
    abort(reason = "user cancelled") {
      abortReason = safePublicDiagnostic(reason, "User cancelled");
      controller.abort(new Error(reason));
    },
  };
}
