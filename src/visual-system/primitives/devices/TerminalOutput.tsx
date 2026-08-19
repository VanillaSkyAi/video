/**
 * TerminalOutput
 *
 * macOS-style terminal frame: traffic-light dots, command typewriter,
 * blinking cursor, output lines stagger in. All progress-driven.
 *
 * showcase-terminal.tsx is refactored to consume this primitive; both
 * paths render byte-identical DOM.
 */

import * as React from "react";
import { interpolate, spring, type SpringConfig } from "../../motion";
import { fitTextSize } from "../../typography";
import { TOKEN_DEFAULTS } from "../../theme";

const SPRING_TERMINAL: SpringConfig = { damping: 20, stiffness: 100 };
const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// Monospace advance width ≈ 0.60em (Menlo/SF Mono/Fira Code) + ~5% slack for
// the SVG export path, which shapes text slightly wider than the iframe.
const MONO_CHAR_RATIO = 0.63;
// Shrink-to-fit floor — below this we ellipsize instead of shrinking further.
const MONO_MIN_SCALE = 0.68;
// Fira Code first: index.html loads it deliberately for code/terminal
// templates; OS monospace fallbacks keep export close to preview.
const MONO_FONT = "'Fira Code', 'SF Mono', 'Cascadia Code', Menlo, monospace";
const CHROME_FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ─── Typed component (direct use from templates) ────────────────

export interface TerminalOutputProps {
  /** Scene progress 0→1 */
  progress: number;
  /** The command that typewrites */
  command: string;
  /** Output lines that appear after the command */
  outputLines: string[];
  /** Prompt prefix character ($, >, →) */
  promptPrefix?: string;
  /** Frame width */
  width: number;
  /** Frame height */
  height: number;
  /** Accent color for the prompt prefix. Defaults to "#00e5a0". */
  accent?: string;
  /** Beat pulse 0→1 */
  beatIntensity?: number;
}

