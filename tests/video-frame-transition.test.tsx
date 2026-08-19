// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { createElement, lazy, useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Video } from "../src/internal";
import { VideoFrame } from "../src/player/video-frame";
import { createRenderTemplateRegistry, defineTemplate } from "../src/visual-system/catalog/internal";
import { TEST_VIDEO_STYLE } from "./semantic-brand-fixture";

describe("VideoFrame transition ownership", () => {
  it("plays the complete final-scene lifecycle, then exposes its readable poster frame", () => {
    const final = defineTemplate({
      id: "terminal-poster",
      usesGlobalTransition: true,
      transitionTiming: { entryReadyProgress: 0.2, holdProgress: 0.7 },
      schema: { type: "object", properties: {}, additionalProperties: false },
      component: ({ progress, motionProgress }) => createElement("div", {
        "data-progress": progress.toFixed(3),
        "data-motion-progress": motionProgress?.toFixed(3),
      }),
    });
    const kit = createRenderTemplateRegistry({ templates: [final] });
    const config: Video = {
      schemaVersion: "0.1",
      orientation: "portrait",
      style: TEST_VIDEO_STYLE,
      scenes: [{
        id: "final-scene",
        templateId: final.id,
        variables: {},
        timing: { fixedDuration: 5 },
      }],
    };
    const props = { kit, config, width: 540, height: 960 };
    const view = render(createElement(VideoFrame, { ...props, time: 4.99 }));
    expect(view.container.querySelector("[data-progress]")?.getAttribute("data-progress")).toBe("0.998");
    expect(view.container.querySelector("[data-motion-progress]")?.getAttribute("data-motion-progress")).toBe("0.998");

    view.rerender(createElement(VideoFrame, { ...props, time: 5 }));
    expect(view.container.querySelector("[data-progress]")?.getAttribute("data-progress")).toBe("1.000");
    expect(view.container.querySelector("[data-motion-progress]")?.getAttribute("data-motion-progress")).toBe("0.700");
  });

  it("keeps the incoming component mounted and makes only the dominant layer interactive", () => {
    const mounted = vi.fn();
    const unmounted = vi.fn();
    const opening = defineTemplate({
      id: "opening",
      usesGlobalTransition: true,
      transitionTiming: { entryReadyProgress: 0.2, holdProgress: 0.7 },
      schema: { type: "object", properties: {}, additionalProperties: false },
      component: () => createElement("button", null, "Opening action"),
    });
    const incoming = defineTemplate({
      id: "incoming",
      usesGlobalTransition: true,
      transitionTiming: { entryReadyProgress: 0.2, holdProgress: 0.7 },
      schema: { type: "object", properties: {}, additionalProperties: false },
      component: () => {
        useEffect(() => {
          mounted();
          return unmounted;
        }, []);
        return createElement("button", null, "Incoming action");
      },
    });
    const kit = createRenderTemplateRegistry({ templates: [opening, incoming] });
    const config: Video = {
      schemaVersion: "0.1",
      orientation: "portrait",
      style: { ...TEST_VIDEO_STYLE, defaultTransition: "crossfade" },
      scenes: [
        { id: "opening-scene", templateId: "opening", variables: { mediaUrl: "opening.jpg" }, timing: { fixedDuration: 5 } },
        { id: "incoming-scene", templateId: "incoming", variables: { mediaUrl: "incoming.jpg" }, timing: { fixedDuration: 6 } },
      ],
    };
    const props = { kit, config, width: 540, height: 960 };
    const view = render(createElement(VideoFrame, { ...props, time: 0 }));
    expect(view.container.querySelector('[data-scene-layer="active"]')?.getAttribute("data-layer-scene-id")).toBe("opening-scene");
    view.rerender(createElement(VideoFrame, { ...props, time: 4.85 }));
    const outgoing = view.container.querySelector<HTMLElement>('[data-scene-layer="outgoing"]')!;
    const entering = view.container.querySelector<HTMLElement>('[data-scene-layer="incoming"]')!;
    expect({ zIndex: outgoing.style.zIndex, pointerEvents: outgoing.style.pointerEvents }).toEqual({
      zIndex: "1",
      pointerEvents: "auto",
    });
    expect(outgoing.hasAttribute("aria-hidden")).toBe(false);
    expect({ zIndex: entering.style.zIndex, pointerEvents: entering.style.pointerEvents }).toEqual({
      zIndex: "2",
      pointerEvents: "none",
    });
    expect(entering.getAttribute("aria-hidden")).toBe("true");
    expect(entering.hasAttribute("inert")).toBe(true);
    expect(mounted).toHaveBeenCalledTimes(1);

    view.rerender(createElement(VideoFrame, { ...props, time: 4.99 }));
    expect(view.container.querySelector('[data-scene-layer="outgoing"]')?.hasAttribute("aria-hidden")).toBe(false);
    expect(view.container.querySelector('[data-scene-layer="incoming"]')?.getAttribute("aria-hidden")).toBe("true");

    view.rerender(createElement(VideoFrame, { ...props, time: 5 }));
    expect(view.container.querySelector('[data-scene-layer="active"]')?.getAttribute("data-layer-scene-id")).toBe("incoming-scene");
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();

    view.rerender(createElement(VideoFrame, { ...props, time: 4.6 }));
    expect(view.container.querySelector('[data-scene-layer="active"]')?.getAttribute("data-layer-scene-id")).toBe("opening-scene");
    expect(unmounted).toHaveBeenCalledTimes(1);

    view.rerender(createElement(VideoFrame, { ...props, time: 12 }));
    expect(view.container.querySelector('[data-scene-layer="active"]')?.getAttribute("data-layer-scene-id")).toBe("incoming-scene");
    expect(mounted).toHaveBeenCalledTimes(2);
  });

  it("preserves a suspense-resolved media node from incoming transition through settlement", async () => {
    const mounted = vi.fn();
    const unmounted = vi.fn();
    const opening = defineTemplate({
      id: "opening-media-probe",
      usesGlobalTransition: true,
      transitionTiming: { entryReadyProgress: 0.2, holdProgress: 0.7 },
      schema: { type: "object", properties: {}, additionalProperties: false },
      component: () => createElement("div", null, "Opening"),
    });
    const LazyMedia = lazy(async () => ({
      default: () => {
        useEffect(() => {
          mounted();
          return unmounted;
        }, []);
        return createElement("video", { "data-testid": "transition-media", muted: true });
      },
    }));
    const media = defineTemplate({
      id: "incoming-media-probe",
      usesGlobalTransition: true,
      transitionTiming: { entryReadyProgress: 0.2, holdProgress: 0.7 },
      schema: { type: "object", properties: {}, additionalProperties: false },
      component: () => createElement(LazyMedia),
    });
    const kit = createRenderTemplateRegistry({ templates: [opening, media] });
    const config: Video = {
      schemaVersion: "0.1",
      orientation: "portrait",
      style: { ...TEST_VIDEO_STYLE, defaultTransition: "crossfade" },
      scenes: [
        { id: "opening", templateId: opening.id, variables: { mediaUrl: "opening.jpg" }, timing: { fixedDuration: 5 } },
        { id: "media", templateId: media.id, variables: { mediaUrl: "incoming.mp4", mediaType: "video" }, timing: { fixedDuration: 5 } },
      ],
    };
    const props = { kit, config, width: 540, height: 960 };
    const view = render(createElement(VideoFrame, { ...props, time: 4.85 }));
    const transitioningNode = await view.findByTestId("transition-media");
    await waitFor(() => expect(mounted).toHaveBeenCalledTimes(1));

    view.rerender(createElement(VideoFrame, { ...props, time: 5 }));
    expect(view.getByTestId("transition-media")).toBe(transitioningNode);
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();

    view.rerender(createElement(VideoFrame, { ...props, time: 4.6 }));
    expect(unmounted).toHaveBeenCalledTimes(1);
  });
});
