/**
 * brand-message — single iMessage-style sent bubble over media.
 *
 * One outgoing chat message, right-aligned. Mirrors the chatMessenger
 * animation exactly: typing dots pop in (right side, iMessage blue),
 * bounce, fade out, then the message bubble pops in. No avatar, no
 * sender header, no tail — the same minimal iMessage rendering as
 * chatMessenger. The differentiator from chatMessenger is that this
 * runs ONE message over a media background, not a multi-message
 * conversation.
 *
 * Use cases: "We built this for you", "Thanks for being here",
 * "Try it free this week" — brand voice messages where you want a
 * direct, personal frame, like a single iMessage from the brand
 * dropping into the viewer's frame.
 */

import * as React from "react";
import type { SceneTemplateProps } from "./types";
import { SceneBackground, getMediaBackgroundProps } from "./scene-background";
import { stripPipe } from "../typography";
import { BrandMessageBubble } from "../primitives/typography/BrandMessageBubble";

export const BrandMessageTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  style,
  progress,
  beatIntensity,
  width,
  height,
  sceneDuration,
  isPlaying = true,
  safeZone,
  backgroundEffect,
}) => {
  /* Match chatMessenger's scaling so the bubble feels identical: the
   * 534-wide reference normalizes typography. Use the SHORT edge so
   * landscape (where width is the long edge) doesn't blow up — pure
   * width/534 = 3.6× on 1920×1080 was too big. Bump landscape by 1.3×
   * vs portrait so the bubble has more presence on a wider frame
   * without dominating it (final s ~= 2.6× on landscape vs ~2.0× on
   * portrait). */
  const brandName = stripPipe(style.brand.name ?? "Your brand");
  const message = stripPipe(String(variables.message || ""));
  const seed = (brandName + message).split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "#000",
        position: "relative",
        overflow: "hidden",
        // System fonts only — see BrandMessageBubble for the why
        // (SVG-as-image can't load @font-face data: URLs, so the only
        // way to get preview/export parity is to use a font the OS
        // already has natively).
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      {/* [slot: background] Gradient / media backdrop */}
      <SceneBackground
        style={style}
        progress={progress}
        sceneDuration={sceneDuration}
        width={width}
        height={height}
        {...getMediaBackgroundProps(variables)}
        backgroundEffect={backgroundEffect}
        seed={seed}
        isPlaying={isPlaying}
        beatIntensity={beatIntensity}
      />

      {/* [slot: hero] Bubble + typing — BrandMessageBubble primitive (the
          message is the content; no separate caption slot) */}
      <BrandMessageBubble
        progress={progress}
        sceneDuration={sceneDuration ?? 4}
        brandName={brandName}
        message={message}
        width={width}
        height={height}
        safeZone={safeZone}
      />
    </div>
  );
};
