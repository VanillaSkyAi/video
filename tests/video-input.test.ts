import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type {
  VideoBackground,
  VideoBrand,
  VideoInput,
  VideoStyle,
} from "../src/index";
import type { VideoAudio } from "../src/internal";

const complete = async function* () {
  yield { type: "plan.complete" as const };
};

function relativeLuminance(color: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

/** Independent render-space oracle: CSS gradients interpolate their sRGB channels. */
function minimumRenderedContrast(background: VideoBackground, foreground: string): number {
  if (background.type === "solid") return contrastRatio(background.color, foreground);
  const endpoints = background.colors.map((color) => [1, 3, 5].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16))) as [[number, number, number], [number, number, number]];
  let minimum = Number.POSITIVE_INFINITY;
  for (let step = 0; step <= 4096; step += 1) {
    const progress = step / 4096;
    const color = `#${endpoints[0].map((channel, index) =>
      Math.round(channel + (endpoints[1][index] - channel) * progress).toString(16).padStart(2, "0")
    ).join("")}`;
    minimum = Math.min(minimum, contrastRatio(color, foreground));
  }
  return minimum;
}

describe("VideoInput", () => {
  it("uses a deterministic gradient media opening when opening is omitted", async () => {
    const { buildVideoUserPrompt, createVideo } = await import("../src/internal");
    const response = createVideo({
      input: "Activation increased to 58%.",
      maxDurationSec: 12,
    }, {
      capabilities: { templates: ["bigNumber"] },
      generate: complete,
    });

    expect(response.request.input.opening).toBe("Creating your video...");
    expect(response.initialConfig.scenes).toEqual([{
      id: "supplied-opening",
      templateId: "media",
      variables: { texts: "Creating your video...", mediaType: "gradient" },
      timing: { fixedDuration: 3, startTime: 0, endTime: 3 },
    }]);
    expect(buildVideoUserPrompt(response.request.input)).toContain(
      "The host has already added the opening scene",
    );
  });

  it("lets the host replace the deterministic opening with application loading UI", async () => {
    const { buildVideoUserPrompt, createVideo } = await import("../src/internal");
    const response = createVideo({
      input: "Activation increased to 58%.",
      opening: false,
      maxDurationSec: 12,
    }, {
      capabilities: { templates: ["bigNumber"] },
      generate: async function* () {
        yield {
          type: "scene.add" as const,
          scene: {
            id: "activation",
            templateId: "bigNumber",
            variables: { texts: "Activation", value: 58, label: "percent" },
            timing: { fixedDuration: 3 },
          },
        };
        yield { type: "plan.complete" as const };
      },
    });

    expect(response.request.input.opening).toBe(false);
    expect(response.initialConfig.scenes).toEqual([]);
    expect(buildVideoUserPrompt(response.request.input)).toContain(
      "Add the first grounded scene as soon as it is complete",
    );

    const events = [];
    for await (const event of response.stream) events.push(event);
    expect(events.filter((event) => event.type === "scene.add").map((event) =>
      event.type === "scene.add" ? event.data.scene.id : undefined
    )).toEqual(["activation"]);
    expect(events[0]).toMatchObject({
      type: "response.start",
      data: { capabilities: { templates: ["bigNumber"] } },
    });
  });

  it("turns an intent-level opening into the deterministic opening scene", async () => {
    const { buildVideoUserPrompt, createVideo } = await import("../src/internal");
    const response = createVideo({
      input: "Activation increased to 58%.",
      opening: "  Your activation update is ready.  ",
      maxDurationSec: 12,
    }, {
      capabilities: { templates: ["media"] },
      generate: complete,
    });

    expect(response.initialConfig.scenes).toEqual([{
      id: "supplied-opening",
      templateId: "media",
      variables: { texts: "Your activation update is ready.", mediaType: "gradient" },
      timing: { fixedDuration: 3, startTime: 0, endTime: 3 },
    }]);
    expect(response.request.input.opening).toBe("Your activation update is ready.");
    expect(buildVideoUserPrompt(response.request.input)).toContain(
      "The host has already added the opening scene",
    );
    expect(buildVideoUserPrompt(response.request.input)).not.toContain("Response type:");
  });

  it("infers deterministic output audio metadata from a supplied src", async () => {
    const { createVideo } = await import("../src/internal");
    const selectAudio = vi.fn(() => undefined);
    const response = createVideo({
      input: "A concise update.",
      maxDurationSec: 24,
      audio: { src: "https://cdn.example.com/calm.mp3" },
    }, { generate: complete, selectAudio });

    expect(selectAudio).not.toHaveBeenCalled();
    expect(response.initialConfig.audio).toEqual({
      trackId: "soundtrack",
      audioUrl: "https://cdn.example.com/calm.mp3",
      duration: 24,
      beatDetection: { sensitivity: 0.5 },
      beatMarkers: [],
      volume: 1,
      fadeOutMs: 3000,
    });
  });

  it("uses host audio by default and lets audio false disable it", async () => {
    const { createVideo } = await import("../src/internal");
    const selected: VideoAudio = {
      trackId: "catalog-calm",
      audioUrl: "https://cdn.example.com/catalog-calm.mp3",
      duration: 30,
      beatDetection: { sensitivity: 0.4 },
      beatMarkers: [],
    };
    const selectAudio = vi.fn(() => selected);

    const automatic = createVideo({ input: "Use the catalog default." }, {
      generate: complete,
      selectAudio,
    });
    expect(automatic.initialConfig.audio).toBe(selected);

    const silent = createVideo({ input: "No soundtrack.", audio: false }, {
      generate: complete,
      selectAudio,
    });
    expect(silent.initialConfig.audio).toBeUndefined();
    expect(selectAudio).toHaveBeenCalledTimes(1);
  });

  it("never emits a completed snapshot that parseVideo rejects", async () => {
    const { createVideo } = await import("../src/internal");
    const response = createVideo({ input: "Reject an unreplayable host soundtrack." }, {
      selectAudio: () => ({
        trackId: "oversized",
        audioUrl: `https://cdn.example/${"a".repeat(2_048)}`,
        duration: 30,
        beatDetection: { sensitivity: 0.5 },
        beatMarkers: [],
      }),
      generate: async function* () {
        yield {
          type: "scene.add" as const,
          scene: { id: "one", templateId: "notification", variables: { message: "Grounded" }, timing: { fixedDuration: 4 } },
        };
        yield { type: "plan.complete" as const };
      },
    });

    const events = [];
    for await (const event of response.stream) events.push(event);
    expect(events.some(({ type }) => type === "response.complete")).toBe(false);
    expect(events.at(-1)).toMatchObject({
      type: "response.error",
      data: { terminal: true, error: { code: "generation_failed" } },
    });
  });

  it("resolves one complete semantic brand when brand configuration is omitted", async () => {
    const { createVideo } = await import("../src/internal");
    const response = createVideo({ input: "Use the standard background." }, { generate: complete });

    expect(response.initialConfig.style.brand).toEqual({
      font: "Inter",
      scriptFont: "Caveat",
      background: { type: "gradient", colors: ["#8711C1", "#2167E3"] },
      colors: {
        primary: "#00E5A0",
        secondary: "#006BE5",
        foreground: "#FFFFFF",
        surface: "#0A0A14",
        surfaceElevated: "#14152A",
        muted: "#A7A6B0",
      },
    });
  });

  it("returns independent resolved backgrounds so one consumer cannot poison later defaults", async () => {
    const { createVideo } = await import("../src/internal");
    const first = createVideo({ input: "First." }, { generate: complete });
    const firstBackground = first.initialConfig.style.brand.background;
    if (firstBackground.type === "gradient") firstBackground.colors[0] = "#000000";

    const second = createVideo({ input: "Second." }, { generate: complete });
    expect(second.initialConfig.style.brand.background).toEqual({
      type: "gradient",
      colors: ["#8711C1", "#2167E3"],
    });
  });

  it("resolves identity, typography, and partial semantic colours without coupling them to the background", async () => {
    const { createVideo } = await import("../src/internal");
    const response = createVideo({
      input: "Use the standard background with our logo.",
      brand: {
        name: "Acme",
        logoUrl: "https://cdn.example.com/logo.svg",
        font: "Geist",
        scriptFont: "Permanent Marker",
        colors: { foreground: "#FAFAFA", primary: "#FF3366" },
      },
    }, { generate: complete });

    expect(response.initialConfig.style.brand).toEqual({
      name: "Acme",
      logoUrl: "https://cdn.example.com/logo.svg",
      font: "Geist",
      scriptFont: "Permanent Marker",
      background: { type: "gradient", colors: ["#8711C1", "#2167E3"] },
      colors: {
        primary: "#FF3366",
        secondary: "#006BE5",
        foreground: "#FAFAFA",
        surface: "#0A0A14",
        surfaceElevated: "#14152A",
        muted: "#A7A6B0",
      },
    });
  });

  it.each([
    ["cosmic", "#8711C1", "#2167E3", "#FFFFFF"],
    ["horizon", "#5967C4", "#133A94", "#FFFFFF"],
    ["twilight", "#0C1740", "#3D1B66", "#FFFFFF"],
    ["meadow", "#348756", "#54B6CA", "#000000"],
    ["velvet", "#76030F", "#121B67", "#FFFFFF"],
    ["flamingo", "#C72D50", "#3E3B92", "#FFFFFF"],
    ["peach", "#B45A4A", "#AD336D", "#FFFFFF"],
    ["saffron", "#F3696E", "#F8A902", "#000000"],
  ] as const)("resolves the %s gradient background preset accessibly", async (background, first, second, foreground) => {
    const { createVideo } = await import("../src/internal");
    const response = createVideo({
      input: "Use a curated background.",
      brand: {
        background,
        colors: { primary: "#AA11CC", secondary: "#11CCAA" },
      },
    }, { generate: complete });

    expect(response.initialConfig.style.brand.background).toEqual({
      type: "gradient",
      colors: [first, second],
    });
    expect(response.initialConfig.style.brand.colors.primary).toBe("#AA11CC");
    expect(response.initialConfig.style.brand.colors.secondary).toBe("#11CCAA");
    expect(response.initialConfig.style.brand.colors.foreground).toBe(foreground);
    expect(minimumRenderedContrast(
      response.initialConfig.style.brand.background,
      response.initialConfig.style.brand.colors.foreground,
    )).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["black", "#000000"],
    ["midnight", "#070B20"],
    ["aubergine", "#170A2E"],
    ["coal", "#0A0A0A"],
    ["navy", "#0A2240"],
  ] as const)("resolves the %s solid background", async (background, color) => {
    const { createVideo } = await import("../src/internal");
    const response = createVideo({
      input: "Use a solid background.",
      brand: { background },
    }, { generate: complete });

    expect(response.initialConfig.style.brand.background).toEqual({ type: "solid", color });
    expect(minimumRenderedContrast(
      response.initialConfig.style.brand.background,
      response.initialConfig.style.brand.colors.foreground,
    )).toBeGreaterThanOrEqual(4.5);
  });

  it("accepts custom gradients and solids only when the preset choices do not fit", async () => {
    const { createVideo } = await import("../src/internal");
    const gradient = createVideo({
      input: "Use exact campaign colors.",
      brand: {
        background: { colors: ["#112233", "#334455"] },
        colors: { foreground: "#FAFAFA" },
        logoUrl: "https://cdn.example.com/logo.svg",
      },
    }, { generate: complete });
    const solid = createVideo({
      input: "Use an exact solid color.",
      brand: { background: { color: "#123456" } },
    }, { generate: complete });

    expect(gradient.initialConfig.style.brand.background).toEqual({
      type: "gradient",
      colors: ["#112233", "#334455"],
    });
    expect(gradient.initialConfig.style.brand.colors.foreground).toBe("#FAFAFA");
    expect(gradient.initialConfig.style.brand.logoUrl).toBe("https://cdn.example.com/logo.svg");
    expect(solid.initialConfig.style.brand.background).toEqual({ type: "solid", color: "#123456" });
  });

  it("selects a deterministic readable foreground when a custom background omits one", async () => {
    const { createVideo } = await import("../src/internal");
    const light = createVideo({
      input: "Use a light campaign background.",
      brand: {
        background: { colors: ["#F8FAFC", "#E2E8F0"] },
        colors: { primary: "#5B3FD6" },
      },
    }, { generate: complete });
    const dark = createVideo({
      input: "Use a dark campaign background.",
      brand: { background: { color: "#111827" } },
    }, { generate: complete });

    expect(light.initialConfig.style.brand.colors.foreground).toBe("#000000");
    expect(light.initialConfig.style.brand.colors.primary).toBe("#5B3FD6");
    expect(dark.initialConfig.style.brand.colors.foreground).toBe("#FFFFFF");
    expect(() => createVideo({
      input: "Use an extreme split background.",
      brand: { background: { colors: ["#000000", "#FFFFFF"] } },
    }, { generate: complete })).toThrow(
      "brand.colors.foreground is required because neither black nor white contrasts with the entire background",
    );
    expect(() => createVideo({
      input: "Catch the dark interior, not just the safe endpoints.",
      brand: { background: { colors: ["#FF0000", "#00FF00"] } },
    }, { generate: complete })).toThrow(
      "brand.colors.foreground is required because neither black nor white contrasts with the entire background",
    );
  });

  it("rejects unknown or malformed background choices", async () => {
    const { createVideo, createVideoRequest, parseVideoRequest } = await import("../src/internal");
    expect(() => createVideo({
      input: "Unknown preset.",
      brand: { background: "neon" as never },
    }, { generate: complete })).toThrow("background preset is unsupported");

    const request = createVideoRequest({ input: "Malformed custom background." }, { requestId: "background-test" });
    expect(() => parseVideoRequest({
      ...request,
      input: { input: "Malformed custom background.", brand: { background: { colors: ["#123456"] } } },
    })).toThrow("request.input.brand.background.colors must contain two colors");
  });

  it("rejects malformed colours and low-contrast custom foreground/background combinations", async () => {
    const { createVideo } = await import("../src/internal");

    expect(() => createVideo({
      input: "Malformed foreground.",
      brand: { colors: { foreground: "white" } },
    }, { generate: complete })).toThrow("brand.colors.foreground must be a hex color");
    expect(() => createVideo({
      input: "Unreadable light brand.",
      brand: {
        background: { color: "#FFFFFF" },
        colors: { foreground: "#FAFAFA" },
      },
    }, { generate: complete })).toThrow(
      "brand.colors.foreground must have at least 4.5:1 contrast across brand.background",
    );
    expect(() => createVideo({
      input: "Do not silently replace an explicit semantic foreground.",
      brand: {
        background: "meadow",
        colors: { foreground: "#FFFFFF" },
      },
    }, { generate: complete })).toThrow(
      "brand.colors.foreground must have at least 4.5:1 contrast across brand.background",
    );
    expect(() => createVideo({
      input: "Catch a low-contrast gradient interior.",
      brand: {
        background: { colors: ["#FF0000", "#00FF00"] },
        colors: { foreground: "#000000" },
      },
    }, { generate: complete })).toThrow(
      "brand.colors.foreground must have at least 4.5:1 contrast across brand.background",
    );
  });

  it("applies the same contrast invariant to external or replayed resolved brands", async () => {
    const { createVideo, parseVideoEvent, VIDEO_PROTOCOL_VERSION } = await import("../src/internal");
    const response = createVideo({ input: "Create a valid resolved style." }, { generate: complete });
    const brand = response.initialConfig.style.brand;
    const event = {
      protocolVersion: VIDEO_PROTOCOL_VERSION,
      runId: "external-brand",
      sequence: 0,
      eventId: "external-brand:0",
      type: "response.start",
      data: {
        requestId: "external-request",
        format: { orientation: "portrait" },
        style: {
          ...response.initialConfig.style,
          brand: {
            ...brand,
            background: { type: "gradient", colors: ["#FF0000", "#00FF00"] },
            colors: { ...brand.colors, foreground: "#000000" },
          },
        },
      },
    };

    expect(() => parseVideoEvent(event)).toThrow(
      "event.data.style.brand.colors.foreground must have at least 4.5:1 contrast across event.data.style.brand.background",
    );
  });

  it("sends only brand identity and logo presence to the planner", async () => {
    const { buildVideoUserPrompt } = await import("../src/internal");
    const prompt = buildVideoUserPrompt({
      input: "A grounded update.",
      brand: {
        name: "Acme",
        logoUrl: "https://private.example.com/brand.svg",
        font: "Geist",
        scriptFont: "Caveat",
        background: { color: "#010203" },
        colors: { primary: "#FF3366" },
      },
    });
    const brandSection = prompt.split("\nBRAND\n")[1];

    expect(JSON.parse(brandSection)).toEqual({ name: "Acme", hasLogo: true });
    expect(brandSection).not.toContain("private.example.com");
    expect(brandSection).not.toContain("#FF3366");
    expect(brandSection).not.toContain("Geist");
  });

  it("validates only the simplified opening and audio request shapes", async () => {
    const {
      createVideoRequest,
      parseVideoRequest,
    } = await import("../src/internal");
    const valid = createVideoRequest({
      input: "Grounded source.",
      knowledgeMode: "general",
      opening: "A grounded opening.",
      audio: { src: "https://cdn.example.com/audio.mp3" },
    }, { requestId: "request-1" });

    expect(parseVideoRequest(valid)).toEqual(valid);
    const loadingOnly = createVideoRequest({
      input: "Grounded source.",
      opening: false,
    }, { requestId: "request-loading-only" });
    expect(parseVideoRequest(loadingOnly)).toEqual(loadingOnly);
    expect(() => parseVideoRequest({
      ...valid,
      input: { input: "Grounded source.", knowledgeMode: "outside-web" },
    })).toThrow("request.input.knowledgeMode must be input-only or general");
    expect(() => parseVideoRequest({
      ...valid,
      input: { input: "Grounded source.", firstScene: { text: "Old shape" } },
    })).toThrow("request.input contains unsupported field firstScene");
    expect(() => parseVideoRequest({
      ...valid,
      input: { input: "Grounded source.", type: "daily_briefing" },
    })).toThrow("request.input contains unsupported field type");
    expect(() => parseVideoRequest({
      ...valid,
      input: { input: "Grounded source.", audio: { mode: "auto" } },
    })).toThrow("request.input.audio contains unsupported field mode");
    expect(() => parseVideoRequest({
      ...valid,
      input: { input: "Grounded source.", audio: { src: " " } },
    })).toThrow("request.input.audio.src must be a non-empty string");
    expect(() => parseVideoRequest({
      ...valid,
      input: { input: "Grounded source.", audio: { src: `https://cdn.example/${"a".repeat(2_048)}` } },
    })).toThrow("request.input.audio.src must be at most 2048 characters");
    expect(() => parseVideoRequest({
      ...valid,
      input: {
        input: "Grounded source.",
        suppliedMedia: [{
          id: "oversized",
          type: "image",
          url: `https://cdn.example/${"m".repeat(2_048)}`,
        }],
      },
    })).toThrow("request.input.suppliedMedia[0].url must be at most 2048 characters");
    expect(() => parseVideoRequest({
      ...valid,
      input: { input: "Grounded source.", style: { preset: "editorial" } },
    })).toThrow("request.input.style contains unsupported field preset");
  });

  it.each([
    [{ instructions: 42 }, "request.input.instructions must be a non-empty string"],
    [{ orientation: "square" }, "request.input.orientation must be portrait or landscape"],
    [{ maxDurationSec: "30" }, "request.input.maxDurationSec must be a number between 5 and 120"],
    [{ maxDurationSec: 4 }, "request.input.maxDurationSec must be a number between 5 and 120"],
    [{ maxDurationSec: 121 }, "request.input.maxDurationSec must be a number between 5 and 120"],
  ])("rejects malformed intent-level input option %j", async (option, message) => {
    const { createVideoRequest, parseVideoRequest } = await import("../src/internal");
    const valid = createVideoRequest({ input: "Grounded source." }, { requestId: "request-options" });

    expect(() => parseVideoRequest({
      ...valid,
      input: { input: "Grounded source.", ...option },
    })).toThrow(message);
  });

  it.each([
    ["density", "dense", "airy, normal, or packed"],
    ["motion", "fast", "calm, normal, or punchy"],
    ["textArchetype", "bounce", "subtle, typewriter, wordStagger, slam, cinematic, or heroWord"],
    ["backgroundEffect", "spin", "static, slow-zoom-in, slow-zoom-out, ken-burns, drift, pulse, breathe, slow-tilt, or camera-shake"],
  ])("rejects an unsupported style %s", async (field, value, choices) => {
    const { createVideoRequest, parseVideoRequest } = await import("../src/internal");
    const valid = createVideoRequest({ input: "Grounded source." }, { requestId: "request-style" });

    expect(() => parseVideoRequest({
      ...valid,
      input: { input: "Grounded source.", style: { [field]: value } },
    })).toThrow(`request.input.style.${field} must be ${choices}`);
  });

  it.each([
    ["focalPoint", "middle", "center, top, bottom, left, or right"],
    ["treatment", "loud", "subtle, cinematic, or text-safe"],
    ["role", "hero", "product, proof, background, or logo"],
  ])("rejects an unsupported supplied-media %s", async (field, value, choices) => {
    const { createVideoRequest, parseVideoRequest } = await import("../src/internal");
    const valid = createVideoRequest({ input: "Grounded source." }, { requestId: "request-media" });

    expect(() => parseVideoRequest({
      ...valid,
      input: {
        input: "Grounded source.",
        suppliedMedia: [{
          id: "media-1",
          type: "image",
          url: "https://cdn.example.com/media.jpg",
          [field]: value,
        }],
      },
    })).toThrow(`request.input.suppliedMedia[0].${field} must be ${choices}`);
  });

  it("does not expose opening or timing configuration aliases at the package root", () => {
    const rootExports = readFileSync(join(process.cwd(), "src/index.ts"), "utf8");
    expect(rootExports).not.toContain("VideoOpening");
    expect(rootExports).not.toContain("VideoTiming");
    expect(rootExports).toMatch(/\bVideoAudio\b/);
  });

  it("has the small intent-level type surface", () => {
    expectTypeOf<VideoInput["knowledgeMode"]>().toEqualTypeOf<"input-only" | "general" | undefined>();
    expectTypeOf<VideoInput["opening"]>().toEqualTypeOf<string | false | undefined>();
    expectTypeOf<VideoInput["audio"]>().toEqualTypeOf<false | { src: string } | undefined>();
    expectTypeOf<VideoBackground>().toEqualTypeOf<
      | { type: "solid"; color: string }
      | { type: "gradient"; colors: [string, string] }
    >();
    expectTypeOf<VideoBrand["font"]>().toEqualTypeOf<string>();
    expectTypeOf<VideoBrand["scriptFont"]>().toEqualTypeOf<string>();
    expectTypeOf<VideoBrand["colors"]>().toEqualTypeOf<{
      primary: string;
      secondary: string;
      foreground: string;
      surface: string;
      surfaceElevated: string;
      muted: string;
    }>();
    expectTypeOf<VideoStyle["brand"]>().toEqualTypeOf<VideoBrand>();
  });
});

// @ts-expect-error VideoInput no longer accepts a response-type taxonomy.
type _RemovedResponseType = VideoInput["type"];
// @ts-expect-error VideoInput no longer accepts scene-level opening configuration.
type _RemovedFirstScene = VideoInput["firstScene"];
// @ts-expect-error VideoOpening is intentionally absent from the package root.
type _RemovedOpeningAlias = import("../src/index").VideoOpening;
// @ts-expect-error VideoTiming is intentionally absent from the package root.
type _RemovedTimingAlias = import("../src/index").VideoTiming;
// @ts-expect-error Resolved style no longer exposes a duplicate font path.
type _RemovedStyleFont = VideoStyle["font"];
// @ts-expect-error Resolved style no longer exposes brandKit.
type _RemovedBrandKit = VideoStyle["brandKit"];
// @ts-expect-error Scene-level visual background overrides are not planner-authored.
type _RemovedBackgroundOverride = import("../src/index").VideoScene["backgroundOverride"];
