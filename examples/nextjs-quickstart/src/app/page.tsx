"use client";

import { useState } from "react";
import { VideoPlayer, useVideo } from "@vanillaskyai/video/react";

export default function Page() {
  const [input, setInput] = useState(
    "Activation increased from 41% to 58% after guided onboarding.",
  );
  const video = useVideo();

  return <main>
    <h1>VanillaSky quickstart</h1>
    <label>
      Grounded input
      <textarea value={input} onChange={(event) => setInput(event.target.value)} />
    </label>
    <button
      disabled={!input.trim() || video.status === "streaming"}
      onClick={() => { void video.generate({
        input,
        personalization: { firstName: "Maya" },
      }); }}
    >
      Generate video
    </button>
    <output data-testid="status">{video.status}</output>
    {video.error && <p role="alert">{video.error.message}</p>}
    <VideoPlayer {...video.playerProps} />
  </main>;
}
