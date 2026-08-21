const STYLE_ID = "vanillasky-player-control-visibility";
export {};

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
