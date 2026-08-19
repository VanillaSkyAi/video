import { describe, expect, it } from "vitest";
import { gradientBackground } from "../src/visual-system/scene-templates/color-utils";
import type { BackgroundFamily } from "../src/visual-system/theme";

const COLORS = {
  colorA: "#09070f",
  colorB: "#261344",
};

function backgroundAt(
  family: BackgroundFamily,
  progress: number,
  seed: number,
  sceneDuration: number,
): string {
  return gradientBackground({
    ...COLORS,
    family,
    progress,
    seed,
    sceneDuration,
  });
}

function movingCoordinates(family: BackgroundFamily, background: string): number[] {
  if (family === "wash") {
    const match = background.match(/linear-gradient\(([-\d.]+)deg/);
    if (!match) throw new Error(`Missing wash angle in ${background}`);
    return [Number(match[1])];
  }

  const positions = [...background.matchAll(/at ([-\d.]+)% ([-\d.]+)%/g)]
    .flatMap((match) => [Number(match[1]), Number(match[2])]);
  if (positions.length === 0) throw new Error(`Missing gradient positions in ${background}`);
  return positions;
}

describe("brand gradient scene-boundary continuity", () => {
  it.each<BackgroundFamily>(["mesh", "wash", "spotlight"])(
    "returns the exact same %s background at the end and start of different scenes",
    (family) => {
      expect(backgroundAt(family, 1, 1847, 5)).toBe(backgroundAt(family, 0, 9271, 8));
    },
  );

  it.each<BackgroundFamily>(["mesh", "wash", "spotlight"])(
    "keeps the last-to-first rendered-frame movement below one percentage point for %s",
    (family) => {
      const before = movingCoordinates(family, backgroundAt(family, 0.997, 1847, 5));
      const after = movingCoordinates(family, backgroundAt(family, 0.003, 9271, 8));
      expect(after).toHaveLength(before.length);
      expect(Math.max(...before.map((value, index) => Math.abs(value - after[index])))).toBeLessThan(1);
    },
  );
});
