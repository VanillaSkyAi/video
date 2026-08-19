/**
 * IncomingCallCard
 *
 * The iOS-style "X is calling" UI: caller name lifts in → subtitle
 * typewrites → red Decline + green Accept buttons spring in →
 * accept gets a soft "answer me!" pulse and both icons vibrate like a
 * ringing phone. Designed to sit over a full-bleed photo / video
 * SceneBackground (left to the scene composer).
 *
 * incoming-call.tsx is the source; this primitive lifts the focal call
 * UI so custom scenes can compose incoming-call moments cleanly.
 *
 * Prop API:
 *   - progress     : scene progress 0→1 (required)
 *   - width/height : frame dimensions (required)
 *   - sceneDuration: real seconds (required) — drives the 7Hz vibration
 *                    cadence so it stays stable at any scene length
 *   - safeZone     : { top, bottom } padding (required) — keeps caller
 *                    name + buttons clear of TikTok / Reels / Shorts UI
 *   - callerName   : brand or product name shown as the caller (required)
 *   - subtitle     : smaller line below the name (default "is calling....")
 *   - declineLabel : label below the red button (default "Decline")
 *   - acceptLabel  : label below the green button (default "Accept")
 *   - textColor    : caller/subtitle/label color (default "#FFFFFF")
 *   - accent       : reserved brand accent — the iOS red/green button
 *                    colors are fixed by convention; kept for API parity
 *   - beatIntensity: beat pulse 0→1 (default 0) — feeds the accept-button
 *                    glow so it nods to the audio
 */

import * as React from "react";
import {
  interpolate,
  spring,
  SPRING_SMOOTH,
  SPRING_BOUNCY,
} from "../../motion";
import { fitTextSize, stripPipe } from "../../typography";

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/* iOS native call-button colors */
const DECLINE_RED = "#FF3B30";
const ACCEPT_GREEN = "#34C759";

/* iOS phone glyph — handset path. */
const PhoneIcon: React.FC<{ size: number; rotated: boolean }> = ({ size, rotated }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    style={{
      transform: rotated ? "rotate(135deg)" : "none",
      display: "block",
    }}
  >
    <path
      d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
      fill="#FFFFFF"
    />
  </svg>
);

// ─── Typed component ────────────────────────────────────────────

export interface IncomingCallCardProps {
  /** Scene progress 0→1 */
  progress: number;
  /** Frame width */
  width: number;
  /** Frame height */
  height: number;
  /** Real seconds — drives the vibration cadence */
  sceneDuration: number;
  /** Safe-zone padding (matches SceneTemplateProps.safeZone shape) */
  safeZone: { top: number; bottom: number };
  /** Brand / product name shown as the caller. Required. */
  callerName: string;
  /** Smaller line below the caller name. Default "is calling....". */
  subtitle?: string;
  /** Label below the red button. Default "Decline". */
  declineLabel?: string;
  /** Label below the green button. Default "Accept". */
  acceptLabel?: string;
  /** Color for caller / subtitle / button labels. Default "#FFFFFF". */
  textColor?: string;
  /** Reserved brand accent. Default "#00e5a0". */
  accent?: string;
  /** Beat pulse 0→1 — feeds accept-button glow */
  beatIntensity?: number;
}