export const TerminalOutput: React.FC<TerminalOutputProps> = ({
  progress,
  command,
  outputLines,
  promptPrefix = "$",
  width,
  height,
  accent = TOKEN_DEFAULTS.primary,
  beatIntensity = 0,
}) => {
  const s = Math.min(width, height) / 1080;

  // Terminal dimensions — fit in both orientations
  const termWidth = Math.min(width * 0.85, height * 0.55 * (16 / 9));
  const chromeHeight = 44 * s;
  const contentHeight = termWidth * (9 / 16);
  const termHeight = chromeHeight + contentHeight;
  const borderRadius = 12 * s;

  // Terminal colors
  const termBg = "#1e1e2e";
  const termText = "#cdd6f4";
  const promptColor = accent;

  // Font sizes — shrink-to-fit long lines, then ellipsize. Long commands
  // and output lines used to clip mid-token at the frame edge. fitTextSize
  // shrinks the whole block so the longest line fits; if even the floor
  // size can't hold a line, it is ellipsized explicitly.
  const contentAvailWidth = termWidth - 48 * s; // 24px padding each side
  const baseFontSize = Math.max(18, 26 * s);
  // Command line budget: prompt + space + command + trailing cursor block.
  const promptChars = promptPrefix.length + 1;
  const commandLineChars = promptChars + command.length + 1;
  const longestLineChars = outputLines.reduce(
    (m, l) => Math.max(m, l.length),
    Math.max(commandLineChars, 1),
  );
  const fontSize = fitTextSize("M".repeat(longestLineChars), baseFontSize, contentAvailWidth, {
    minScale: MONO_MIN_SCALE,
    charWidthRatio: MONO_CHAR_RATIO,
  });
  // Not at the floor → fitTextSize guarantees every line fits; skip ellipsis
  // so exact-fit lines aren't truncated by float rounding.
  const atFloor = fontSize <= baseFontSize * MONO_MIN_SCALE + 0.01;
  const maxLineChars = atFloor
    ? Math.max(4, Math.floor(contentAvailWidth / (fontSize * MONO_CHAR_RATIO)))
    : Infinity;
  const ellipsize = (l: string) =>
    l.length > maxLineChars ? `${l.slice(0, maxLineChars - 1).trimEnd()}…` : l;
  const displayCommand =
    commandLineChars > maxLineChars
      ? `${command.slice(0, Math.max(1, maxLineChars - promptChars - 2)).trimEnd()}…`
      : command;
  const displayOutputLines = outputLines.map(ellipsize);
  const lineHeight = fontSize * 1.7;

  // Slide-up animation
  const slideProgress = interpolate(progress, [0.02, 0.15], [0, 1], CLAMP);
  const springVal = spring(slideProgress, SPRING_TERMINAL);
  const termY = (1 - springVal) * 200 * s;
  const termOpacity = interpolate(slideProgress, [0, 0.08], [0, 1], CLAMP);

  // Typing animation (10%–48% of progress)
  const typeProgress = interpolate(progress, [0.1, 0.48], [0, 1], CLAMP);
  const charsVisible = Math.floor(typeProgress * displayCommand.length);
  const typedText = displayCommand.slice(0, charsVisible);
  const isTyping = typeProgress > 0 && typeProgress < 1;

  // Cursor blink — cycles every ~0.04 of progress
  const cursorCycle = Math.floor(progress * 25);
  const cursorVisible = isTyping || cursorCycle % 2 === 0;

  // Output lines (55%–88% of progress)
  const outputStartP = 0.55;
  const outputEndP = 0.88;
  const outputSlice =
    displayOutputLines.length > 0 ? (outputEndP - outputStartP) / displayOutputLines.length : 0;

  const beatScale = 1 + beatIntensity * 0.01;
  const dotSize = 12 * s;
  const dotGap = 8 * s;

  return (
    <div
      style={{
        position: "absolute",
        top: height * 0.35,
        left: (width - termWidth) / 2,
        width: termWidth,
        height: termHeight,
        transform: `translateY(${termY}px) scale(${beatScale})`,
        opacity: termOpacity,
      }}
    >
      <div
        style={{
          width: termWidth,
          height: termHeight,
          borderRadius,
          overflow: "hidden",
          position: "relative",
          boxShadow: `0 ${20 * s}px ${60 * s}px rgba(0,0,0,0.35)`,
        }}
      >
        {/* Chrome bar */}
        <div
          style={{
            width: "100%",
            height: chromeHeight,
            backgroundColor: "#313244",
            display: "flex",
            alignItems: "center",
            paddingLeft: 16 * s,
            paddingRight: 16 * s,
          }}
        >
          <div style={{ display: "flex", gap: dotGap, flexShrink: 0 }}>
            <div style={{ width: dotSize, height: dotSize, borderRadius: "50%", backgroundColor: "#ff5f57" }} />
            <div style={{ width: dotSize, height: dotSize, borderRadius: "50%", backgroundColor: "#febc2e" }} />
            <div style={{ width: dotSize, height: dotSize, borderRadius: "50%", backgroundColor: "#28c840" }} />
          </div>
          <div
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 13 * s,
              fontFamily: CHROME_FONT,
              color: "#a6adc8",
              whiteSpace: "nowrap",
            }}
          >
            Terminal
          </div>
          <div style={{ width: dotSize * 3 + dotGap * 2, flexShrink: 0 }} />
        </div>

        {/* Terminal content */}
        <div
          style={{
            width: "100%",
            height: contentHeight,
            backgroundColor: termBg,
            padding: `${20 * s}px ${24 * s}px`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize,
              lineHeight: `${lineHeight}px`,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: promptColor, fontWeight: 700 }}>{promptPrefix}</span>
            <span style={{ color: termText }}>{" "}{typedText}</span>
            <span
              style={{
                display: "inline-block",
                width: fontSize * 0.55,
                height: fontSize * 1.1,
                backgroundColor: cursorVisible ? termText : "transparent",
                verticalAlign: "text-bottom",
                marginLeft: 1,
              }}
            />
          </div>

          {displayOutputLines.map((line, i) => {
            const lineStart = outputStartP + i * outputSlice;
            const lineOpacity = interpolate(progress, [lineStart, lineStart + 0.03], [0, 1], CLAMP);
            const lineSlideY = interpolate(progress, [lineStart, lineStart + 0.05], [8 * s, 0], CLAMP);
            return (
              <div
                key={i}
                style={{
                  fontFamily: MONO_FONT,
                  fontSize,
                  lineHeight: `${lineHeight}px`,
                  color: termText,
                  opacity: lineOpacity,
                  transform: `translateY(${lineSlideY}px)`,
                  marginTop: i === 0 ? lineHeight * 0.5 : 0,
                  whiteSpace: "nowrap",
                }}
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
