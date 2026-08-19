import type { VideoOrientation } from "../protocol/types.js";
import type { SafeZone } from "./template-context.js";

export type { SafeZone } from "./template-context.js";

export interface VideoDimensions {
  width: number;
  height: number;
  aspectRatio: string;
}

export function getDimensions(orientation: VideoOrientation = "portrait"): VideoDimensions {
  return orientation === "landscape"
    ? { width: 1920, height: 1080, aspectRatio: "16 / 9" }
    : { width: 1080, height: 1920, aspectRatio: "9 / 16" };
}

export function getSafeZone(orientation: VideoOrientation = "portrait"): SafeZone {
  return orientation === "landscape"
    ? { top: 108, bottom: 108, left: 192, right: 192 }
    : { top: 100, bottom: 100, left: 60, right: 60 };
}

export function scaleSafeZone(zone: SafeZone, factor: number): SafeZone {
  if (factor === 1) return zone;
  return {
    top: Math.round(zone.top * factor),
    bottom: Math.round(zone.bottom * factor),
    left: Math.round(zone.left * factor),
    right: Math.round(zone.right * factor),
  };
}
