// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preloadSceneMedia } from "../src/player/preload-media";

// The module caches warmed URLs for the session, so every case needs its own.
let unique = 0;
const url = (name: string) => `https://cdn.test/${name}-${(unique += 1)}`;

let imageRequests: string[];
let videoElements: HTMLVideoElement[];
let RealImage: typeof Image;
let createElement: { mockRestore: () => void };
const held: object[] = [];

beforeEach(() => {
  imageRequests = [];
  videoElements = [];
  RealImage = globalThis.Image;
  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      imageRequests.push(value);
      held.push(this);
    }
  }
  globalThis.Image = StubImage as unknown as typeof Image;
  // Warm videos are deliberately detached from the document, so capture them
  // at creation rather than querying the DOM.
  const original = document.createElement.bind(document);
  const spy = vi.fn((tag: string) => {
    const element = original(tag);
    if (tag === "video") videoElements.push(element as HTMLVideoElement);
    return element;
  });
  document.createElement = spy as unknown as typeof document.createElement;
  createElement = { mockRestore: () => { document.createElement = original as typeof document.createElement; } };
});

afterEach(() => {
  globalThis.Image = RealImage;
  createElement.mockRestore();
});

describe("scene media preloading", () => {
  it("warms a photo backdrop once, however often the scene is seen", () => {
    const photo = url("photo.jpg");
    preloadSceneMedia({ mediaUrl: photo });
    preloadSceneMedia({ mediaUrl: photo });
    expect(imageRequests).toEqual([photo]);
  });

  it("warms a video's poster and its stream, poster first", () => {
    const video = url("clip.mp4");
    const poster = url("poster.jpg");
    preloadSceneMedia({ mediaUrl: video, mediaPoster: poster, mediaType: "video" });
    // The poster paints frame one, so it must never queue behind the stream.
    expect(imageRequests).toEqual([poster]);
    expect(videoElements.map((element) => element.src)).toEqual([video]);
    expect(videoElements[0].preload).toBe("auto");
    // Release the single warm slot; the module holds it until the first frame
    // arrives, so leaving it occupied would block every later case.
    videoElements[0].onloadeddata?.(new Event("loadeddata"));
  });

  it("warms one video at a time so decoders cannot pile up on iOS", () => {
    preloadSceneMedia({ mediaUrl: url("a.mp4"), mediaType: "video" });
    preloadSceneMedia({ mediaUrl: url("b.mp4"), mediaType: "video" });
    expect(videoElements).toHaveLength(1);
    videoElements[0].onloadeddata?.(new Event("loadeddata"));
  });

  it("releases a video warm once its first frame is available", () => {
    preloadSceneMedia({ mediaUrl: url("c.mp4"), mediaType: "video" });
    const first = videoElements[0];
    first.onloadeddata?.(new Event("loadeddata"));
    // Freeing the slot lets the next scene warm; keeping the decoder open is
    // what exhausts iOS Safari's media memory.
    preloadSceneMedia({ mediaUrl: url("d.mp4"), mediaType: "video" });
    expect(videoElements).toHaveLength(2);
  });

  it("holds warms alive until they finish, so nothing cancels mid-request", () => {
    preloadSceneMedia({ mediaUrl: url("held.jpg") });
    // A detached Image with no reference can be collected and its request
    // cancelled, which is how a preloader silently does nothing at all.
    const probe = held[held.length - 1] as { onload: (() => void) | null };
    expect(typeof probe.onload).toBe("function");
  });

  it("does nothing for scenes with no backdrop to warm", () => {
    preloadSceneMedia({});
    preloadSceneMedia({ mediaUrl: "" });
    preloadSceneMedia({ mediaUrl: url("gradient.jpg"), mediaType: "gradient" });
    expect(imageRequests).toEqual([]);
    expect(videoElements).toEqual([]);
  });
});
