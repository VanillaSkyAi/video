/** Export-safe color and contrast helpers shared by themes and backgrounds. */

/** Convert a 3-, 6-, or 8-digit hex color plus opacity to rgba(). */
export function withOpacity(hex: string, opacity: number): string {
  const match = hex.match(/^#([0-9a-f]{3,8})$/i);
  if (!match) return hex;

  const h = match[1];
  let r: number;
  let g: number;
  let b: number;
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length >= 6) {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    return hex;
  }
  return `rgba(${r},${g},${b},${opacity})`;
}

/** Return whether a hex color is dark enough to prefer light foreground text. */
export function isColorDark(hex: string): boolean {
  const match = hex.match(/^#([0-9a-f]{3,8})$/i);
  if (!match) return true;

  const h = match[1];
  let r: number;
  let g: number;
  let b: number;
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length >= 6) {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    return true;
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/** Order two six-digit hex colors from darker to lighter. */
export function orderDarkToLight(a: string, b: string): [string, string] {
  const luminance = (hex: string): number => {
    const match = hex.match(/^#([0-9a-f]{6})$/i);
    if (!match) return 0;
    const h = match[1];
    return (
      0.299 * parseInt(h.slice(0, 2), 16) +
      0.587 * parseInt(h.slice(2, 4), 16) +
      0.114 * parseInt(h.slice(4, 6), 16)
    );
  };
  return luminance(a) <= luminance(b) ? [a, b] : [b, a];
}

function relativeLuminance(hex: string): number | undefined {
  const match = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) return undefined;
  const value = match[1].length === 3
    ? match[1].split("").map((character) => character + character).join("")
    : match[1].slice(0, 6);
  const channel = (offset: number) => {
    const encoded = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  if (firstLuminance == null || secondLuminance == null) return 0;
  return (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);
}

/**
 * Resolve text for a solid surface without adding another semantic token.
 * A preferred semantic color wins when it is accessible; otherwise the
 * higher-contrast black/white treatment is selected deterministically.
 */
export function accessibleTextColor(background: string, preferred?: string): string {
  if (preferred && contrastRatio(background, preferred) >= 4.5) return preferred;
  return contrastRatio(background, "#FFFFFF") >= contrastRatio(background, "#000000")
    ? "#FFFFFF"
    : "#000000";
}

/** Pick a WCAG-readable light or dark text color for a background. */
export function autoTextColor(background: string): string {
  return accessibleTextColor(background);
}
