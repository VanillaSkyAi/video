// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  getMediaTreatmentLayers,
  hasSceneMedia,
} from "../src/visual-system/scene-templates/scene-background";
import { BgMediaTemplate } from "../src/visual-system/scene-templates/bg-media";
import { MEDIA_TEXT_SHADOW } from "../src/visual-system/theme";
import { TEST_VIDEO_STYLE as style } from "./semantic-brand-fixture";

const TREATMENTS = ["subtle", "cinematic", "text-safe"];

function alphaStops(background: string): number[] {
  return [...background.matchAll(/rgba\(0,0,0,([\d.]+)\)/g)].map((m) =>
    Number(m[1]),
  );
}

function render(variables: Record<string, unknown>): string {
  return renderToStaticMarkup(
    createElement(BgMediaTemplate, {
      variables,
      style,
      progress: 0.5,
      beatIntensity: 0,
      width: 1080,
      height: 1920,
      safeZone: { top: 100, right: 60, bottom: 100, left: 60 },
      sceneDuration: 4,
      isPlaying: false,
    }),
  );
}

describe("media scrims", () => {
  it("ramps every scrim off an eased curve rather than a two-stop linear fade", () => {
    for (const treatment of TREATMENTS) {
      for (const layer of getMediaTreatmentLayers(treatment)) {
        const stops = alphaStops(layer.background);
        // A linear fade is two stops. An eased ramp needs the intermediate
        // samples that keep the fade-out from ending on a visible band.
        expect(stops.length, `${treatment}/${layer.id}`).toBeGreaterThanOrEqual(6);

        // Smoothstep is flat at both ends: the steepest step sits in the
        // middle of the ramp, never at its start or end.
        const deltas = stops
          .slice(1)
          .map((value, index) => Math.abs(value - stops[index]));
        const steepest = deltas.indexOf(Math.max(...deltas));
        expect(steepest, `${treatment}/${layer.id}`).toBeGreaterThan(0);
        expect(steepest, `${treatment}/${layer.id}`).toBeLessThan(
          deltas.length - 1,
        );
      }
    }
  });

  it("shapes the scrim to the copy instead of washing the whole frame", () => {
    const centered = getMediaTreatmentLayers("text-safe", "center");
    expect(centered.map((layer) => layer.id)).toEqual([
      "vignette",
      "center-scrim",
    ]);

    const lower = getMediaTreatmentLayers("text-safe", "bottom");
    expect(lower.map((layer) => layer.id)).toEqual(["vignette", "bottom-scrim"]);

    // No recipe may darken the entire frame uniformly.
    for (const treatment of TREATMENTS) {
      for (const layer of getMediaTreatmentLayers(treatment)) {
        expect(layer.background).toMatch(/gradient\(/);
      }
    }
  });

  it("keeps the media halo on type over footage and off type over gradients", () => {
    expect(hasSceneMedia({ mediaUrl: "https://cdn.test/a.jpg" })).toBe(true);
    expect(
      hasSceneMedia({ mediaUrl: "https://cdn.test/a.jpg", mediaType: "gradient" }),
    ).toBe(false);

    const overPhoto = render({
      texts: "Legible",
      mediaUrl: "https://cdn.test/a.jpg",
    });
    expect(overPhoto).toContain(MEDIA_TEXT_SHADOW);
    expect(overPhoto).not.toContain('data-media-overlay="bottom-scrim"');

    const overGradient = render({ texts: "Legible", mediaType: "gradient" });
    expect(overGradient).not.toContain(MEDIA_TEXT_SHADOW);
  });
});

interface StubProbe {
  succeed: () => void;
  fail: () => void;
}

/** Stand in for the photo probe: jsdom does not fetch, so tests drive it. */
function stubImageProbe(): StubProbe[] {
  const probes: StubProbe[] = [];
  class ProbeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    complete = false;
    naturalWidth = 0;
    set src(_value: string) {
      probes.push({
        succeed: () => this.onload?.(),
        fail: () => this.onerror?.(),
      });
    }
  }
  globalThis.Image = ProbeImage as unknown as typeof Image;
  return probes;
}

function mountBgMedia(
  root: { render: (node: ReturnType<typeof createElement>) => void },
  variables: Record<string, unknown>,
): void {
  root.render(
    createElement(BgMediaTemplate, {
      variables,
      style,
      progress: 0.5,
      beatIntensity: 0,
      width: 1080,
      height: 1920,
      safeZone: { top: 100, right: 60, bottom: 100, left: 60 },
      sceneDuration: 4,
      isPlaying: false,
    }),
  );
}

describe("media that never paints", () => {
  // React requires this flag before act(...) drives a concurrent root.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  it("drops the scrim when the photo fails to load, leaving a clean gradient", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    // jsdom does not fetch, so drive the probe's failure path directly.
    const probes = stubImageProbe();
    const RealImage = globalThis.Image;

    try {
      await act(async () => {
        root.render(
          createElement(BgMediaTemplate, {
            variables: { texts: "Autumn", mediaUrl: "https://cdn.test/missing.jpg" },
            style,
            progress: 0.5,
            beatIntensity: 0,
            width: 1080,
            height: 1920,
            safeZone: { top: 100, right: 60, bottom: 100, left: 60 },
            sceneDuration: 4,
            isPlaying: false,
          }),
        );
      });

      await act(async () => {
        probes.forEach((probe) => probe.fail());
      });

      // No scrim, no media layer — just the brand gradient the scene falls
      // back to, identical to every other gradient-backed template.
      expect(container.querySelectorAll("[data-media-overlay]").length).toBe(0);
      expect(container.querySelectorAll("[data-media-position]").length).toBe(0);
    } finally {
      await act(async () => root.unmount());
      globalThis.Image = RealImage;
      container.remove();
    }
  });
});

describe("media still loading", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  it("holds the scrim back until the photo lands, then shows both together", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const probes = stubImageProbe();
    const RealImage = globalThis.Image;

    try {
      await act(async () => {
        mountBgMedia(root, {
          texts: "Autumn",
          mediaUrl: "https://cdn.test/slow.jpg",
        });
      });

      // Still loading: the brand gradient is on its own, exactly as it looks
      // in a scene that never asked for media at all.
      expect(container.querySelectorAll("[data-media-overlay]").length).toBe(0);

      await act(async () => {
        probes.forEach((probe) => probe.succeed());
      });

      // The picture arrives and the scrim arrives with it — one commit, so
      // there is no frame showing either one without the other.
      expect(
        container.querySelectorAll("[data-media-overlay]").length,
      ).toBeGreaterThan(0);
      expect(container.querySelectorAll("[data-media-position]").length).toBe(1);
    } finally {
      await act(async () => root.unmount());
      globalThis.Image = RealImage;
      container.remove();
    }
  });
});
