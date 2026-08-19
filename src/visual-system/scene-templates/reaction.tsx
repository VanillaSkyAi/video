/**
 * reaction template — short full-bleed Pexels meme/reaction clip with a
 * punchline. Differentiated from `media` so the reaction picker, the
 * `searchReactionClip` tool, and the meme-flavored search query stay
 * separate from cinematic stock footage.
 */
import type { SceneTemplateProps } from "./types";
import { resolveTokens } from "../theme";
import { TemplateText } from "./template-text";
import type { TextArchetype } from "../typography";
import { SceneBackground } from "./scene-background";

export const REACTION_TAGS = [
  "launch",
  "productLaunch",
  "goLive",
  "shipIt",
  "wow",
  "excited",
  "happy",
  "success",
  "done",
  "panic",
  "waiting",
  "celebration",
  "cheers",
  "applause",
  "highFive",
  "teamwork",
  "fail",
  "confused",
  "thinking",
  "thanks",
  "letsGo",
  "manual",
  "office",
  "meeting",
  "deadline",
  "coding",
  "debugging",
  "computer",
  "startup",
  "presentation",
  "sales",
  "growth",
  "money",
] as const;

export type ReactionTag = typeof REACTION_TAGS[number];

export const ReactionTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  motionProgress = progress,
  beatIntensity,
  width,
  height,
  textArchetype,
  safeZone,
  sceneDuration,
  isPlaying = true,
}) => {
  const { font, foreground } = resolveTokens(style);
  const color = foreground;
  const mediaUrl = String(variables.mediaUrl || "");
  const hasClip = mediaUrl.trim().length > 0;

  return (
    <div style={{ width, height, backgroundColor: "#000", position: "relative", overflow: "hidden", fontFamily: font }}>
      {/* [slot: background] Full-bleed reaction clip plus contrast scrim. */}
      <SceneBackground
        style={style}
        progress={progress}
        sceneDuration={sceneDuration}
        width={width}
        height={height}
        mediaUrl={mediaUrl}
        mediaType={hasClip ? "video" : "gradient"}
        mediaPoster={String(variables.mediaPoster || "")}
        backgroundEffect="slow-zoom-in"
        seed={String(variables.texts || "")}
        isPlaying={isPlaying}
        beatIntensity={beatIntensity}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.08) 45%, rgba(0,0,0,.5))",
          pointerEvents: "none",
        }}
      />

      {/* [slot: caption] */}
      <TemplateText
        motionProgress={motionProgress}
        typeTreatment={resolveTokens(style).preset.type}
        archetype={(textArchetype as TextArchetype) || "slam"}
        text={String(variables.texts || "Still editing manually?")}
        progress={progress}
        width={width}
        height={height}
        safeZone={safeZone}
        font={font}
        color={color}
        sceneDuration={sceneDuration ?? 3}
        beatIntensity={beatIntensity}
      />
    </div>
  );
};
