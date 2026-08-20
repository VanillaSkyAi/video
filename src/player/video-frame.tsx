import { createElement, Suspense, type CSSProperties, type ReactElement } from "react";
import type { Video } from "../protocol/types.js";
import { resolveDensity } from "../visual-system/scene-templates/tokens.js";
import {
  getDimensions,
  getSafeZone,
  scaleSafeZone,
} from "../visual-system/layout.js";
import type { TemplateRegistry } from "../visual-system/catalog/kit.js";
import { getTemplateDefaults } from "../visual-system/catalog/schema.js";
import { resolveVideoTimeline, type VideoSceneRange } from "../protocol/timeline.js";

const SCENE_TRANSITION_SECONDS = 0.3;
const CONTIGUITY_ULP_FACTOR = 4;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function supportsContinuousTransition(value: string | undefined): value is "crossfade" | "fade" {
  return value === "crossfade" || value === "fade";
}

function rangesAreContiguous(left: VideoSceneRange, right: VideoSceneRange): boolean {
  const scale = Math.max(1, Math.abs(left.end), Math.abs(right.start));
  const ulpTolerance = Number.EPSILON * scale * CONTIGUITY_ULP_FACTOR;
  return Math.abs(left.end - right.start) <= ulpTolerance;
}

function brandBackground(config: Video): string {
  const background = config.style.brand.background;
  return background.type === "solid"
    ? background.color
    : `linear-gradient(135deg, ${background.colors[0]}, ${background.colors[1]})`;
}

function brandBackgroundFallback(config: Video): string {
  const background = config.style.brand.background;
  return background.type === "solid" ? background.color : background.colors[0];
}

function sceneBackgroundChanges(
  left: VideoSceneRange,
  right: VideoSceneRange,
): boolean {
  const mediaUrl = (range: VideoSceneRange) =>
    String(range.scene.variables.mediaType || "auto") === "gradient"
      ? ""
      : String(range.scene.variables.mediaUrl || "");
  return mediaUrl(left) !== mediaUrl(right);
}

export interface VideoFrameProps {
  kit: TemplateRegistry;
  config: Video;
  time: number;
  width: number;
  height: number;
  playing?: boolean;
  className?: string;
  style?: CSSProperties;
}

interface SceneLayerProps {
  kit: TemplateRegistry;
  config: Video;
  range: VideoSceneRange;
  progress: number;
  motionProgress: number;
  width: number;
  height: number;
  playing: boolean;
  layer: "active" | "outgoing" | "incoming";
  opacity: number;
  interactive: boolean;
  zIndex: number;
}

function SceneLayer({
  kit,
  config,
  range,
  progress,
  motionProgress,
  width,
  height,
  playing,
  layer,
  opacity,
  interactive,
  zIndex,
}: SceneLayerProps): ReactElement {
  const template = kit.getTemplate(range.scene.templateId);
  const duration = range.end - range.start;

  return (
    <div
      data-scene-layer={layer}
      data-layer-scene-id={range.scene.id}
      data-layer-template-id={range.scene.templateId}
      aria-hidden={interactive ? undefined : true}
      {...(interactive ? {} : { inert: "inert" })}
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        zIndex,
        pointerEvents: interactive ? "auto" : "none",
        // A changed-media transition can expose an incoming template's true
        // initial frame. Values that would be false placeholders at progress
        // zero opt into this inherited guard.
        "--vanillasky-transition-semantic-visibility": layer === "incoming" ? "hidden" : "visible",
      } as CSSProperties}
    >
      {template ? (
        <Suspense fallback={
          <div
            data-template-loading={range.scene.templateId}
            style={{ position: "absolute", inset: 0 }}
          />
        }>
          {createElement(template.component, {
            variables: { ...getTemplateDefaults(template.schema), ...range.scene.variables },
            style: config.style,
            progress,
            motionProgress,
            beatIntensity: 0,
            width,
            height,
            textArchetype: range.scene.textArchetype ?? config.style.defaultTextArchetype,
            backgroundEffect: range.scene.backgroundEffect ?? config.style.defaultBackgroundEffect,
            safeZone: scaleSafeZone(
              getSafeZone(config.orientation),
              resolveDensity(config.style.density).safeZoneScale,
            ),
            sceneDuration: duration,
            isPlaying: playing,
          })}
        </Suspense>
      ) : (
        <div style={{ width, height, background: "#090712", color: "#fff" }}>
          Unsupported template: {range.scene.templateId}
        </div>
      )}
    </div>
  );
}

