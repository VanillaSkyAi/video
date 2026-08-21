// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { preloadSceneMedia } from "../src/player/preload-media";

const PHOTO = "https://cdn.test/photo.jpg";
const VIDEO = "https://cdn.test/clip.mp4";
const POSTER = "https://cdn.test/clip-poster.jpg";

let requested: string[];
let RealImage: typeof Image;

beforeEach(() => {
  requested = [];
  RealImage = globalThis.Image;
  class StubImage {
    onerror: (() => void) | null = null;
    set src(value: string) {
      requested.push(value);
    }
  }
  globalThis.Image = StubImage as unknown as typeof Image;
});

afterEach(() => {
  globalThis.Image = RealImage;
});

describe("scene media preloading", () => {
  it("warms a photo backdrop once, however often the scene is seen", () => {
    preloadSceneMedia({ mediaUrl: PHOTO });
    preloadSceneMedia({ mediaUrl: PHOTO });
    expect(requested).toEqual([PHOTO]);
  });

  it("warms a video's poster rather than its stream", () => {
    preloadSceneMedia({ mediaUrl: VIDEO, mediaPoster: POSTER });
    // The stream is left alone on purpose: pre-buffering video is what leaks
    // decoder memory on iOS Safari. The poster is what paints frame one.
    expect(requested).toEqual([POSTER]);
  });

  it("does nothing for scenes with no backdrop to warm", () => {
    preloadSceneMedia({});
    preloadSceneMedia({ mediaUrl: "" });
    preloadSceneMedia({ mediaUrl: PHOTO.replace("photo", "gradient-mode"), mediaType: "gradient" });
    expect(requested).toEqual([]);
  });
});
