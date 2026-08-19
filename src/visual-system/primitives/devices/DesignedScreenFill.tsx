/**
 * DesignedScreenFill — brand-tinted "designed product UI" used to fill a device
 * screen when no real screenshot is supplied.
 *
 * Two variants:
 *  - WebScreenFill   → SaaS-dashboard look (header bar + sidebar + stat cards + chart)
 *  - PhoneScreenFill → mobile-app look (status bar + header + list cards + tab bar)
 *
 * Render constraints (template rules): inline styles only, NO external images,
 * NO CSS `filter`, deterministic from `progress` (no rAF / transitions). Must
 * render identically across preview / client-SVG export / server Puppeteer.
 */

import { interpolate } from "../../motion";

// ─── Local color helpers (self-contained — no hex deps) ─────────────────────
function parseHex(hex: string): [number, number, number] | null {
  const m = String(hex).match(/^#([0-9a-f]{3,8})$/i);
  if (!m) return null;
  const h = m[1];
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  if (h.length >= 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return null;
}

function rgba(hex: string, a: number): string {
  const p = parseHex(hex);
  if (!p) return hex;
  return `rgba(${p[0]},${p[1]},${p[2]},${a})`;
}

function isDark(hex: string): boolean {
  const p = parseHex(hex);
  if (!p) return false;
  const [r, g, b] = p;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

export interface ScreenFillProps {
  /** Brand accent (primary). */
  accent: string;
  /** Brand secondary (second chart series / chips). */
  secondary: string;
  /** Brand background — decides whether the surface reads light or dark. */
  bg?: string;
  font: string;
  /** Per-template scale factor (Math.min(w,h)/1080). */
  s: number;
  /** Width of the screen area in px. */
  w: number;
  /** Height of the screen area in px. */
  h: number;
  /** Scene progress 0→1 (drives a calm chart/progress grow). */
  progress: number;
}

// Surface palette derived from whether the brand bg reads dark.
function surface(bg: string | undefined) {
  const dark = bg ? isDark(bg) : false;
  return dark
    ? {
        dark,
        page: "#15171c",
        panel: "#1e2128",
        line: "rgba(255,255,255,0.07)",
        block: "rgba(255,255,255,0.10)",
        blockSoft: "rgba(255,255,255,0.055)",
      }
    : {
        dark,
        page: "#f5f6f8",
        panel: "#ffffff",
        line: "rgba(15,20,30,0.07)",
        block: "rgba(15,20,30,0.10)",
        blockSoft: "rgba(15,20,30,0.05)",
      };
}

const stroke = (s: number, c: string) => `${Math.max(1, Math.round(1 * s))}px solid ${c}`;

// ─── Web dashboard fill ─────────────────────────────────────────────────────
export const WebScreenFill: React.FC<ScreenFillProps> = ({ accent, secondary, bg, font, s, w, h, progress }) => {
  const c = surface(bg);
  const pad = Math.round(h * 0.055);
  const headerH = Math.round(h * 0.13);
  const sidebarW = Math.round(w * 0.18);
  const grow = interpolate(progress, [0.1, 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Fixed bar heights (no Math.random — deterministic).
  const bars = [0.55, 0.78, 0.4, 0.92, 0.66, 0.84, 0.5];
  const chartH = h - headerH - pad * 2 - Math.round(h * 0.22) - Math.round(h * 0.04);

  const card = (i: number) => {
    const tint = [accent, secondary, accent][i % 3];
    return (
      <div
        key={i}
        style={{
          flex: 1,
          height: Math.round(h * 0.22),
          backgroundColor: c.panel,
          borderRadius: Math.round(12 * s),
          border: stroke(s, c.line),
          padding: Math.round(h * 0.03),
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: Math.round(8 * s) }}>
          <div style={{ width: Math.round(h * 0.05), height: Math.round(h * 0.05), borderRadius: Math.round(7 * s), backgroundColor: rgba(tint, c.dark ? 0.28 : 0.16) }} />
          <div style={{ width: "42%", height: Math.round(h * 0.018), borderRadius: 99, backgroundColor: c.blockSoft }} />
        </div>
        <div style={{ width: "62%", height: Math.round(h * 0.05), borderRadius: Math.round(5 * s), backgroundColor: c.block }} />
        <div style={{ width: "34%", height: Math.round(h * 0.016), borderRadius: 99, backgroundColor: rgba(tint, c.dark ? 0.7 : 0.55) }} />
      </div>
    );
  };

  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: c.page, fontFamily: font, display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden" }}>
      {/* Top header bar — brand accent */}
      <div
        style={{
          height: headerH,
          backgroundColor: accent,
          display: "flex",
          alignItems: "center",
          paddingLeft: pad,
          paddingRight: pad,
          gap: Math.round(10 * s),
          flexShrink: 0,
        }}
      >
        <div style={{ width: Math.round(h * 0.05), height: Math.round(h * 0.05), borderRadius: Math.round(8 * s), backgroundColor: "rgba(255,255,255,0.92)" }} />
        <div style={{ width: Math.round(w * 0.18), height: Math.round(h * 0.022), borderRadius: 99, backgroundColor: "rgba(255,255,255,0.85)" }} />
        <div style={{ flex: 1 }} />
        <div style={{ width: Math.round(w * 0.1), height: Math.round(h * 0.04), borderRadius: 99, backgroundColor: "rgba(255,255,255,0.22)" }} />
        <div style={{ width: Math.round(h * 0.06), height: Math.round(h * 0.06), borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.85)" }} />
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Sidebar */}
        <div style={{ width: sidebarW, backgroundColor: c.panel, borderRight: stroke(s, c.line), padding: pad, display: "flex", flexDirection: "column", gap: Math.round(h * 0.028), boxSizing: "border-box", flexShrink: 0 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: Math.round(8 * s) }}>
              <div style={{ width: Math.round(h * 0.032), height: Math.round(h * 0.032), borderRadius: Math.round(5 * s), backgroundColor: i === 0 ? accent : c.block }} />
              <div style={{ flex: 1, height: Math.round(h * 0.016), borderRadius: 99, backgroundColor: i === 0 ? rgba(accent, 0.55) : c.blockSoft }} />
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: pad, display: "flex", flexDirection: "column", gap: pad, minWidth: 0, boxSizing: "border-box" }}>
          <div style={{ display: "flex", gap: pad }}>{[0, 1, 2].map(card)}</div>

          {/* Chart panel */}
          <div style={{ flex: 1, backgroundColor: c.panel, borderRadius: Math.round(12 * s), border: stroke(s, c.line), padding: Math.round(h * 0.03), display: "flex", flexDirection: "column", boxSizing: "border-box", minHeight: 0 }}>
            <div style={{ width: "30%", height: Math.round(h * 0.02), borderRadius: 99, backgroundColor: c.block, marginBottom: Math.round(h * 0.03) }} />
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: Math.round(w * 0.018), minHeight: 0 }}>
              {bars.map((bh, i) => (
                <div key={i} style={{ flex: 1, height: Math.max(2, Math.round(chartH * bh * grow)), borderRadius: Math.round(4 * s), backgroundColor: i % 2 === 0 ? accent : rgba(secondary, c.dark ? 0.85 : 0.7) }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Phone app fill ──────────────────────────────────────────────────────────
export const PhoneScreenFill: React.FC<ScreenFillProps> = ({ accent, secondary, bg, font, s, w, h, progress }) => {
  const c = surface(bg);
  const pad = Math.round(w * 0.07);
  const statusH = Math.round(h * 0.04);
  const headerH = Math.round(h * 0.14);
  const grow = interpolate(progress, [0.12, 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const onAccent = "rgba(255,255,255,";

  const listItem = (i: number) => {
    const tint = [accent, secondary][i % 2];
    return (
      <div
        key={i}
        style={{
          backgroundColor: c.panel,
          borderRadius: Math.round(16 * s),
          border: stroke(s, c.line),
          padding: Math.round(w * 0.05),
          display: "flex",
          alignItems: "center",
          gap: Math.round(w * 0.045),
          boxSizing: "border-box",
        }}
      >
        <div style={{ width: Math.round(w * 0.13), height: Math.round(w * 0.13), borderRadius: Math.round(12 * s), backgroundColor: rgba(tint, c.dark ? 0.3 : 0.18), flexShrink: 0 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: Math.round(h * 0.012) }}>
          <div style={{ width: `${70 - i * 8}%`, height: Math.round(h * 0.018), borderRadius: 99, backgroundColor: c.block }} />
          <div style={{ width: `${48 - i * 4}%`, height: Math.round(h * 0.014), borderRadius: 99, backgroundColor: c.blockSoft }} />
        </div>
        <div style={{ width: Math.round(w * 0.12), height: Math.round(h * 0.026), borderRadius: 99, backgroundColor: rgba(tint, c.dark ? 0.6 : 0.5) }} />
      </div>
    );
  };

  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: c.page, fontFamily: font, display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden" }}>
      {/* Status bar */}
      <div style={{ height: statusH, display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: pad, paddingRight: pad, flexShrink: 0 }}>
        <div style={{ width: Math.round(w * 0.1), height: Math.round(h * 0.012), borderRadius: 99, backgroundColor: c.block }} />
        <div style={{ display: "flex", gap: Math.round(4 * s) }}>
          <div style={{ width: Math.round(w * 0.04), height: Math.round(h * 0.012), borderRadius: 2, backgroundColor: c.block }} />
          <div style={{ width: Math.round(w * 0.03), height: Math.round(h * 0.012), borderRadius: 2, backgroundColor: c.block }} />
        </div>
      </div>

      {/* Header — brand accent */}
      <div style={{ height: headerH, backgroundColor: accent, padding: pad, display: "flex", flexDirection: "column", justifyContent: "center", gap: Math.round(h * 0.018), flexShrink: 0 }}>
        <div style={{ width: "44%", height: Math.round(h * 0.02), borderRadius: 99, backgroundColor: `${onAccent}0.5)` }} />
        <div style={{ width: "70%", height: Math.round(h * 0.032), borderRadius: Math.round(5 * s), backgroundColor: `${onAccent}0.92)` }} />
      </div>

      {/* Highlight / progress card */}
      <div style={{ padding: pad, paddingBottom: 0 }}>
        <div style={{ backgroundColor: c.panel, borderRadius: Math.round(16 * s), border: stroke(s, c.line), padding: Math.round(w * 0.05), display: "flex", flexDirection: "column", gap: Math.round(h * 0.018), boxSizing: "border-box" }}>
          <div style={{ width: "50%", height: Math.round(h * 0.016), borderRadius: 99, backgroundColor: c.blockSoft }} />
          <div style={{ width: "100%", height: Math.round(h * 0.012), borderRadius: 99, backgroundColor: c.blockSoft, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, width: `${Math.round(grow * 72)}%`, borderRadius: 99, backgroundColor: accent }} />
          </div>
        </div>
      </div>

      {/* List items */}
      <div style={{ flex: 1, padding: pad, display: "flex", flexDirection: "column", gap: Math.round(h * 0.018), minHeight: 0 }}>
        {[0, 1, 2, 3].map(listItem)}
      </div>

      {/* Bottom tab bar */}
      <div style={{ height: Math.round(h * 0.075), backgroundColor: c.panel, borderTop: stroke(s, c.line), display: "flex", alignItems: "center", justifyContent: "space-around", flexShrink: 0 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: Math.round(w * 0.06), height: Math.round(w * 0.06), borderRadius: Math.round(7 * s), backgroundColor: i === 0 ? accent : c.block }} />
        ))}
      </div>
    </div>
  );
};
