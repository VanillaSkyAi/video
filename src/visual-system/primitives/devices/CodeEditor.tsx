/**
 * CodeEditor
 *
 * macOS-style code editor window with traffic-light dots, filename in
 * the title bar, and a syntax-highlighted snippet that fades in line by
 * line. Simple syntax coloring (keywords, strings, comments, numbers) —
 * good enough for a 6-10s video.
 *
 * showcase-code.tsx is the source; this primitive lifts the focal
 * editor frame so custom scenes can compose code reveals cleanly.
 *
 * Prop API:
 *   - progress     : scene progress 0→1 (required)
 *   - code         : raw code string; supports literal "\n" sequences (required)
 *   - filename     : title-bar filename, e.g. "app.ts" (default "app.ts")
 *   - width        : frame width (required)
 *   - height       : frame height (required)
 *   - accent       : reserved brand accent — not currently used inside the
 *                    editor (syntax palette is fixed Catppuccin-style);
 *                    kept for API parity with sibling device primitives
 *   - beatIntensity: beat pulse 0→1 (default 0)
 */

import * as React from "react";
import { interpolate, spring, type SpringConfig } from "../../motion";
import { stripPipe, fitTextSize } from "../../typography";

const SPRING_EDITOR: SpringConfig = { damping: 20, stiffness: 100 };
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

// ── Simple syntax highlighting (inlined verbatim from showcase-code.tsx) ──

interface CodeToken {
  text: string;
  color: string;
}

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "import", "export",
  "from", "async", "await", "if", "else", "for", "while", "class",
  "new", "this", "true", "false", "null", "undefined", "def", "self",
  "print", "in", "not", "and", "or", "try", "catch", "throw",
]);

