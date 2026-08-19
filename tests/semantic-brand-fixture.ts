import type { VideoBrand, VideoStyle } from "../src/index";

export const TEST_VIDEO_BRAND = {
  font: "Inter",
  scriptFont: "Caveat",
  background: { type: "gradient", colors: ["#8711C1", "#2167E3"] },
  colors: {
    primary: "#6D5EF5",
    secondary: "#17122F",
    foreground: "#FFFFFF",
    surface: "#090712",
    surfaceElevated: "#231B42",
    muted: "#A7A6B0",
  },
} satisfies VideoBrand;

export const TEST_VIDEO_STYLE = {
  brand: TEST_VIDEO_BRAND,
} satisfies VideoStyle;
