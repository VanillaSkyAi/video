import type {
  VideoBackground,
  VideoBrand,
  VideoBrandColors,
  VideoBrandInput,
  VideoBackgroundPreset,
} from "./types.js";

const BACKGROUND_PRESETS: Record<VideoBackgroundPreset, VideoBackground> = {
  cosmic: { type: "gradient", colors: ["#8711C1", "#2167E3"] },
  horizon: { type: "gradient", colors: ["#5967C4", "#133A94"] },
  twilight: { type: "gradient", colors: ["#0C1740", "#3D1B66"] },
  meadow: { type: "gradient", colors: ["#348756", "#54B6CA"] },
  velvet: { type: "gradient", colors: ["#76030F", "#121B67"] },
  flamingo: { type: "gradient", colors: ["#C72D50", "#3E3B92"] },
  peach: { type: "gradient", colors: ["#B45A4A", "#AD336D"] },
  saffron: { type: "gradient", colors: ["#F3696E", "#F8A902"] },
  black: { type: "solid", color: "#000000" },
  midnight: { type: "solid", color: "#070B20" },
  aubergine: { type: "solid", color: "#170A2E" },
  coal: { type: "solid", color: "#0A0A0A" },
  navy: { type: "solid", color: "#0A2240" },
};

const DEFAULT_BACKGROUND_PRESET: VideoBackgroundPreset = "cosmic";
const DEFAULT_COLORS: VideoBrandColors = {
  primary: "#00E5A0",
  secondary: "#006BE5",
  foreground: "#FFFFFF",
  surface: "#0A0A14",
  surfaceElevated: "#14152A",
  muted: "#A7A6B0",
};
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MINIMUM_TEXT_CONTRAST = 4.5;

function normalizeColor(value: string, path: string): string {
  if (!HEX_COLOR.test(value)) throw new Error(`${path} must be a hex color`);
  return value.toUpperCase();
}

function resolveBackground(input: VideoBrandInput["background"]): VideoBackground {
  if (input == null || typeof input === "string") {
    const preset = BACKGROUND_PRESETS[input ?? DEFAULT_BACKGROUND_PRESET];
    return preset.type === "solid"
      ? { type: "solid", color: preset.color }
      : { type: "gradient", colors: [...preset.colors] };
  }
  if ("color" in input) {
    return { type: "solid", color: normalizeColor(input.color, "brand.background.color") };
  }
  return {
    type: "gradient",
    colors: [
      normalizeColor(input.colors[0], "brand.background.colors[0]"),
      normalizeColor(input.colors[1], "brand.background.colors[1]"),
    ],
  };
}

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  return 0.2126 * channel(Number.parseInt(color.slice(1, 3), 16)) +
    0.7152 * channel(Number.parseInt(color.slice(3, 5), 16)) +
    0.0722 * channel(Number.parseInt(color.slice(5, 7), 16));
}

function gradientLuminanceAt(colors: [string, string], progress: number): number {
  const channels = colors.map((color) => [1, 3, 5].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16))) as [number[], number[]];
  return 0.2126 * channel(channels[0][0] + (channels[1][0] - channels[0][0]) * progress) +
    0.7152 * channel(channels[0][1] + (channels[1][1] - channels[0][1]) * progress) +
    0.0722 * channel(channels[0][2] + (channels[1][2] - channels[0][2]) * progress);
}

/**
 * CSS interpolates gradient stops in sRGB. Relative luminance along that ramp
 * is convex, so its maximum is at an endpoint and a deterministic ternary
 * search finds its sole interior minimum. This covers every rendered blend,
 * including an unsafe interior between individually safe endpoints.
 */