export function VideoFrame({
  kit,
  config,
  time,
  width,
  height,
  playing = false,
  className,
  style,
}: VideoFrameProps): ReactElement {
  const timeline = resolveVideoTimeline(config);
  const lastRange = timeline.at(-1);
  const foundIndex = timeline.findIndex((range) => time >= range.start && time < range.end);
  const afterEnd = lastRange && time >= lastRange.end;
  const activeIndex = foundIndex >= 0 ? foundIndex : afterEnd ? timeline.length - 1 : -1;
  const active = activeIndex >= 0 ? timeline[activeIndex] : undefined;

  if (!active) {
    return (
      <div
        data-video-frame={timeline.length === 0 ? "empty" : "gap"}
        className={className}
        style={{ width, height, background: brandBackground(config), ...style }}
      />
    );
  }

  if (!kit.getTemplate(active.scene.templateId)) {
    return (
      <div
        data-video-frame="unsupported"
        data-template-id={active.scene.templateId}
        className={className}
        style={{ width, height, background: "#090712", color: "#fff", ...style }}
      >
        Unsupported template: {active.scene.templateId}
      </div>
    );
  }

  const duration = active.end - active.start;
  const rawProgress = clamp01((time - active.start) / duration);
  const transitionEnabled = supportsContinuousTransition(config.style.defaultTransition);
  const next = activeIndex < timeline.length - 1 ? timeline[activeIndex + 1] : undefined;
  const activeTemplate = kit.getTemplate(active.scene.templateId)!;
  const nextTemplate = next ? kit.getTemplate(next.scene.templateId) : undefined;
  const contiguousNext = next &&
    rangesAreContiguous(active, next) &&
    activeTemplate.usesGlobalTransition &&
    activeTemplate.transitionTiming &&
    nextTemplate?.usesGlobalTransition &&
    nextTemplate.transitionTiming
    ? next
    : undefined;
  const activeTiming = activeTemplate.transitionTiming;
  const nextTiming = nextTemplate?.transitionTiming;
  const eligibleNextTransition = Boolean(
    transitionEnabled &&
      contiguousNext &&
      activeTiming &&
      nextTiming &&
      sceneBackgroundChanges(active, contiguousNext),
  );
  const blendDuration = Math.min(
    SCENE_TRANSITION_SECONDS,
    Math.max(0, duration),
  );
  const blendStart = active.end - blendDuration;
  const blendEnd = blendStart + blendDuration;
  const previewingNext = Boolean(
    eligibleNextTransition && time >= blendStart && time < blendEnd,
  );
  const blendProgress = previewingNext && blendDuration > 0
    ? Math.round(clamp01((time - blendStart) / blendDuration) * 1_000_000) / 1_000_000
    : 0;
  const progress = rawProgress;
  // Body scenes own their complete 0→1 motion lifecycle so they can exit into
  // the next beat. A terminal scene has nowhere to exit to: once it reaches
  // its authored poster pose, hold that pose through the end instead of
  // fading out and then snapping back when playback stops. Raw progress still
  // reaches 1 so semantic values and background playback finish normally.
  const isFinalScene = activeIndex === timeline.length - 1;
  const motionProgress = isFinalScene && activeTiming
    ? Math.min(rawProgress, activeTiming.holdProgress)
    : rawProgress;
  const canvas = getDimensions(config.orientation);
  const scale = Math.min(width / canvas.width, height / canvas.height);
  const canvasLeft = (width - canvas.width * scale) / 2;
  const canvasTop = (height - canvas.height * scale) / 2;

  return (
    <div
      data-video-frame="ready"
      data-scene-id={active.scene.id}
      data-template-id={active.scene.templateId}
      className={className}
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        background: brandBackground(config),
        ...style,
      }}
    >
      <div
        data-video-canvas="true"
        style={{
          position: "absolute",
          left: canvasLeft,
          top: canvasTop,
          width: canvas.width,
          height: canvas.height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div
          data-player-background="brand"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: brandBackground(config),
            backgroundColor: brandBackgroundFallback(config),
            pointerEvents: "none",
          }}
        />
        {(
          previewingNext && contiguousNext && nextTiming
            ? [
            <SceneLayer
              key={active.scene.id}
              kit={kit}
              config={config}
              range={active}
              progress={progress}
              motionProgress={motionProgress}
              width={canvas.width}
              height={canvas.height}
              playing={playing}
              layer="outgoing"
              opacity={1 - blendProgress}
              interactive
              zIndex={1}
            />,
            <SceneLayer
              key={contiguousNext.scene.id}
              kit={kit}
              config={config}
              range={contiguousNext}
              progress={0}
              motionProgress={0}
              width={canvas.width}
              height={canvas.height}
              playing={false}
              layer="incoming"
              opacity={blendProgress}
              interactive={false}
              zIndex={2}
            />,
          ]
            : [
          <SceneLayer
            key={active.scene.id}
            kit={kit}
            config={config}
            range={active}
            progress={progress}
            motionProgress={motionProgress}
            width={canvas.width}
            height={canvas.height}
            playing={playing}
            layer="active"
            opacity={1}
            interactive
            zIndex={1}
          />,
        ])}
      </div>
    </div>
  );
}
