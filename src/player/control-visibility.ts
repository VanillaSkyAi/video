import { createFullscreenController, type FullscreenController } from "./fullscreen.js";

const STYLE_ID = "vanillasky-player-control-visibility";

interface SoundtrackOutput {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

const outputs = new Map<HTMLAudioElement, SoundtrackOutput>();
const fullscreenControllers = new Map<HTMLElement, FullscreenController>();

export async function togglePlayerFullscreen(container: HTMLElement, onModeChange: (mode: "none" | "native" | "fallback") => void): Promise<void> {
  let controller = fullscreenControllers.get(container);
  if (!controller) {
    controller = createFullscreenController(container, onModeChange);
    fullscreenControllers.set(container, controller);
  }
  await controller.toggle();
}

function dispose(audio: HTMLAudioElement): void {
  const output = outputs.get(audio);
  if (!output) return;
  output.source.disconnect();
  output.gain.disconnect();
  void output.context.close();
  outputs.delete(audio);
  delete audio.dataset.audioOutput;
  Reflect.deleteProperty(audio, "volume");
}

export default function attachSoundtrack(audio: HTMLAudioElement, context: AudioContext, initialVolume: number): void {
  const existing = outputs.get(audio);
  if (existing) {
    void context.close();
    void existing.context.resume().catch(() => undefined);
    return;
  }
  const original = audio.volume;
  let settable = false;
  try {
    audio.volume = original === 0.5 ? 0.25 : 0.5;
    settable = audio.volume !== original;
    audio.volume = original;
  } catch {
    // iOS may reject element-volume writes; the gain fallback still works.
  }
  try {
    const url = new URL(audio.currentSrc || audio.src, document.baseURI);
    if (settable || (url.origin !== location.origin && url.protocol !== "blob:" && url.protocol !== "data:")) {
      audio.dataset.audioOutput = "true";
      void context.close();
      return;
    }
    const source = context.createMediaElementSource(audio);
    const gain = context.createGain();
    let volume = initialVolume;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(context.destination);
    Object.defineProperty(audio, "volume", {
      configurable: true,
      get: () => volume,
      set: (next: number) => {
        volume = next;
        gain.gain.value = next;
      },
    });
    audio.dataset.audioOutput = "true";
    outputs.set(audio, { context, source, gain });
  } catch {
    void context.close();
  }
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const audio = target.closest<HTMLElement>('[data-testid="video-player"]')?.querySelector<HTMLAudioElement>("audio");
  const output = audio ? outputs.get(audio) : undefined;
  if (output) void output.context.resume().catch(() => undefined);
}, true);

new MutationObserver(() => {
  for (const audio of outputs.keys()) {
    if (!audio.isConnected) dispose(audio);
  }
  for (const [container, controller] of fullscreenControllers) {
    if (!container.isConnected) {
      controller.dispose();
      fullscreenControllers.delete(container);
    }
  }
}).observe(document, { childList: true, subtree: true });

if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
      [data-testid="video-controls"] { opacity: 1; transition: opacity 160ms ease; }
      [data-playing="true"] > [data-testid="video-controls"] { opacity: 0; }
      [data-playing="true"][data-touch-controls="true"] > [data-testid="video-controls"],
      [data-playing="true"]:focus-visible > [data-testid="video-controls"],
      [data-playing="true"] > [data-testid="video-controls"]:has(:focus-visible) { opacity: 1; }
      [data-playing="true"] > [data-testid="video-controls"] > div { pointer-events: none; }
      [data-playing="true"][data-touch-controls="true"] > [data-testid="video-controls"] > div,
      [data-playing="true"]:focus-visible > [data-testid="video-controls"] > div,
      [data-playing="true"] > [data-testid="video-controls"]:has(:focus-visible) > div { pointer-events: auto; }
      @media (hover: hover) {
        [data-playing="true"]:hover > [data-testid="video-controls"] { opacity: 1; }
        [data-playing="true"]:hover > [data-testid="video-controls"] > div { pointer-events: auto; }
      }
  `;
  document.head.append(style);
  document.addEventListener("touchstart", (event) => {
    const target = event.target as Element;
    const container = target.closest<HTMLElement>('[data-testid="video-player"]');
    if (container && !target.closest("button")) {
      container.dataset.touchControls = String(container.dataset.touchControls !== "true");
    }
  });
}
