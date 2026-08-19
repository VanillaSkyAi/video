/**
 * chatMessenger + chatWhatsapp — themed conversation scenes.
 *
 * ConversationThread owns bubble chrome, typing, receipts, chips, timing,
 * orientation, and export-safe emoji rendering. This template translates the
 * editable msg1..msg5 fields into the primitive's message collection.
 */

import * as React from "react";
import type { SceneTemplateProps } from "./types";
import { normalizeTextVar } from "./normalize-var";
import { ConversationThread } from "../primitives/social/ConversationThread";

const DEFAULT_SIDES: Record<number, "left" | "right"> = {
  1: "left",
  2: "right",
  3: "left",
  4: "right",
  5: "right",
};

export function buildConversationMessages(variables: Record<string, unknown>) {
  const messages: Array<{ author: string; text: string; side: "left" | "right" }> = [];
  for (let index = 1; index <= 5; index += 1) {
    let text = normalizeTextVar(variables[`msg${index}`]).trim();
    if (!text) continue;
    let side = DEFAULT_SIDES[index] ?? (index % 2 === 1 ? "left" : "right");
    if (text.endsWith("|in")) {
      side = "left";
      text = text.slice(0, -3).trim();
    } else if (text.endsWith("|out")) {
      side = "right";
      text = text.slice(0, -4).trim();
    }
    messages.push({ author: side === "left" ? "Customer" : "You", text, side });
  }
  return messages;
}

export const SocialConversationTemplate: React.FC<SceneTemplateProps> = ({
  variables,
  progress,
  beatIntensity,
  width,
  height,
  sceneDuration,
  safeZone,
}) => {
  const theme = String(variables.theme || "messenger").toLowerCase() === "whatsapp"
    ? "whatsapp"
    : "messenger";

  return (
    <div style={{ width, height, position: "relative", overflow: "hidden", backgroundColor: theme === "whatsapp" ? "#EFE7DC" : "#ffffff" }}>
      {/* [slot: hero] ConversationThread includes the theme-specific canvas. */}
      <ConversationThread
        progress={progress}
        width={width}
        height={height}
        sceneDuration={sceneDuration ?? 8}
        messages={buildConversationMessages(variables)}
        theme={theme}
        dateChip1={String(variables.dateChip1 || "")}
        dateChip2={String(variables.dateChip2 || "")}
        safeZoneTop={Math.max(safeZone.top, height * 0.08)}
        beatIntensity={beatIntensity}
      />
    </div>
  );
};
