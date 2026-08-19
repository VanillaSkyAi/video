/**
 * Shared text utilities. Kept intentionally small.
 */

/**
 * Return the first pipe-delimited text segment. Template variables use pipes
 * for explicit text segmentation. For values without `|` this is a no-op.
 */
export function stripPipe(text: string): string {
  const idx = text.indexOf("|");
  return idx === -1 ? text : text.slice(0, idx);
}

/**
 * Responsive font size for caption-style text — used by chart-counter to
 * size its sub-label below the big number. Mirrors the prior helper from
 * the deleted text-entrance module so behavior is preserved.
 *
 * @param text   the text to size
 * @param width  render width (1080 portrait, smaller in preview)
 * @param role   "headline" or "subtitle" — biases the curve
 * @param height optional height for proper short-edge scaling
 */
export function getResponsiveFontSize(
  text: string,
  width: number,
  role: "headline" | "subtitle" = "headline",
  height?: number,
): number {
  const s = height ? Math.min(width, height) / 1080 : width / 1080;
  const words = text.split(/\s+/).filter(Boolean).length;
  const chars = text.length;

  if (role === "subtitle") {
    if (chars > 60) return 24 * s;
    if (chars > 30) return 28 * s;
    return 32 * s;
  }

  if (words <= 2 && chars <= 12) return Math.max(36 * s, 96 * s);
  if (words <= 3 && chars <= 20) return Math.max(36 * s, 80 * s);
  if (words <= 5 && chars <= 35) return Math.max(36 * s, 64 * s);
  if (words <= 8 && chars <= 60) return Math.max(36 * s, 48 * s);
  return 36 * s;
}

/**
 * Shrink `baseFontSize` so that `text` rendered at that size fits within
 * `maxWidth` pixels on one line. Returns the original size if the text
 * already fits; otherwise scales proportionally down to `minScale × base`.
 *
 * Approach: estimate text width as `chars × fontSize × charWidthRatio`.
 * 0.55 is a safe over-estimate for Helvetica/Arial-family sans-serif at
 * normal weights — picks slightly smaller than strictly necessary so URLs
 * with wide caps (W, M) still fit. Override `charWidthRatio` for narrower
 * fonts (e.g. condensed) or wider ones (display).
 *
 * Used by templates with fixed-width containers that can overflow on long
 * AI-generated copy (URLs in cta-*, prompt text in promptInput, caller
 * name in incomingCall). Cheap, deterministic, no canvas measurement —
 * runs identically in renderToStaticMarkup and in the browser.
 */
export function fitTextSize(
  text: string,
  baseFontSize: number,
  maxWidth: number,
  opts?: { minScale?: number; charWidthRatio?: number },
): number {
  if (!text) return baseFontSize;
  const minScale = opts?.minScale ?? 0.5;
  const charWidthRatio = opts?.charWidthRatio ?? 0.55;
  const estWidth = text.length * baseFontSize * charWidthRatio;
  if (estWidth <= maxWidth) return baseFontSize;
  const scaled = (maxWidth / estWidth) * baseFontSize;
  return Math.max(scaled, baseFontSize * minScale);
}

/**
 * Compact a number for social-style counters (likes, replies, views).
 * Match TweetCard.formatCount — kept in sync. See that function for the
 * boundary-rounding rationale (never let the leading number reach 4
 * digits; 999,999 rolls up to "1M", not "1000K").
 */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs < 1_000) return `${sign}${Math.round(abs)}`;
  if (abs < 10_000) {
    const rounded = Number((abs / 1_000).toFixed(1));
    if (rounded < 10) return `${sign}${rounded.toString().replace(/\.0$/, "")}K`;
  }
  if (abs < 1_000_000) {
    const k = Math.round(abs / 1_000);
    if (k < 1_000) return `${sign}${k}K`;
  }
  if (abs < 10_000_000) {
    const rounded = Number((abs / 1_000_000).toFixed(1));
    if (rounded < 10) return `${sign}${rounded.toString().replace(/\.0$/, "")}M`;
  }
  if (abs < 1_000_000_000) {
    const m = Math.round(abs / 1_000_000);
    if (m < 1_000) return `${sign}${m}M`;
  }
  return `${sign}${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
}
