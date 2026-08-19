/**
 * ConversationThread — multi-bubble chat thread with staggered reveal,
 * typing indicators, and (for WhatsApp) animated read receipts.
 *
 * Lifted from `social-conversation.tsx`. The primitive owns:
 *   - the centered chat column (full-width portrait / ~72% landscape)
 *   - per-message typing → bubble pop sequence
 *   - WhatsApp tick state progression (clock → sent → delivered → read)
 *   - optional date chips inserted between specific messages
 *   - the WhatsApp compose bar (decorative — drawn 1:1 from the source)
 *
 * It does NOT own a SceneBackground gradient/media or a headline overlay.
 * The primitive fills its own backdrop with the theme background color so
 * the bubbles always have correct contrast; if a caller wants the scene
 * gradient to show through, drop this primitive on top of a SceneBackground.
 *
 * The source template parses messages from `msg1..msg5` variables plus a
 * `|in`/`|out` suffix override. This primitive accepts the already-parsed
 * `messages` array so callers can pre-split however they like.
 *
 * Local helpers (`easeOutBack`, `tickStateAt`, `timingForCount`) are
 * inlined because the source defined them locally; they are not exported.
 *
 * Props:
 *  - progress      — scene progress 0..1
 *  - width / height — frame dimensions
 *  - sceneDuration — seconds; drives the 1.5 Hz typing-dot ripple in real time
 *  - messages      — array of `{ author, text, side }`. `author` is
 *                    decorative (not rendered in either theme today) but
 *                    accepted so callers don't lose data when round-tripping.
 *  - theme         — "whatsapp" or "messenger" (iMessage). Default "whatsapp".
 *  - safeZoneTop   — top inset to clear the social overlay UI. Default 8% of height.
 *  - accent        — brand accent (kept for parity; today's chrome is locked
 *                    to WhatsApp/iMessage native palettes for realism)
 *  - beatIntensity — accepted for parity; not currently applied
 */

import * as React from "react";
import { interpolate } from "../../motion";
import { stripPipe } from "../../typography";
import { renderWithEmoji } from "../../emoji/emoji-text";

const CLAMP = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

/* Reference timeline length — every reveal time is a fraction of this. */
const REF_DURATION = 16;

/* easeOutBack — same overshoot curve the source uses for pop-ins. */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/* WhatsApp palette */
const WA = {
  bg: "#EFE7DC",
  incomingBubble: "#FFFFFF",
  outgoingBubble: "#D9F4C7",
  text: "#0E0E0E",
  textMuted: "#6E6E73",
  accent: "#0A8F76",
  chipBg: "#F1E9D8",
  chipText: "#3C342A",
  navBg: "#F1E9DA",
  inputBg: "#FFFFFF",
  inputBorder: "rgba(0,0,0,0.06)",
  outgoingTime: "#5C6B4E",
};

/* iMessage palette */
const IM = {
  bg: "#ffffff",
  bubbleOut: "#007AFF",
  bubbleIn: "#E9E9EB",
  textOut: "#ffffff",
  textIn: "#000000",
  dotsColor: "#8E8E93",
};

interface InternalMessage {
  side: "left" | "right";
  text: string;
  author: string;
  typingStart: number;
  bubbleStart: number;
  time: string;
}

/* WhatsApp reference timing — mirrors source 5-message cadence. */
const WA_TIMING_5: Array<{ typingStart: number; bubbleStart: number; time: string }> = [
  { typingStart: 0.6, bubbleStart: 1.4, time: "21:54" },
  { typingStart: 2.2, bubbleStart: 3.0, time: "21:55" },
  { typingStart: 3.8, bubbleStart: 4.8, time: "21:56" },
  { typingStart: 6.2, bubbleStart: 7.2, time: "12:35" },
  { typingStart: 10.0, bubbleStart: 11.0, time: "11:17" },
];

function timingForCount(count: number): Array<{ typingStart: number; bubbleStart: number; time: string }> {
  if (count >= 5) return WA_TIMING_5.slice(0, count);
  const slot = 12 / count;
  const out: Array<{ typingStart: number; bubbleStart: number; time: string }> = [];
  for (let i = 0; i < count; i++) {
    const start = 0.6 + i * slot;
    out.push({
      typingStart: start,
      bubbleStart: start + slot * 0.5,
      time: WA_TIMING_5[Math.min(i, 4)].time,
    });
  }
  return out;
}