export const IncomingCallCard: React.FC<IncomingCallCardProps> = ({
  progress,
  width,
  height,
  sceneDuration,
  safeZone,
  callerName: rawCallerName,
  subtitle: rawSubtitle = "is calling....",
  declineLabel: rawDeclineLabel = "Decline",
  acceptLabel: rawAcceptLabel = "Accept",
  textColor = "#FFFFFF",
  beatIntensity = 0,
}) => {
  const dim = Math.min(width, height);

  const callerName = stripPipe(String(rawCallerName || "Your brand"));
  const subtitle = stripPipe(String(rawSubtitle || "is calling...."));
  const declineLabel = stripPipe(String(rawDeclineLabel || "Decline"));
  const acceptLabel = stripPipe(String(rawAcceptLabel || "Accept"));

  /* ── Reveal sequence ────────────────────────────────────────── */
  const nameSpring = spring(
    interpolate(progress, [0.0, 0.10], [0, 1], CLAMP),
    SPRING_SMOOTH,
  );
  const nameOpacity = interpolate(progress, [0.0, 0.08], [0, 1], CLAMP);
  const nameY = (1 - nameSpring) * dim * 0.025;

  const subtitleStart = 0.10;
  const subtitleEnd = 0.30;
  const charsRevealed = Math.max(
    0,
    Math.floor(
      interpolate(
        progress,
        [subtitleStart, subtitleEnd],
        [0, subtitle.length],
        CLAMP,
      ),
    ),
  );
  const visibleSubtitle = subtitle.slice(0, charsRevealed);

  const declineSpring = spring(
    interpolate(progress, [0.10, 0.25], [0, 1], CLAMP),
    SPRING_BOUNCY,
  );
  const acceptSpring = spring(
    interpolate(progress, [0.13, 0.28], [0, 1], CLAMP),
    SPRING_BOUNCY,
  );

  const declineLabelOpacity = interpolate(progress, [0.10, 0.25], [0, 1], CLAMP);
  const acceptLabelOpacity = interpolate(progress, [0.13, 0.28], [0, 1], CLAMP);

  /* Vibration — kicks in once the accept button has settled (~0.28). */
  const realT = progress * sceneDuration;
  const vibrateActive = interpolate(progress, [0.28, 0.38], [0, 1], CLAMP);
  const vibrateAngle = vibrateActive * Math.sin(realT * 7 * Math.PI * 2) * 2.5;

  /* Soft "answer me!" pulse on accept on top of the vibration. */
  const acceptPulse =
    progress > 0.35
      ? 1 + 0.04 * Math.max(0, Math.sin(realT * Math.PI * 2.4))
      : 1;
  /* Beat-reactive glow on the accept button. */
  const beatGlow = 1 + beatIntensity * 0.35;

  /* ── Layout ─────────────────────────────────────────────────── */
  const topPad = Math.max(safeZone.top, height * 0.07);
  const bottomPad = Math.max(safeZone.bottom, height * 0.10);
  const callerBaseFontSize = Math.min(width * 0.16, dim * 0.13);
  const callerFontSize = fitTextSize(callerName, callerBaseFontSize, width * 0.88, {
    minScale: 0.45,
  });
  const subtitleFontSize = Math.min(width * 0.075, dim * 0.062);
  const buttonSize = Math.min(width * 0.18, dim * 0.16);
  const phoneIconSize = buttonSize * 0.46;
  const labelFontSize = Math.min(width * 0.04, dim * 0.034);
  const buttonGap = width * 0.30;
  const buttonsBottomFromBottom = bottomPad + labelFontSize * 1.6;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {/* Caller identity — one flow keeps long names clear of the subtitle. */}
      <div
        style={{
          position: "absolute",
          top: topPad,
          left: 0,
          right: 0,
          padding: `0 ${width * 0.06}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: callerFontSize * 0.45,
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: textColor,
            fontSize: callerFontSize,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: -0.5,
            opacity: nameOpacity,
            transform: `translateY(${nameY}px)`,
            textShadow: "0 2px 18px rgba(0,0,0,0.32)",
          }}
        >
          {callerName}
        </div>
        <div
          style={{
            color: textColor,
            fontSize: subtitleFontSize,
            fontWeight: 400,
            textShadow: "0 1px 12px rgba(0,0,0,0.32)",
            minHeight: subtitleFontSize * 1.4,
          }}
        >
          {visibleSubtitle}
        </div>
      </div>

      {/* Buttons + labels — bottom region */}
      <div
        style={{
          position: "absolute",
          bottom: buttonsBottomFromBottom,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "flex-end",
          gap: buttonGap,
        }}
      >
        {/* Decline (red) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: labelFontSize * 0.55 }}>
          <div
            style={{
              width: buttonSize,
              height: buttonSize,
              borderRadius: "50%",
              backgroundColor: DECLINE_RED,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `rotate(${vibrateAngle}deg) scale(${declineSpring})`,
              boxShadow: `0 ${dim * 0.012}px ${dim * 0.04}px rgba(0,0,0,0.30)`,
            }}
          >
            <PhoneIcon size={phoneIconSize} rotated />
          </div>
          <div
            style={{
              color: textColor,
              fontSize: labelFontSize,
              fontWeight: 500,
              opacity: declineLabelOpacity,
              textShadow: "0 1px 8px rgba(0,0,0,0.28)",
            }}
          >
            {declineLabel}
          </div>
        </div>

        {/* Accept (green) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: labelFontSize * 0.55 }}>
          <div
            style={{
              width: buttonSize,
              height: buttonSize,
              borderRadius: "50%",
              backgroundColor: ACCEPT_GREEN,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `rotate(${vibrateAngle}deg) scale(${acceptSpring * acceptPulse})`,
              boxShadow: `0 ${dim * 0.012}px ${dim * 0.05 * beatGlow}px rgba(52,199,89,0.45)`,
            }}
          >
            <PhoneIcon size={phoneIconSize} rotated={false} />
          </div>
          <div
            style={{
              color: textColor,
              fontSize: labelFontSize,
              fontWeight: 500,
              opacity: acceptLabelOpacity,
              textShadow: "0 1px 8px rgba(0,0,0,0.28)",
            }}
          >
            {acceptLabel}
          </div>
        </div>
      </div>
    </div>
  );
};
