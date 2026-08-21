const STYLE_ID = "vanillasky-player-control-visibility";
export {};

type WebkitAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
const soundtrackOutputs = new WeakMap<HTMLAudioElement, AudioContext>();

function unlockSoundtrack(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const audio = target.closest<HTMLElement>('[data-testid="video-player"]')?.querySelector<HTMLAudioElement>("audio");
  if (!audio) return;
  const existing = soundtrackOutputs.get(audio);
  if (existing) {
    void existing.resume().catch(() => undefined);
    return;
  }
  const original = audio.volume;
  try {
    audio.volume = original === 0.5 ? 0.25 : 0.5;
    const settable = audio.volume !== original;
    audio.volume = original;
    if (settable) return;
  } catch {
    // Continue to the gain fallback when element volume is device-controlled.
  }
  try {
    const url = new URL(audio.currentSrc || audio.src, document.baseURI);
    if (url.origin !== location.origin && url.protocol !== "blob:" && url.protocol !== "data:") return;
    const Context = window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    const source = context.createMediaElementSource(audio);
    const gain = context.createGain();
    let volume = Number(audio.dataset.volume ?? original);
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
    soundtrackOutputs.set(audio, context);
    void context.resume().catch(() => undefined);
  } catch {
    // Keep direct media-element playback if Web Audio setup is unavailable.
  }
}

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
  document.addEventListener("click", unlockSoundtrack, true);
}
