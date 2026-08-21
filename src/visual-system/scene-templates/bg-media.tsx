/**
 * bg-media template — atmospheric scene backed by a photo, video, or
 * brand-color gradient. Title sits centered over the backdrop.
 *
 * The "media template" identity is just a positioning convention: title
 * is centered, full-frame, and there's no other UI competing for the
 * stage. The backdrop logic itself lives in SceneBackground, getMediaBackgroundProps, which any
 * template can compose to opt into media support.
 *
 * mediaType modes:
 *   - "auto" (default) — detect photo/video from URL extension (.mp4/.webm/.mov = video)
 *   - "photo"          — force CSS background-image
 *   - "video"          — force <video> element with playback sync
 *   - "gradient"       — deliberate atmospheric brand-color scene; mediaUrl ignored
 */
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { TemplateText } from "./template-text";
import type { TextArchetype } from "../typography";
import { SceneBackground, getMediaBackgroundProps, hasSceneMedia } from "./scene-background";
import { ConfettiLayer } from "./confetti-layer";

// ─── Component ──────────────────────────────────────────────────

export const BgMediaTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  motionProgress = progress,
  beatIntensity,
  width,
  height,
  textArchetype,
  backgroundEffect,
  safeZone,
  sceneDuration,
  isPlaying = true,
}) => {
  const { font, foreground, background } = resolveTokens(style);
  const text = foreground;

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "#000",
        position: "relative",
        overflow: "hidden",
        fontFamily: font,
      }}
    >
      {/* [slot: background] */}
      <SceneBackground
        style={style}
        progress={progress}
        sceneDuration={sceneDuration}
        width={width}
        height={height}
        {...getMediaBackgroundProps(variables)}
        // Title is centered and full-frame, so the lower-third scrim would
        // darken picture no type ever touches. Scrim the middle only.
        textAnchor="center"
        backgroundEffect={backgroundEffect}
        seed={String(variables.texts || "")}
        isPlaying={isPlaying}
        beatIntensity={beatIntensity}
      />

      {/* [slot: badge] Optional celebration layer on top of the backdrop.
          Toggle via the `confetti` variable. Hue-filtered against the brand
          gradient when no media is set; full palette over photos/videos. */}
      {variables.confetti === true && (
        <ConfettiLayer
          progress={motionProgress}
          width={width}
          height={height}
          beatIntensity={beatIntensity}
          bgColor={String(variables.mediaUrl || "").trim() === ""
            ? (background.type === "solid" ? background.color : background.colors[1])
            : undefined}
        />
      )}

      {/* [slot: caption] Centered title — bg-media's distinguishing positioning.
          `|` = hard line break; the conversion is centralized in
          TemplateText so every texts-canvas template honors it. */}
      <TemplateText
        overMedia={hasSceneMedia(variables)}
        motionProgress={motionProgress}
        typeTreatment={resolveTokens(style).preset.type}
        archetype={(textArchetype as TextArchetype) ?? "subtle"}
        text={String(variables.texts ?? "")}
        progress={progress}
        sceneDuration={sceneDuration ?? 3}
        width={width}
        height={height}
        position="center"
        sizeRole="headline"
        safeZone={safeZone}
        font={font}
        color={text}
        beatIntensity={beatIntensity}
      />
    </div>
  );
};