function tokenizeLine(
  line: string,
  keywordColor: string,
  stringColor: string,
  commentColor: string,
  numberColor: string,
  defaultColor: string,
): CodeToken[] {
  const tokens: CodeToken[] = [];

  // Comment check (// or #)
  const commentMatch = line.match(/^(.*?)(\/\/.*|#.*)$/);
  if (commentMatch) {
    tokens.push(...tokenizeCode(commentMatch[1], keywordColor, stringColor, numberColor, defaultColor));
    tokens.push({ text: commentMatch[2], color: commentColor });
    return tokens;
  }

  return tokenizeCode(line, keywordColor, stringColor, numberColor, defaultColor);
}

function tokenizeCode(
  code: string,
  keywordColor: string,
  stringColor: string,
  numberColor: string,
  defaultColor: string,
): CodeToken[] {
  const tokens: CodeToken[] = [];
  // Match strings, numbers, words, or other characters
  const regex = /("[^"]*"|'[^']*'|`[^`]*`|\b\d+\.?\d*\b|\b\w+\b|[^\s]|\s+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(code)) !== null) {
    const t = match[0];
    if ((t.startsWith('"') || t.startsWith("'") || t.startsWith("`"))) {
      tokens.push({ text: t, color: stringColor });
    } else if (/^\d+\.?\d*$/.test(t)) {
      tokens.push({ text: t, color: numberColor });
    } else if (KEYWORDS.has(t)) {
      tokens.push({ text: t, color: keywordColor });
    } else {
      tokens.push({ text: t, color: defaultColor });
    }
  }

  return tokens;
}

// ─── Typed component ────────────────────────────────────────────

export interface CodeEditorProps {
  /** Scene progress 0→1 */
  progress: number;
  /** Code snippet — literal "\n" sequences are expanded to real newlines */
  code: string;
  /** Filename shown in the title bar (default "app.ts") */
  filename?: string;
  /** Frame width */
  width: number;
  /** Frame height */
  height: number;
  /** Reserved brand accent (not used in the syntax palette today). Defaults to "#00e5a0". */
  accent?: string;
  /** Beat pulse 0→1 */
  beatIntensity?: number;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  progress,
  code,
  filename = "app.ts",
  width,
  height,

  beatIntensity = 0,
}) => {
  const s = Math.min(width, height) / 1080;

  // NOTE: no stripPipe on the code itself — code legitimately contains `|`
  // (logical OR, shell pipes); truncating at the first pipe corrupted
  // snippets. Filename keeps the shared pipe-segment guard.
  const codeRaw = String(code || "").replace(/\\n/g, "\n");
  const filenameClean = stripPipe(String(filename || "app.ts"));
  const codeLines = codeRaw.split("\n");

  // ── Editor dimensions — fit in both orientations ──────────────
  const editorWidth = Math.min(width * 0.88, height * 0.55 * (16 / 9));
  const chromeHeight = 44 * s;
  const contentHeight = editorWidth * (9 / 16);
  const editorHeight = chromeHeight + contentHeight;
  const borderRadius = 12 * s;

  // ── Editor colors (Catppuccin-inspired) ───────────────────────
  const editorBg = "#1e1e2e";
  const chromeBg = "#313244";
  const codeDefault = "#cdd6f4";
  const keywordColor = "#cba6f7"; // purple
  const stringColor = "#a6e3a1";  // green
  const commentColor = "#6c7086"; // gray
  const numberColor = "#fab387";  // peach
  const lineNumColor = "#45475a"; // dim

  // ── Font sizes — shrink-to-fit long lines, then ellipsize ─────
  // Long AI-generated lines used to clip mid-token at the frame edge.
  // fitTextSize shrinks the whole block so the longest line fits; if even
  // the floor size can't hold a line, that line is ellipsized explicitly.
  const lineNumWidth = 40 * s;
  const codeAvailWidth = editorWidth - lineNumWidth - 16 * s;
  const baseFontSize = Math.max(16, 22 * s);
  const longestLineChars = codeLines.reduce((m, l) => Math.max(m, l.length), 1);
  const fontSize = fitTextSize("M".repeat(longestLineChars), baseFontSize, codeAvailWidth, {
    minScale: MONO_MIN_SCALE,
    charWidthRatio: MONO_CHAR_RATIO,
  });
  // Not at the floor → fitTextSize guarantees every line fits; skip ellipsis
  // so exact-fit lines aren't truncated by float rounding.
  const atFloor = fontSize <= baseFontSize * MONO_MIN_SCALE + 0.01;
  const maxLineChars = atFloor
    ? Math.max(4, Math.floor(codeAvailWidth / (fontSize * MONO_CHAR_RATIO)))
    : Infinity;
  const displayLines = codeLines.map((l) =>
    l.length > maxLineChars ? `${l.slice(0, maxLineChars - 1).trimEnd()}…` : l,
  );
  const lineHeight = fontSize * 1.7;

  // ── Slide-up animation ────────────────────────────────────────
  const slideProgress = interpolate(progress, [0.02, 0.15], [0, 1], CLAMP);
  const springVal = spring(slideProgress, SPRING_EDITOR);
  const editorY = (1 - springVal) * 200 * s;
  const editorOpacity = interpolate(slideProgress, [0, 0.08], [0, 1], CLAMP);

  // ── Code line stagger (15%–80%) ───────────────────────────────
  const lineStaggerStart = 0.15;
  const lineStaggerEnd = 0.80;
  const lineSlice = codeLines.length > 0
    ? (lineStaggerEnd - lineStaggerStart) / codeLines.length
    : 0;

  const beatScale = 1 + beatIntensity * 0.01;

  // ── Traffic light dot sizes ───────────────────────────────────
  const dotSize = 12 * s;
  const dotGap = 8 * s;

  return (
    <div
      style={{
        position: "absolute",
        top: height * 0.35,
        left: (width - editorWidth) / 2,
        width: editorWidth,
        height: editorHeight,
        transform: `translateY(${editorY}px) scale(${beatScale})`,
        opacity: editorOpacity,
      }}
    >
      <div
        style={{
          width: editorWidth,
          height: editorHeight,
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
            backgroundColor: chromeBg,
            display: "flex",
            alignItems: "center",
            paddingLeft: 16 * s,
            paddingRight: 16 * s,
          }}
        >
          {/* Traffic light dots */}
          <div style={{ display: "flex", gap: dotGap, flexShrink: 0 }}>
            <div style={{ width: dotSize, height: dotSize, borderRadius: "50%", backgroundColor: "#ff5f57" }} />
            <div style={{ width: dotSize, height: dotSize, borderRadius: "50%", backgroundColor: "#febc2e" }} />
            <div style={{ width: dotSize, height: dotSize, borderRadius: "50%", backgroundColor: "#28c840" }} />
          </div>

          {/* Filename */}
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
            {filenameClean}
          </div>

          {/* Spacer to balance dots */}
          <div style={{ width: dotSize * 3 + dotGap * 2, flexShrink: 0 }} />
        </div>

        {/* Code content */}
        <div
          style={{
            width: "100%",
            height: contentHeight,
            backgroundColor: editorBg,
            padding: `${16 * s}px 0`,
            overflow: "hidden",
          }}
        >
          {displayLines.map((line, i) => {
            const lineStart = lineStaggerStart + i * lineSlice;
            const lineOpacity = interpolate(progress, [lineStart, lineStart + 0.04], [0, 1], CLAMP);
            const lineSlideX = interpolate(progress, [lineStart, lineStart + 0.06], [12 * s, 0], CLAMP);

            const tokens = line.trim() === ""
              ? [{ text: " ", color: codeDefault }]
              : tokenizeLine(line, keywordColor, stringColor, commentColor, numberColor, codeDefault);

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  height: lineHeight,
                  opacity: lineOpacity,
                  transform: `translateX(${lineSlideX}px)`,
                }}
              >
                {/* Line number */}
                <div
                  style={{
                    width: lineNumWidth,
                    textAlign: "right",
                    paddingRight: 12 * s,
                    fontSize,
                    fontFamily: MONO_FONT,
                    color: lineNumColor,
                    lineHeight: `${lineHeight}px`,
                    flexShrink: 0,
                    userSelect: "none",
                  }}
                >
                  {i + 1}
                </div>

                {/* Code tokens */}
                <div
                  style={{
                    fontSize,
                    fontFamily: MONO_FONT,
                    lineHeight: `${lineHeight}px`,
                    whiteSpace: "pre",
                  }}
                >
                  {tokens.map((token, j) => (
                    <span key={j} style={{ color: token.color }}>
                      {token.text}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