function backgroundLuminanceRange(background: VideoBackground): [number, number] {
  if (background.type === "solid") {
    const value = luminance(background.color);
    return [value, value];
  }
  const start = luminance(background.colors[0]);
  const end = luminance(background.colors[1]);
  let left = 0;
  let right = 1;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const first = left + (right - left) / 3;
    const second = right - (right - left) / 3;
    if (gradientLuminanceAt(background.colors, first) <=
      gradientLuminanceAt(background.colors, second)) {
      right = second;
    } else {
      left = first;
    }
  }
  const minimum = Math.min(start, end, gradientLuminanceAt(background.colors, (left + right) / 2));
  return [minimum, Math.max(start, end)];
}

function minimumBackgroundContrast(background: VideoBackground, foreground: string): number {
  const foregroundLuminance = luminance(foreground);
  const [minimum, maximum] = backgroundLuminanceRange(background);
  if (foregroundLuminance < minimum) {
    return (minimum + 0.05) / (foregroundLuminance + 0.05);
  }
  if (foregroundLuminance > maximum) {
    return (foregroundLuminance + 0.05) / (maximum + 0.05);
  }
  return 1;
}

function resolveForeground(
  input: VideoBrandInput | undefined,
  background: VideoBackground,
): string {
  const supplied = input?.colors?.foreground;
  if (supplied != null) return normalizeColor(supplied, "brand.colors.foreground");
  const candidates = ["#FFFFFF", "#000000"] as const;
  const foreground = candidates
    .map((color) => ({ color, contrast: minimumBackgroundContrast(background, color) }))
    .sort((left, right) => right.contrast - left.contrast)[0];
  if (foreground.contrast < MINIMUM_TEXT_CONTRAST) {
    throw new Error(
      "brand.colors.foreground is required because neither black nor white contrasts with the entire background; choose a background with one consistently readable foreground",
    );
  }
  return foreground.color;
}

function validateResolvedBrandContrast(brand: VideoBrand, path: string): void {
  const contrast = minimumBackgroundContrast(brand.background, brand.colors.foreground);
  if (contrast < MINIMUM_TEXT_CONTRAST) {
    throw new Error(
      `${path}.colors.foreground must have at least 4.5:1 contrast across ${path}.background ` +
      `(minimum ${contrast.toFixed(2)}:1); choose a different foreground or background)`,
    );
  }
}

export function resolveVideoBrand(input?: VideoBrandInput): VideoBrand {
  validateBrandInput(input, "brand");
  const background = resolveBackground(input?.background);
  const colors = Object.fromEntries(Object.entries({
    ...DEFAULT_COLORS,
    ...input?.colors,
    foreground: resolveForeground(input, background),
  }).map(([name, value]) => [name, normalizeColor(value, `brand.colors.${name}`)])) as unknown as VideoBrandColors;
  const brand: VideoBrand = {
    ...(input?.name?.trim() ? { name: input.name.trim() } : {}),
    ...(input?.logoUrl?.trim() ? { logoUrl: input.logoUrl.trim() } : {}),
    font: input?.font?.trim() || "Inter",
    scriptFont: input?.scriptFont?.trim() || "Caveat",
    background,
    colors,
  };
  validateResolvedBrandContrast(brand, "brand");
  return brand;
}

export function isBackgroundPreset(value: string): value is VideoBackgroundPreset {
  return Object.prototype.hasOwnProperty.call(BACKGROUND_PRESETS, value);
}