/* Read-receipt phases (WhatsApp). */
type TickState = "clock" | "sent" | "delivered" | "read";

function tickStateAt(refTimeSinceSent: number): TickState {
  if (refTimeSinceSent < 0.5) return "clock";
  if (refTimeSinceSent < 1.1) return "sent";
  if (refTimeSinceSent < 1.8) return "delivered";
  return "read";
}

const ClockIcon: React.FC<{ s: number }> = ({ s }) => (
  <svg width={12 * s} height={12 * s} viewBox="0 0 12 12" style={{ marginLeft: 4 * s }}>
    <circle cx="6" cy="6" r="5" fill="none" stroke="#8C8C92" strokeWidth="1.2" />
    <path d="M6 3 v3.5 l2 1" stroke="#8C8C92" strokeWidth="1.2" fill="none" strokeLinecap="round" />
  </svg>
);

const Ticks: React.FC<{ state: TickState; s: number }> = ({ state, s }) => {
  if (state === "clock") return <ClockIcon s={s} />;
  const color = state === "read" ? "#53BDEB" : "#8C8C92";
  return (
    <svg width={16 * s} height={11 * s} viewBox="0 0 16 11" style={{ marginLeft: 4 * s }}>
      <path
        d="M1 6 l3 3 l6 -7"
        stroke={color}
        strokeWidth={1.3}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={state === "sent" ? 0 : 1}
      />
      <path
        d="M5 6 l3 3 l7 -8"
        stroke={color}
        strokeWidth={1.3}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const ComposeBar: React.FC<{ s: number }> = ({ s }) => {
  const stroke = "#1A1A1A";
  return (
    <div
      style={{
        background: WA.navBg,
        borderTop: "1px solid rgba(0,0,0,0.05)",
        padding: `${10 * s}px ${14 * s}px ${12 * s}px`,
        display: "flex",
        alignItems: "center",
        gap: 14 * s,
      }}
    >
      <svg width={30 * s} height={30 * s} viewBox="0 0 30 30" style={{ flexShrink: 0 }}>
        <path d="M15 5 v20 M5 15 h20" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <div
        style={{
          flex: 1,
          height: 40 * s,
          background: WA.inputBg,
          borderRadius: 22 * s,
          position: "relative",
          border: `0.5px solid ${WA.inputBorder}`,
        }}
      >
        <div
          style={{
            position: "absolute",
            right: 12 * s,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={28 * s} height={28 * s} viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
            <path
              d="M3 5 a2 2 0 0 1 2 -2 h10 a2 2 0 0 1 2 2 v6 l-6 6 h-6 a2 2 0 0 1 -2 -2 z M17 11 a4 4 0 0 0 -4 4 v2"
              stroke="#555"
              strokeWidth="1.5"
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
      <svg width={28 * s} height={24 * s} viewBox="0 0 28 24" fill="none" style={{ flexShrink: 0 }}>
        <path
          d="M3 6 h5 l2 -3 h8 l2 3 h5 a1 1 0 0 1 1 1 v14 a1 1 0 0 1 -1 1 h-22 a1 1 0 0 1 -1 -1 v-14 a1 1 0 0 1 1 -1 z"
          stroke={stroke}
          strokeWidth="1.6"
          fill="none"
          strokeLinejoin="round"
        />
        <circle cx="14" cy="14" r="4.5" stroke={stroke} strokeWidth="1.6" fill="none" />
      </svg>
      <svg width={20 * s} height={26 * s} viewBox="0 0 20 26" fill="none" style={{ flexShrink: 0 }}>
        <rect x="7" y="2" width="6" height="13" rx="3" stroke={stroke} strokeWidth="1.6" fill="none" />
        <path
          d="M3 12 a7 7 0 0 0 14 0 M10 19 v4 M7 23 h6"
          stroke={stroke}
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

const TypingBubble: React.FC<{
  side: "left" | "right";
  pop: number;
  realTimeSeconds: number;
  s: number;
  theme: "whatsapp" | "messenger";
}> = ({ side, pop, realTimeSeconds, s, theme }) => {
  if (pop <= 0) return null;
  const isOut = side === "right";
  const isWA = theme === "whatsapp";
  const dotColor = isWA ? (isOut ? "#6B8A55" : "#8C8C92") : IM.dotsColor;
  const bg = isWA
    ? isOut
      ? WA.outgoingBubble
      : WA.incomingBubble
    : isOut
      ? IM.bubbleOut
      : IM.bubbleIn;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isOut ? "flex-end" : "flex-start",
        padding: `${2 * s}px ${(isWA ? 10 : 14) * s}px`,
        opacity: pop,
        transform: `scale(${0.9 + 0.1 * pop})`,
        transformOrigin: isOut ? "right bottom" : "left bottom",
      }}
    >
      <div
        style={{
          background: bg,
          borderRadius: (isWA ? 14 : 18) * s,
          ...(isWA
            ? {
                borderTopLeftRadius: isOut ? 14 * s : 2 * s,
                borderTopRightRadius: isOut ? 2 * s : 14 * s,
              }
            : {}),
          padding: `${(isWA ? 10 : 12) * s}px ${(isWA ? 12 : 16) * s}px`,
          display: "flex",
          gap: 5 * s,
          alignItems: "center",
          ...(isWA
            ? { boxShadow: `0 ${1 * s}px ${1 * s}px rgba(0,0,0,0.06)` }
            : {}),
        }}
      >
        {[0, 1, 2].map((i) => {
          const phase = (realTimeSeconds * 1.6 + i * 0.2) % 1;
          const y = Math.sin(phase * Math.PI * 2) * 2.5 * s;
          const op = 0.45 + 0.55 * Math.max(0, Math.sin(phase * Math.PI));
          const dotSize = isWA ? 6 * s : 7 * s;
          return (
            <div
              key={i}
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                background: dotColor,
                transform: `translateY(${-y}px)`,
                opacity: op,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

const DateChip: React.FC<{ label: string; chipProgress: number; s: number }> = ({
  label,
  chipProgress,
  s,
}) => {
  if (chipProgress <= 0) return null;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        margin: `${12 * s}px 0 ${8 * s}px`,
        opacity: chipProgress,
        transform: `scale(${0.88 + 0.12 * chipProgress})`,
      }}
    >
      <div
        style={{
          background: WA.chipBg,
          color: WA.chipText,
          padding: `${7 * s}px ${16 * s}px`,
          borderRadius: 9 * s,
          fontSize: 17 * s,
          fontWeight: 600,
          boxShadow: `0 ${1 * s}px ${1.5 * s}px rgba(0,0,0,0.05)`,
        }}
      >
        {label}
      </div>
    </div>
  );
};

const IncomingBubble: React.FC<{
  children: React.ReactNode;
  time: string;
  pop: number;
  s: number;
}> = ({ children, time, pop, s }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "flex-start",
      padding: `${2 * s}px ${10 * s}px`,
      opacity: pop,
      transform: `translateY(${(1 - pop) * 6 * s}px) scale(${0.97 + 0.03 * pop})`,
      transformOrigin: "left bottom",
    }}
  >
    <div
      style={{
        maxWidth: "82%",
        background: WA.incomingBubble,
        borderRadius: 10 * s,
        borderTopLeftRadius: 2 * s,
        padding: `${12 * s}px ${16 * s}px ${11 * s}px`,
        fontSize: 23 * s,
        lineHeight: `${29 * s}px`,
        color: WA.text,
        boxShadow: `0 ${1 * s}px ${1 * s}px rgba(0,0,0,0.06)`,
        position: "relative",
      }}
    >
      <div style={{ paddingRight: 64 * s }}>{children}</div>
      <div
        style={{
          position: "absolute",
          right: 14 * s,
          bottom: 8 * s,
          fontSize: 15 * s,
          color: WA.textMuted,
        }}
      >
        {time}
      </div>
    </div>
  </div>
);

const OutgoingBubble: React.FC<{
  children: React.ReactNode;
  time: string;
  tickState: TickState;
  pop: number;
  s: number;
}> = ({ children, time, tickState, pop, s }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "flex-end",
      padding: `${2 * s}px ${10 * s}px`,
      opacity: pop,
      transform: `translateY(${(1 - pop) * 8 * s}px) scale(${0.96 + 0.04 * pop})`,
      transformOrigin: "right bottom",
    }}
  >
    <div
      style={{
        maxWidth: "82%",
        background: WA.outgoingBubble,
        borderRadius: 10 * s,
        borderTopRightRadius: 2 * s,
        padding: `${12 * s}px ${16 * s}px ${11 * s}px`,
        fontSize: 23 * s,
        lineHeight: `${29 * s}px`,
        color: WA.text,
        boxShadow: `0 ${1 * s}px ${1 * s}px rgba(0,0,0,0.06)`,
        position: "relative",
      }}
    >
      <div style={{ paddingRight: 88 * s }}>{children}</div>
      <div
        style={{
          position: "absolute",
          right: 14 * s,
          bottom: 8 * s,
          fontSize: 15 * s,
          color: WA.outgoingTime,
          display: "flex",
          alignItems: "center",
        }}
      >
        {time}
        <Ticks state={tickState} s={s} />
      </div>
    </div>
  </div>
);

const CHIP_TIMING = {
  monday: { start: 5.8, end: 6.2 },
  yesterday: { start: 9.6, end: 10.0 },
};

export interface ConversationThreadProps {
  progress: number;
  width: number;
  height: number;
  sceneDuration: number;
  messages: Array<{ author: string; text: string; side: "left" | "right" }>;
  theme?: "whatsapp" | "messenger";
  /** Optional date chips inserted before specific message indices.
   *  Default behavior matches the source: chip1 before message 4 (index 3),
   *  chip2 before message 5 (index 4). Leave blank to suppress. */
  dateChip1?: string;
  dateChip2?: string;
  safeZoneTop?: number;
  accent?: string;
  beatIntensity?: number;
}

export const ConversationThread: React.FC<ConversationThreadProps> = ({
  progress,
  width,
  height,
  sceneDuration,
  messages: rawMessages,
  theme = "whatsapp",
  dateChip1 = "",
  dateChip2 = "",
  safeZoneTop,
}) => {
  const isLandscape = width > height;
  const colWidth = isLandscape ? width * 0.72 : width;
  const colLeft = (width - colWidth) / 2;
  const s = Math.min(width, height) / 534;
  const isWhatsApp = theme === "whatsapp";

  // Apply stripPipe + attach timing
  const sanitized = rawMessages
    .map((m) => ({ ...m, text: stripPipe(m.text || "").trim() }))
    .filter((m) => m.text.length > 0);
  const timing = timingForCount(Math.max(1, sanitized.length));
  const messages: InternalMessage[] = sanitized.map((m, i) => ({
    side: m.side,
    text: m.text,
    author: m.author,
    typingStart: timing[i].typingStart,
    bubbleStart: timing[i].bubbleStart,
    time: timing[i].time,
  }));

  const realTimeSeconds = progress * sceneDuration;
  const refT = progress * REF_DURATION;
  const topPad = safeZoneTop != null ? safeZoneTop : height * 0.08;

  const chip1Label = stripPipe(dateChip1 || "").trim();
  const chip2Label = stripPipe(dateChip2 || "").trim();

  const popIn = (t: number, start: number, dur = 0.4): number => {
    if (t <= start) return 0;
    if (t >= start + dur) return 1;
    return easeOutBack((t - start) / dur);
  };

  const ramp = (t: number, start: number, end: number): number => {
    if (t <= start) return 0;
    if (t >= end) return 1;
    return (t - start) / (end - start);
  };

  if (isWhatsApp) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: WA.bg,
          overflow: "hidden",
          fontFamily: '-apple-system, "SF Pro Text", system-ui',
        }}
      >
        <div
          style={{
            position: "absolute",
            left: colLeft,
            width: colWidth,
            top: 0,
            height,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2 * s,
                padding: `${topPad}px 0 ${10 * s}px`,
              }}
            >
              {messages.map((msg, i) => {
                const typingPop = popIn(refT, msg.typingStart, 0.25);
                const typingFade = interpolate(
                  refT,
                  [msg.bubbleStart - 0.1, msg.bubbleStart],
                  [1, 0],
                  CLAMP,
                );
                const showTyping = refT >= msg.typingStart && refT < msg.bubbleStart;
                const bubblePop = popIn(refT, msg.bubbleStart, 0.4);
                const showBubble = refT >= msg.bubbleStart;
                const isOut = msg.side === "right";

                const refSinceSent = refT - msg.bubbleStart - 0.4;
                const tickState = isOut ? tickStateAt(Math.max(0, refSinceSent)) : "read";

                const chipBeforeThis: { label: string; progress: number } | null = (() => {
                  if (i === 3 && chip1Label) {
                    return {
                      label: chip1Label,
                      progress: ramp(refT, CHIP_TIMING.monday.start, CHIP_TIMING.monday.end),
                    };
                  }
                  if (i === 4 && chip2Label) {
                    return {
                      label: chip2Label,
                      progress: ramp(refT, CHIP_TIMING.yesterday.start, CHIP_TIMING.yesterday.end),
                    };
                  }
                  return null;
                })();

                return (
                  <React.Fragment key={i}>
                    {chipBeforeThis && (
                      <DateChip
                        label={chipBeforeThis.label}
                        chipProgress={chipBeforeThis.progress}
                        s={s}
                      />
                    )}

                    {showTyping && (
                      <div style={{ opacity: typingPop * typingFade }}>
                        <TypingBubble
                          side={msg.side}
                          pop={typingPop}
                          realTimeSeconds={realTimeSeconds}
                          s={s}
                          theme="whatsapp"
                        />
                      </div>
                    )}

                    {showBubble &&
                      (isOut ? (
                        <OutgoingBubble pop={bubblePop} time={msg.time} tickState={tickState} s={s}>
                          {renderWithEmoji(msg.text, 23 * s)}
                        </OutgoingBubble>
                      ) : (
                        <IncomingBubble pop={bubblePop} time={msg.time} s={s}>
                          {renderWithEmoji(msg.text, 23 * s)}
                        </IncomingBubble>
                      ))}
                  </React.Fragment>
                );
              })}

              <div style={{ height: 12 * s }} />
            </div>
          </div>

          <ComposeBar s={s} />
        </div>
      </div>
    );
  }

  // iMessage render
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: IM.bg,
        overflow: "hidden",
        fontFamily: "-apple-system, 'SF Pro', 'Helvetica Neue', Helvetica, Arial, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: colLeft,
          width: colWidth,
          top: 0,
          height,
          padding: `${topPad}px 0 ${20 * s}px`,
          display: "flex",
          flexDirection: "column",
          gap: 4 * s,
        }}
      >
        {messages.map((msg, i) => {
          const typingPop = popIn(refT, msg.typingStart, 0.25);
          const typingFade = interpolate(
            refT,
            [msg.bubbleStart - 0.1, msg.bubbleStart],
            [1, 0],
            CLAMP,
          );
          const showTyping = refT >= msg.typingStart && refT < msg.bubbleStart;
          const bubblePop = popIn(refT, msg.bubbleStart, 0.4);
          const showBubble = refT >= msg.bubbleStart;
          const isOut = msg.side === "right";

          return (
            <React.Fragment key={i}>
              {showTyping && (
                <div style={{ opacity: typingPop * typingFade }}>
                  <TypingBubble
                    side={msg.side}
                    pop={typingPop}
                    realTimeSeconds={realTimeSeconds}
                    s={s}
                    theme="messenger"
                  />
                </div>
              )}

              {showBubble && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: isOut ? "flex-end" : "flex-start",
                    padding: `${2 * s}px ${14 * s}px`,
                    opacity: bubblePop,
                    transform: `translateY(${(1 - bubblePop) * 8 * s}px) scale(${0.96 + 0.04 * bubblePop})`,
                    transformOrigin: isOut ? "right bottom" : "left bottom",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "75%",
                      background: isOut ? IM.bubbleOut : IM.bubbleIn,
                      color: isOut ? IM.textOut : IM.textIn,
                      borderRadius: 22 * s,
                      padding: `${12 * s}px ${18 * s}px`,
                      fontSize: 23 * s,
                      lineHeight: `${29 * s}px`,
                    }}
                  >
                    {renderWithEmoji(msg.text, 23 * s)}
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
