import { createFullscreenController, type FullscreenController } from "./fullscreen.js";

const STYLE_ID = "vanillasky-player-control-visibility";

interface SoundtrackOutput {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

interface SoundtrackPlayer {
  context: AudioContext;
  audio?: HTMLAudioElement;
  output?: SoundtrackOutput;
}

const soundtrackPlayers = new Map<HTMLElement, SoundtrackPlayer>();
const fullscreenControllers = new Map<HTMLElement, FullscreenController>();

export async function togglePlayerFullscreen(container: HTMLElement, onModeChange: (mode: "none" | "native" | "fallback") => void): Promise<void> {
  let controller = fullscreenControllers.get(container);
  if (!controller) {
    controller = createFullscreenController(container, onModeChange);
    fullscreenControllers.set(container, controller);
  }
  await controller.toggle();
}

function detachSoundtrack(player: SoundtrackPlayer): void {
  player.output?.source.disconnect();
  player.output?.gain.disconnect();
  if (player.audio) {
    delete player.audio.dataset.audioOutput;
    if (player.output) Reflect.deleteProperty(player.audio, "volume");
  }
  delete player.audio;
  delete player.output;
}

function routeSoundtrack(container: HTMLElement, player: SoundtrackPlayer, audio: HTMLAudioElement): void {
  if (player.audio === audio) return;
  detachSoundtrack(player);
  player.audio = audio;
  audio.dataset.audioOutput = "true";
  const url = new URL(audio.currentSrc || audio.src, document.baseURI);
  if (url.origin !== location.origin && url.protocol !== "blob:" && url.protocol !== "data:") return;
  try {
    const source = player.context.createMediaElementSource(audio);
    const gain = player.context.createGain();
    let volume = Number(audio.dataset.v ?? 1);
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(player.context.destination);
    Object.defineProperty(audio, "volume", {
      configurable: true,
      get: () => volume,
      set: (next: number) => {
        volume = next;
        gain.gain.value = next;
      },
    });
    player.output = { source, gain };
  } catch {
    detachSoundtrack(player);
    void player.context.close();
    soundtrackPlayers.delete(container);
  }
}

export default function attachSoundtrack(audio: HTMLAudioElement, context: AudioContext): void {
  const container = audio.closest<HTMLElement>('[data-testid="video-player"]');
  if (!container?.isConnected || !audio.isConnected) {
    void context.close();
    return;
  }
  const existing = soundtrackPlayers.get(container);
  if (existing) {
    void context.close();
    void existing.context.resume().catch(() => undefined);
    routeSoundtrack(container, existing, audio);
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
  if (settable) {
    audio.dataset.audioOutput = "true";
    void context.close();
    return;
  }
  const player = { context };
  soundtrackPlayers.set(container, player);
  routeSoundtrack(container, player, audio);
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const container = target.closest<HTMLElement>('[data-testid="video-player"]');
  const player = container ? soundtrackPlayers.get(container) : undefined;
  if (player) void player.context.resume().catch(() => undefined);
}, true);

new MutationObserver(() => {
  for (const [container, player] of soundtrackPlayers) {
    if (!container.isConnected) {
      detachSoundtrack(player);
      void player.context.close();
      soundtrackPlayers.delete(container);
    } else {
      const audio = container.querySelector<HTMLAudioElement>("audio");
      if (audio) routeSoundtrack(container, player, audio);
      else detachSoundtrack(player);
    }
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
