// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoValidationError, type Video } from "../src/index";
import { createVideo, createVideoEventFactory } from "../src/internal";
import { createRenderTemplateRegistry, defineTemplate } from "../src/visual-system/catalog/internal";
import { TEST_VIDEO_STYLE } from "./semantic-brand-fixture";

describe("VideoPlayer", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders nothing before useVideo starts a stream", async () => {
    const { VideoPlayer } = await import("../src/player/video-player");
    const view = render(createElement(VideoPlayer, {
      templates: createRenderTemplateRegistry({ templates: [] }),
    }));

    expect(view.container.innerHTML).toBe("");
  });

  it("plays a saved video without requiring stream player props", async () => {
    const { VideoPlayer } = await import("../src/react");
    const video: Video = {
      schemaVersion: "0.1",
      orientation: "portrait",
      scenes: [{
        id: "saved",
        templateId: "bigNumber",
        variables: { value: "42", label: "saved result" },
        timing: { fixedDuration: 4 },
      }],
      style: TEST_VIDEO_STYLE,
    };

    const view = render(createElement(VideoPlayer, { video, autoPlay: false }));
    const player = view.getByTestId("video-player");

    expect(player.getAttribute("data-status")).toBe("complete");
    expect(player.getAttribute("data-scenes")).toBe("1");
    await waitFor(() => expect(view.getByText("saved result")).toBeDefined(), { timeout: 3_000 });
    expect(view.container.querySelector('[data-template-id="bigNumber"]')).not.toBeNull();
  });

  it("overlays customer templates onto built-ins when replaying a mixed saved video", async () => {
    let nextFrame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      nextFrame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const customerTemplates = createRenderTemplateRegistry({ templates: [defineTemplate({
      id: "customerMetric",
      schema: {
        type: "object",
        properties: { label: { type: "string", default: "" } },
        required: ["label"],
        additionalProperties: false,
      },
      component: ({ variables }) => createElement("span", null, `Customer: ${variables.label}`),
    })] });
    const video: Video = {
      schemaVersion: "0.1",
      orientation: "portrait",
      scenes: [
        {
          id: "customer",
          templateId: "customerMetric",
          variables: { label: "activation" },
          timing: { fixedDuration: 1 },
        },
        {
          id: "builtin",
          templateId: "bigNumber",
          variables: { value: "42", label: "retention" },
          timing: { fixedDuration: 1 },
        },
      ],
      style: TEST_VIDEO_STYLE,
    };
    const { VideoPlayer } = await import("../src/react");

    const view = render(createElement(VideoPlayer, {
      video,
      templates: customerTemplates,
      autoPlay: true,
    }));

    await waitFor(() => expect(view.getByText("Customer: activation")).toBeDefined());
    act(() => nextFrame?.(performance.now() + 1_100));
    await waitFor(() => expect(view.getByText("retention")).toBeDefined());
    expect(view.container.querySelector('[data-template-id="bigNumber"]')).not.toBeNull();
  });

  it("rejects an unsupported saved schema before invoking a renderer", async () => {
    const renderTemplate = vi.fn(() => createElement("span", null, "must not render"));
    const customerTemplates = createRenderTemplateRegistry({ templates: [defineTemplate({
      id: "futureTemplate",
      schema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      component: renderTemplate,
    })] });
    const future = {
      schemaVersion: "0.2",
      scenes: [{
        id: "future",
        templateId: "futureTemplate",
        variables: {},
        timing: { fixedDuration: 2 },
      }],
      style: TEST_VIDEO_STYLE,
    } as unknown as Video;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { VideoPlayer } = await import("../src/react");

    expect(() => render(createElement(VideoPlayer, {
      video: future,
      templates: customerTemplates,
      autoPlay: false,
    }))).toThrow(VideoValidationError);
    expect(renderTemplate).not.toHaveBeenCalled();
  });

  it("replays every built-in saved template without a generation request", async () => {
    const generationRequests: Array<RequestInfo | URL> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      generationRequests.push(input);
      throw new Error(`Unexpected generation request: ${String(input)}`);
    }));
    const { VideoPlayer } = await import("../src/react");
    const { BUILTIN_TEMPLATE_MANIFEST } = await import("../src/visual-system/catalog/builtin-manifest");

    const view = render(createElement("main", null, BUILTIN_TEMPLATE_MANIFEST.map((template) => {
      const variables = Object.fromEntries(Object.entries(template.schema.properties).flatMap(
        ([key, property]) => "default" in property ? [[key, property.default]] : [],
      ));
      const video: Video = {
        schemaVersion: "0.1",
        orientation: "portrait",
        scenes: [{
          id: `saved-${template.id}`,
          templateId: template.id,
          variables,
          timing: { fixedDuration: 2 },
        }],
        style: TEST_VIDEO_STYLE,
      };
      return createElement(VideoPlayer, {
        key: template.id,
        video,
        autoPlay: false,
        width: 180,
      });
    })));

    await waitFor(() => {
      for (const { id } of BUILTIN_TEMPLATE_MANIFEST) {
        expect(view.container.querySelector(`[data-template-id="${id}"]`), id).not.toBeNull();
      }
    }, { timeout: 10_000 });
    expect(generationRequests).toEqual([]);
  });

  it("shows a brand-aware generation cover until the first validated scene arrives", async () => {
    let releasePlanner!: () => void;
    const plannerGate = new Promise<void>((resolve) => { releasePlanner = resolve; });
    const { VideoPlayer } = await import("../src/player/video-player");
    const events = createVideoEventFactory({ runId: "run-generation-cover" });
    const style = {
      ...TEST_VIDEO_STYLE,
      brand: {
        ...TEST_VIDEO_STYLE.brand,
        name: "Acme",
        font: "Inter",
        background: { type: "gradient" as const, colors: ["#241F54", "#17122F"] as [string, string] },
      },
    };
    const stream = (async function* () {
        yield events.create("response.start", {
          requestId: "request-generation-cover",
          format: { orientation: "portrait" },
          style,
          meta: { name: "Video response" },
        });
        await plannerGate;
        yield events.create("scene.add", {
          scene: { id: "one", templateId: "customer", variables: {}, timing: { fixedDuration: 1, startTime: 0, endTime: 1 } },
          position: 0,
          revision: 0,
        });
    })();
    const view = render(createElement(VideoPlayer, {
      templates: createRenderTemplateRegistry({ templates: [] }),
      stream,
      width: 360,
      playbackMode: "manual",
    }));

    const cover = await view.findByTestId("video-generation-cover");
    expect(cover.textContent).toContain("Creating your video…");
    expect(cover.textContent).toContain("Choosing the best scenes for your content.");
    expect(cover.style.background).toContain("#241F54");
    expect(cover.style.background).toContain("#17122F");
    expect(cover.style.fontFamily).toBe('Inter, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif');
    const coverStart = view.getByRole("button", { name: "Play video response" });
    expect(coverStart.style.top).toBe("50%");

    releasePlanner();
    await waitFor(() => expect(view.getByTestId("video-player").getAttribute("data-scenes")).toBe("1"));
    expect(view.getByTestId("video-generation-cover")).toBe(cover);
    expect(view.getByRole("button", { name: "Play video response" })).toBe(coverStart);
  });

  it("uses the first template's authored hold pose for the static start poster", async () => {
    const { VideoPlayer } = await import("../src/player/video-player");
    const templates = createRenderTemplateRegistry({ templates: [defineTemplate({
      id: "posterProbe",
      usesGlobalTransition: true,
      transitionTiming: { entryReadyProgress: 0.2, holdProgress: 0.7 },
      schema: { type: "object", properties: {}, additionalProperties: false },
      component: ({ progress, motionProgress }) => createElement("span", {
        "data-testid": "poster-probe",
        "data-progress": progress.toFixed(3),
        "data-motion-progress": (motionProgress ?? progress).toFixed(3),
      }),
    })] });
    const video: Video = {
      schemaVersion: "0.1",
      orientation: "portrait",
      scenes: [{
        id: "intro",
        templateId: "posterProbe",
        variables: {},
        timing: { fixedDuration: 4 },
      }],
      style: TEST_VIDEO_STYLE,
    };

    const view = render(createElement(VideoPlayer, { video, templates, autoPlay: false }));
    const poster = view.getByTestId("poster-probe");
    expect(poster.getAttribute("data-progress")).toBe("0.700");
    expect(poster.getAttribute("data-motion-progress")).toBe("0.700");
  });

  it("starts the default opening with sound before the planner body arrives", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    let releaseFirstScene!: () => void;
    const firstSceneGate = new Promise<void>((resolve) => { releaseFirstScene = resolve; });
    const { VideoPlayer } = await import("../src/player/video-player");
    const response = createVideo({
      input: "Activation improved from 41% to 58%.",
      audio: { src: "data:audio/wav;base64,UklGRg==" },
    }, {
      generate: async function* () {
        await firstSceneGate;
        yield {
          type: "scene.add" as const,
          scene: {
            id: "first",
            templateId: "bigNumber",
            variables: { texts: "Activation", value: 58, label: "percent" },
            timing: { fixedDuration: 3 },
          },
        };
        yield { type: "plan.complete" as const };
      },
    });
    const view = render(createElement(VideoPlayer, {
      templates: createRenderTemplateRegistry({ templates: [] }),
      stream: response.stream,
      playbackMode: "autoplay-after-interaction",
    }));
    const player = view.getByTestId("video-player");

    await waitFor(() => expect(view.container.querySelector("audio")).not.toBeNull());
    await waitFor(() => expect(player.getAttribute("data-scenes")).toBe("1"));
    expect(view.queryByTestId("video-generation-cover")).toBeNull();
    expect(view.container.querySelector('[data-template-id="media"]')).not.toBeNull();
    await waitFor(() => expect(view.container.textContent).toContain("Creating your video..."));
    fireEvent.click(view.getByRole("button", { name: "Play video with sound" }));
    expect(play).toHaveBeenCalled();
    expect(player.getAttribute("data-playing")).toBe("true");
    expect(player.getAttribute("data-generation-intro-complete")).toBe("true");
    expect(player.getAttribute("data-intro-playing")).toBe("false");

    releaseFirstScene();
    await waitFor(() => expect(player.getAttribute("data-scenes")).toBe("2"));
  });

  it("keeps the default opening visible while later body scenes stream", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    let releasePlanner!: () => void;
    const plannerGate = new Promise<void>((resolve) => { releasePlanner = resolve; });
    const { VideoPlayer } = await import("../src/player/video-player");
    const response = createVideo({
      input: "Activation improved from 41% to 58%.",
      audio: { src: "data:audio/wav;base64,UklGRg==" },
    }, {
      generate: async function* () {
        yield {
          type: "scene.add" as const,
          scene: {
            id: "first",
            templateId: "bigNumber",
            variables: { texts: "Activation", value: 58, label: "percent" },
            timing: { fixedDuration: 3 },
          },
        };
        await plannerGate;
        yield { type: "plan.complete" as const };
      },
    });
    const view = render(createElement(VideoPlayer, {
      templates: createRenderTemplateRegistry({ templates: [] }),
      stream: response.stream,
      playbackMode: "manual",
    }));
    const player = view.getByTestId("video-player");

    await waitFor(() => expect(player.getAttribute("data-scenes")).toBe("2"));
    expect(player.getAttribute("data-status")).toBe("streaming");
    expect(player.getAttribute("data-current-time")).toBe("0.000");
    expect(player.getAttribute("data-playing")).toBe("false");
    expect(view.queryByTestId("video-generation-cover")).toBeNull();
    expect(view.container.querySelector('[data-template-id="media"]')).not.toBeNull();
    await waitFor(() => expect(view.container.textContent).toContain("Creating your video..."));
    expect(view.container.querySelector("audio")?.muted).toBe(false);
    expect(view.getAllByRole("button", { name: "Play video with sound" })).toHaveLength(1);

    fireEvent.click(view.getByRole("button", { name: "Play video with sound" }));
    expect(play).toHaveBeenCalled();
    await waitFor(() => expect(player.getAttribute("data-playing")).toBe("true"));
    expect(player.getAttribute("data-intro-playing")).toBe("false");
    expect(view.queryByTestId("video-generation-cover")).toBeNull();
    releasePlanner();
  });

  it("uses the default gradient opening as the poster and starts it with sound", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    let releasePlanner!: () => void;
    const plannerGate = new Promise<void>((resolve) => { releasePlanner = resolve; });
    const { VideoPlayer } = await import("../src/player/video-player");
    const response = createVideo({
      input: "Activation improved from 41% to 58%.",
      audio: { src: "data:audio/wav;base64,UklGRg==" },
    }, {
      generate: async function* () {
        await plannerGate;
        yield { type: "plan.complete" as const };
      },
    });
    const view = render(createElement(VideoPlayer, {
      templates: createRenderTemplateRegistry({ templates: [] }),
      stream: response.stream,
      playbackMode: "manual",
    }));

    const player = view.getByTestId("video-player");
    await waitFor(() => expect(player.getAttribute("data-scenes")).toBe("1"));
    expect(view.queryByTestId("video-generation-cover")).toBeNull();
    expect(view.container.querySelector('[data-template-id="media"]')).not.toBeNull();
    await waitFor(() => expect(view.container.textContent).toContain("Creating your video..."));
    expect(player.getAttribute("data-current-time")).toBe("0.000");
    expect(player.getAttribute("data-start-poster")).toBe("true");
    const start = view.getByRole("button", { name: "Play video with sound" });
    expect(start.style.top).toBe("50%");
    fireEvent.click(start);
    expect(play).toHaveBeenCalled();
    expect(player.getAttribute("data-generation-intro-complete")).toBe("true");
    expect(player.getAttribute("data-intro-playing")).toBe("false");
    expect(player.getAttribute("data-playing")).toBe("true");
    expect(player.getAttribute("data-start-poster")).toBe("false");
    releasePlanner();
  });

  it("autoplays later streams with sound after the viewer starts the first one", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const { VideoPlayer } = await import("../src/player/video-player");
    const kit = createRenderTemplateRegistry({ templates: [] });
    const first = createVideo({
      input: "First",
      audio: { src: "data:audio/wav;base64,UklGRg==" },
    }, {
      generate: async function* () {
        yield { type: "scene.add" as const, scene: { id: "first", templateId: "customer", variables: {}, timing: { fixedDuration: 3 } } };
        yield { type: "plan.complete" as const };
      },
    });
    const view = render(createElement(VideoPlayer, {
      templates: kit,
      stream: first.stream,
      playbackMode: "autoplay-after-interaction",
    }));
    const player = view.getByTestId("video-player");

    await waitFor(() => expect(player.getAttribute("data-status")).toBe("complete"));
    expect(player.getAttribute("data-playing")).toBe("false");
    fireEvent.click(view.getByRole("button", { name: "Play video with sound" }));
    await waitFor(() => expect(player.getAttribute("data-audio-unlocked")).toBe("true"));

    let releaseSecond!: () => void;
    const secondGate = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const second = createVideo({
      input: "Second",
      audio: { src: "data:audio/wav;base64,UklGRg==" },
    }, {
      generate: async function* () {
        await secondGate;
        yield { type: "scene.add" as const, scene: { id: "second", templateId: "customer", variables: {}, timing: { fixedDuration: 3 } } };
        yield { type: "plan.complete" as const };
      },
    });
    view.rerender(createElement(VideoPlayer, {
      templates: kit,
      stream: second.stream,
      playbackMode: "autoplay-after-interaction",
    }));

    expect(player.getAttribute("data-status")).toBe("streaming");
    expect(player.getAttribute("data-playing")).toBe("true");
    expect(view.getByTestId("video-generation-cover")).toBeDefined();
    releaseSecond();
  });

  it("starts each replacement stream as a fresh autoplay session with an immediate cover", async () => {
    let nextFrame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      nextFrame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    const { VideoPlayer } = await import("../src/player/video-player");
    const kit = createRenderTemplateRegistry({ templates: [] });
    const first = createVideo({ input: "First" }, {
      generate: async function* () {
        yield { type: "scene.add" as const, scene: { id: "first", templateId: "customer", variables: {}, timing: { fixedDuration: 1 } } };
        yield { type: "plan.complete" as const };
      },
    });
    const view = render(createElement(VideoPlayer, { templates: kit, stream: first.stream, autoPlay: true }));
    const player = view.getByTestId("video-player");
    await waitFor(() => expect(player.getAttribute("data-status")).toBe("complete"));
    act(() => nextFrame?.(performance.now() + 4_000));
    await waitFor(() => expect(player.getAttribute("data-playing")).toBe("false"));

    let releaseSecond!: () => void;
    const secondGate = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const second = createVideo({ input: "Second" }, {
      generate: async function* () {
        await secondGate;
        yield { type: "scene.add" as const, scene: { id: "second", templateId: "customer", variables: {}, timing: { fixedDuration: 1 } } };
        yield { type: "plan.complete" as const };
      },
    });
    view.rerender(createElement(VideoPlayer, { templates: kit, stream: second.stream, autoPlay: true }));

    expect(player.getAttribute("data-status")).toBe("streaming");
    expect(player.getAttribute("data-current-time")).toBe("0.000");
    expect(player.getAttribute("data-playing")).toBe("true");
    expect(view.getByTestId("video-generation-cover")).toBeDefined();
    releaseSecond();
  });

  it("completes a one-shot stream under React Strict Mode", async () => {
    const { VideoPlayer } = await import("../src/player/video-player");
    const response = createVideo({ input: "Update" }, {
      generate: async function* () {
        yield {
          type: "scene.add" as const,
          scene: { id: "one", templateId: "customer", variables: {}, timing: { fixedDuration: 1 } },
        };
        yield { type: "plan.complete" as const };
      },
    });
    const view = render(createElement(StrictMode, null, createElement(VideoPlayer, {
      templates: createRenderTemplateRegistry({ templates: [] }),
      stream: response.stream,
    })));

    await waitFor(() => expect(view.getByTestId("video-player").getAttribute("data-status")).toBe("complete"));
  });

  it("exposes partial length completion in player run state", async () => {
    const { VideoPlayer } = await import("../src/player/video-player");
    const response = createVideo({ input: "Update" }, {
      generate: async function* () {
        yield {
          type: "scene.add" as const,
          scene: { id: "one", templateId: "customer", variables: {}, timing: { fixedDuration: 1 } },
        };
        yield { type: "plan.complete" as const, finishReason: "length" as const };
      },
    });
    const view = render(createElement(VideoPlayer, {
      templates: createRenderTemplateRegistry({ templates: [] }),
      stream: response.stream,
    }));
    const player = view.getByTestId("video-player");

    await waitFor(() => expect(player.getAttribute("data-status")).toBe("complete"));
    expect(player.getAttribute("data-finish-reason")).toBe("length");
  });

  it("switches an auto-oriented player between landscape and portrait at its container breakpoint", async () => {
    let containerWidth = 800;
    let notifyResize: (() => void) | undefined;
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { notifyResize = callback; }
      observe() { notifyResize?.(); }
      disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => containerWidth);
    const { VideoPlayer } = await import("../src/player/video-player");
    const response = createVideo({ input: "Update", orientation: "portrait", opening: "Ready" }, {
      generate: async function* () { yield { type: "plan.complete" as const }; },
    });
    const view = render(createElement(VideoPlayer, {
      templates: createRenderTemplateRegistry({ templates: [] }),
      stream: response.stream,
      orientation: "auto",
    }));
    const player = view.getByTestId("video-player");
    await waitFor(() => expect(player.getAttribute("data-orientation")).toBe("landscape"));

    containerWidth = 360;
    act(() => notifyResize?.());
    await waitFor(() => expect(player.getAttribute("data-orientation")).toBe("portrait"));
  });

  it("keeps an explicit player orientation fixed across container widths", async () => {
    const { VideoPlayer } = await import("../src/player/video-player");
    const response = createVideo({ input: "Update", orientation: "landscape", opening: "Ready" }, {
      generate: async function* () { yield { type: "plan.complete" as const }; },
    });
    const view = render(createElement(VideoPlayer, {
      templates: createRenderTemplateRegistry({ templates: [] }),
      stream: response.stream,
      orientation: "portrait",
      width: 800,
    }));
    const player = view.getByTestId("video-player");
    await waitFor(() => expect(player.getAttribute("data-status")).toBe("complete"));
    expect(player.getAttribute("data-orientation")).toBe("portrait");
  });

  it("enters an ended state and restarts from zero", async () => {
    let nextFrame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      nextFrame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    const { VideoPlayer } = await import("../src/player/video-player");
    const response = createVideo({ input: "Update" }, {
      generate: async function* () {
        yield {
          type: "scene.add" as const,
          scene: { id: "one", templateId: "customer", variables: {}, timing: { fixedDuration: 1 } },
        };
        yield { type: "plan.complete" as const };
      },
    });
    const view = render(createElement(VideoPlayer, {
      templates: createRenderTemplateRegistry({ templates: [] }),
      stream: response.stream,
    }));
    const player = view.getByTestId("video-player");
    await waitFor(() => expect(player.getAttribute("data-status")).toBe("complete"));
    nextFrame?.(performance.now() + 4_000);
    await waitFor(() => {
      expect(player.getAttribute("data-playing")).toBe("false");
      expect(player.getAttribute("data-ended")).toBe("true");
      expect(player.getAttribute("data-current-time")).toBe("4.000");
    });

    const replay = view.getByRole("button", { name: "Replay video response" });
    expect(replay.textContent).toContain("Replay");
    fireEvent.click(replay);
    expect(player.getAttribute("data-playing")).toBe("true");
    expect(player.getAttribute("data-ended")).toBe("false");
    expect(player.getAttribute("data-current-time")).toBe("0.000");
  });
  it("provides named keyboard playback controls and respects reduced motion", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    const { VideoPlayer } = await import("../src/player/video-player");
    const kit = createRenderTemplateRegistry({
      templates: [defineTemplate({
        id: "notification",
        schema: {
          type: "object",
          properties: { message: { type: "string", default: "Opening" } },
          additionalProperties: false,
        },
        component: ({ variables }) => createElement("div", null, String(variables.message)),
      })],
    });
    const response = createVideo({ input: "Update", opening: "Opening" }, {
      generate: async function* () { yield { type: "plan.complete" as const }; },
    });
    const view = render(createElement(VideoPlayer, {
      templates: kit,
      stream: response.stream,
      width: 360,
      ariaLabel: "Quarterly recap",
    }));
    const player = view.getByTestId("video-player");

    expect(player.getAttribute("role")).toBe("region");
    expect(player.getAttribute("aria-label")).toBe("Quarterly recap");
    expect(player.getAttribute("tabindex")).toBe("0");
    await waitFor(() => expect(player.getAttribute("data-scenes")).toBe("1"));
    expect(player.getAttribute("data-playing")).toBe("false");
    fireEvent.keyDown(player, { key: " " });
    expect(player.getAttribute("data-playing")).toBe("true");
    const control = view.getByRole("button", { name: "Pause video response" });
    expect(control.style.backgroundColor).toBe("rgba(9, 7, 18, 0.88)");
    expect(control.style.color).toBe("rgb(255, 255, 255)");
    expect(control.style.minWidth).toBe("44px");
    expect(control.style.minHeight).toBe("44px");
    fireEvent.keyDown(control, { key: " " });
    expect(player.getAttribute("data-playing")).toBe("true");
    fireEvent.click(control);
    expect(player.getAttribute("data-playing")).toBe("false");
  });

  it("pauses when the system enables reduced motion at runtime", async () => {
    let onChange: ((event: MediaQueryListEvent) => void) | undefined;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => { onChange = listener; },
        removeEventListener: () => undefined,
      }),
    });
    const { VideoPlayer } = await import("../src/player/video-player");
    const kit = createRenderTemplateRegistry({ templates: [] });
    const response = createVideo({ input: "Update" }, {
      generate: async function* () {
        yield {
          type: "scene.add" as const,
          scene: { id: "one", templateId: "customer", variables: {}, timing: { fixedDuration: 3 } },
        };
        yield { type: "plan.complete" as const };
      },
    });
    const view = render(createElement(VideoPlayer, { templates: kit, stream: response.stream }));
    const player = view.getByTestId("video-player");
    expect(player.getAttribute("data-playing")).toBe("true");
    onChange?.({ matches: true } as MediaQueryListEvent);
    await waitFor(() => expect(player.getAttribute("data-playing")).toBe("false"));
  });

  it("pauses soundtrack audio with the playback control", async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { VideoPlayer } = await import("../src/player/video-player");
    const response = createVideo({
      input: "Update",
      audio: { src: "data:audio/wav;base64,UklGRg==" },
    }, {
      generate: async function* () {
        yield {
          type: "scene.add" as const,
          scene: { id: "one", templateId: "customer", variables: {}, timing: { fixedDuration: 3 } },
        };
        yield { type: "plan.complete" as const };
      },
    });
    const view = render(createElement(VideoPlayer, {
      templates: createRenderTemplateRegistry({ templates: [] }),
      stream: response.stream,
    }));
    await waitFor(() => expect(view.container.querySelector("audio")).not.toBeNull());
    fireEvent.click(view.getByRole("button", { name: "Pause video response" }));
    await waitFor(() => expect(pause).toHaveBeenCalled());
  });

  it("applies the configured soundtrack volume while scenes are still streaming", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    let releasePlanner!: () => void;
    const plannerGate = new Promise<void>((resolve) => { releasePlanner = resolve; });
    const { VideoPlayer } = await import("../src/player/video-player");
    const response = createVideo({
      input: "Update",
    }, {
      selectAudio: () => ({
        trackId: "soundtrack",
        audioUrl: "data:audio/wav;base64,UklGRg==",
        duration: 6,
        volume: 0.2,
        beatDetection: { sensitivity: 0.5 },
        beatMarkers: [],
      }),
      generate: async function* () {
        yield { type: "scene.add" as const, scene: { id: "one", templateId: "customer", variables: {}, timing: { fixedDuration: 3 } } };
        await plannerGate;
        yield { type: "plan.complete" as const };
      },
    });
    const view = render(createElement(VideoPlayer, {
      templates: createRenderTemplateRegistry({ templates: [] }),
      stream: response.stream,
    }));

    const audio = await waitFor(() => {
      const element = view.container.querySelector("audio");
      expect(element).not.toBeNull();
      return element!;
    });
    await waitFor(() => expect(view.getByTestId("video-player").getAttribute("data-status")).toBe("streaming"));
    expect(audio.volume).toBe(0.2);
    releasePlanner();
  });

  it("pauses the player when the browser blocks audible autoplay", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new DOMException("Autoplay blocked", "NotAllowedError"));
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const { VideoPlayer } = await import("../src/player/video-player");
    const response = createVideo({
      input: "Update",
      audio: { src: "data:audio/wav;base64,UklGRg==" },
    }, {
      generate: async function* () {
        yield { type: "scene.add" as const, scene: { id: "one", templateId: "customer", variables: {}, timing: { fixedDuration: 3 } } };
        yield { type: "plan.complete" as const };
      },
    });
    const view = render(createElement(VideoPlayer, {
      templates: createRenderTemplateRegistry({ templates: [] }),
      stream: response.stream,
      playbackMode: "autoplay-with-sound",
    }));

    await waitFor(() => expect(view.getByTestId("video-player").getAttribute("data-playing")).toBe("false"));
    expect(view.getByTestId("video-player").getAttribute("data-current-time")).toBe("0.000");
    expect(view.getByRole("button", { name: "Play video with sound" })).toBeDefined();
  });

  it("exposes soundtrack and fullscreen controls like a video player", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });

    const { VideoPlayer } = await import("../src/player/video-player");
    const response = createVideo({
      input: "Update",
      audio: { src: "data:audio/wav;base64,UklGRg==" },
    }, {
      generate: async function* () {
        yield {
          type: "scene.add" as const,
          scene: { id: "one", templateId: "customer", variables: {}, timing: { fixedDuration: 3 } },
        };
        yield { type: "plan.complete" as const };
      },
    });
    const view = render(createElement(VideoPlayer, {
      templates: createRenderTemplateRegistry({ templates: [] }),
      stream: response.stream,
      autoPlay: false,
      startMuted: true,
    }));

    await waitFor(() => expect(view.container.querySelector("audio")).not.toBeNull());
    expect(view.queryByText(/\d+:\d{2}\s*\/\s*\d+:\d{2}/)).toBeNull();
    expect(view.queryByRole("slider", { name: "Video response progress" })).toBeNull();
    const audio = view.container.querySelector("audio")!;
    expect(audio.muted).toBe(true);
    fireEvent.click(view.getByRole("button", { name: "Unmute video response" }));
    expect(audio.muted).toBe(false);
    expect(view.getByRole("button", { name: "Mute video response" })).toBeDefined();

    fireEvent.click(view.getByRole("button", { name: "Enter fullscreen" }));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("reduces a canonical event stream into a responsive playable composition", async () => {
    let api: typeof import("../src/player/video-player") | undefined;
    try {
      api = await import("../src/player/video-player");
    } catch {
      // The assertion below is the expected red phase before the player exists.
    }
    expect(api?.VideoPlayer, "the streaming React player should exist").toBeDefined();
    if (!api?.VideoPlayer) return;

    const kit = createRenderTemplateRegistry({
      templates: [
        defineTemplate({
          id: "media",
          useWhen: "A concise sentence opens on the brand gradient.",
          schema: {
            type: "object",
            properties: {
              texts: { type: "string", default: "Your update is ready." },
              mediaType: { type: "string", enum: ["gradient"], default: "gradient" },
            },
            required: ["texts"],
            additionalProperties: false,
          },
          component: ({ variables }) => createElement("div", null, String(variables.texts)),
        }),
        defineTemplate({
          id: "customerMetric",
          useWhen: "A grounded metric is the proof point.",
          schema: {
            type: "object",
            properties: { value: { type: "number", default: 0 } },
            required: ["value"],
            additionalProperties: false,
          },
          component: ({ variables }) => createElement("div", null, String(variables.value)),
        }),
      ],
    });

    const response = createVideo(
      {
        input: "Activation increased from 41% to 58%.",
        opening: "Your activation update is ready.",
        brand: { name: "Acme", colors: { primary: "#6D5EF5", secondary: "#17122F" } },
      },
      {
        requestId: "request-player",
        runId: "run-player",
        generate: async function* () {
          yield {
            type: "scene.add" as const,
            scene: {
              id: "metric",
              templateId: "customerMetric",
              variables: { value: 58, unit: "%", label: "activation" },
              timing: { fixedDuration: 4 },
            },
          };
          yield { type: "plan.complete" as const, finishReason: "stop" as const };
        },
      },
    );

    const view = render(createElement(api.VideoPlayer, {
      templates: kit,
      stream: response.stream,
      autoPlay: false,
      width: 360,
    }));

    await waitFor(() => {
      expect(view.getByTestId("video-player").getAttribute("data-status")).toBe("complete");
    });

    const player = view.getByTestId("video-player");
    expect(player.getAttribute("data-scenes")).toBe("2");
    expect(player.style.width).toBe("360px");
    expect(player.style.height).toBe("640px");
    expect(player.querySelector('[data-template-id="media"]')).not.toBeNull();
    expect(player.textContent).toContain("Your activation update is ready.");
    expect(view.queryByText("Video response could not finish")).toBeNull();
  });
});