export function validateBrandBackgroundInput(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (!isBackgroundPreset(value)) throw new Error(`${path} preset is unsupported`);
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be a preset or custom color object`);
  }
  const background = value as Record<string, unknown>;
  const keys = Object.keys(background);
  if (keys.length !== 1 || (keys[0] !== "color" && keys[0] !== "colors")) {
    throw new Error(`${path} must contain either color or colors`);
  }
  if ("color" in background) {
    if (typeof background.color !== "string") throw new Error(`${path}.color must be a hex color`);
    normalizeColor(background.color, `${path}.color`);
    return;
  }
  if (!Array.isArray(background.colors) || background.colors.length !== 2 ||
    background.colors.some((color) => typeof color !== "string")) {
    throw new Error(`${path}.colors must contain two colors`);
  }
  background.colors.forEach((color, index) => normalizeColor(color as string, `${path}.colors[${index}]`));
}

export function validateBrandInput(value: unknown, path: string): void {
  if (value == null) return;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  const input = value as Record<string, unknown>;
  const allowed = new Set(["name", "logoUrl", "font", "scriptFont", "background", "colors"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`${path} contains unsupported field ${key}`);
  }
  for (const key of ["name", "logoUrl", "font", "scriptFont"] as const) {
    if (input[key] != null && (typeof input[key] !== "string" || !input[key].trim())) {
      throw new Error(`${path}.${key} must be a non-empty string`);
    }
  }
  if (input.background != null) validateBrandBackgroundInput(input.background, `${path}.background`);
  if (input.colors != null) {
    if (typeof input.colors !== "object" || Array.isArray(input.colors)) {
      throw new Error(`${path}.colors must be an object`);
    }
    const colors = input.colors as Record<string, unknown>;
    const colorNames = new Set(Object.keys(DEFAULT_COLORS));
    for (const [name, color] of Object.entries(colors)) {
      if (!colorNames.has(name)) throw new Error(`${path}.colors contains unsupported field ${name}`);
      if (typeof color !== "string") throw new Error(`${path}.colors.${name} must be a hex color`);
      normalizeColor(color, `${path}.colors.${name}`);
    }
  }
}

export function validateVideoBrand(value: unknown, path: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  const brand = value as Record<string, unknown>;
  const allowed = new Set(["name", "logoUrl", "font", "scriptFont", "background", "colors"]);
  for (const key of Object.keys(brand)) {
    if (!allowed.has(key)) throw new Error(`${path} contains unsupported field ${key}`);
  }
  for (const key of ["font", "scriptFont"] as const) {
    if (typeof brand[key] !== "string" || !brand[key].trim()) {
      throw new Error(`${path}.${key} must be a non-empty string`);
    }
  }
  for (const key of ["name", "logoUrl"] as const) {
    if (brand[key] != null && (typeof brand[key] !== "string" || !brand[key].trim())) {
      throw new Error(`${path}.${key} must be a non-empty string`);
    }
  }
  if (!brand.background || typeof brand.background !== "object" || Array.isArray(brand.background)) {
    throw new Error(`${path}.background must be an object`);
  }
  const background = brand.background as Record<string, unknown>;
  if (background.type === "solid") {
    if (Object.keys(background).some((key) => key !== "type" && key !== "color")) {
      throw new Error(`${path}.background contains unsupported fields`);
    }
    if (typeof background.color !== "string") throw new Error(`${path}.background.color must be a hex color`);
    normalizeColor(background.color, `${path}.background.color`);
  } else if (background.type === "gradient") {
    if (Object.keys(background).some((key) => key !== "type" && key !== "colors")) {
      throw new Error(`${path}.background contains unsupported fields`);
    }
    if (!Array.isArray(background.colors) || background.colors.length !== 2 ||
      background.colors.some((color) => typeof color !== "string")) {
      throw new Error(`${path}.background.colors must contain two colors`);
    }
    background.colors.forEach((color, index) => normalizeColor(color as string, `${path}.background.colors[${index}]`));
  } else {
    throw new Error(`${path}.background.type is unsupported`);
  }
  if (!brand.colors || typeof brand.colors !== "object" || Array.isArray(brand.colors)) {
    throw new Error(`${path}.colors must be an object`);
  }
  const colors = brand.colors as Record<string, unknown>;
  const requiredColors = Object.keys(DEFAULT_COLORS);
  for (const name of requiredColors) {
    if (typeof colors[name] !== "string") throw new Error(`${path}.colors.${name} must be a hex color`);
    normalizeColor(colors[name] as string, `${path}.colors.${name}`);
  }
  for (const name of Object.keys(colors)) {
    if (!requiredColors.includes(name)) throw new Error(`${path}.colors contains unsupported field ${name}`);
  }
  validateResolvedBrandContrast(brand as unknown as VideoBrand, path);
}
