"use client";

import { useEffect, useState } from "react";
import { getVideoDuration, parseVideo, type Video } from "@vanillaskyai/video";
import { VideoError, VideoPlayer, useVideo } from "@vanillaskyai/video/react";
import { templates } from "../../vanillasky";

const SAVED_VIDEO_KEY = "vanillasky-quickstart-video";

interface SafeFailure {
  code: string;
  message: string;
  status?: number;
}

export default function Page() {
  const [input, setInput] = useState("Activation increased from 41% to 58% after guided onboarding.");
  const [savedVideo, setSavedVideo] = useState<Video>();
  const [failure, setFailure] = useState<SafeFailure>();
  const video = useVideo({ templates });

  useEffect(() => {
    const stored = localStorage.getItem(SAVED_VIDEO_KEY);
    if (!stored) return;
    try {
      setSavedVideo(parseVideo(JSON.parse(stored)));
    } catch {
      localStorage.removeItem(SAVED_VIDEO_KEY);
      setFailure({ code: "invalid_saved_video", message: "The saved video could not be replayed." });
    }
  }, []);

  async function generate() {
    setFailure(undefined);
    try {
      const completed = await video.generate({
        input,
        maxDurationSec: 12,
        personalization: { viewer: "First-time SDK developer" },
      });
      localStorage.setItem(SAVED_VIDEO_KEY, JSON.stringify(completed));
      setSavedVideo(parseVideo(completed));
    } catch (error) {
      setFailure(error instanceof VideoError
        ? { code: error.code, message: error.message, status: error.status }
        : { code: "video_failed", message: "The video could not be generated." });
    }
  }

  return <main>
    <h1>VanillaSky quickstart</h1>
    <label>
      Grounded input
      <textarea value={input} onChange={(event) => setInput(event.target.value)} />
    </label>
    <button
      disabled={!input.trim() || video.status === "streaming"}
      onClick={() => { void generate(); }}
    >
      Generate video
    </button>
    <output data-testid="status">{video.status}</output>
    {(failure ?? video.error) && <p role="alert">
      {(failure ?? video.error)?.code}: {(failure ?? video.error)?.message}
    </p>}
    {video.warnings.length > 0 && <ul aria-label="Generation warnings">
      {video.warnings.map((warning) => <li key={`${warning.code}-${warning.sceneId ?? "run"}`}>
        {warning.category}/{warning.code}: {warning.message}
      </li>)}
    </ul>}
    <VideoPlayer {...video.playerProps} />
    <pre>{JSON.stringify(video.video ?? null, null, 2)}</pre>

    {savedVideo && <section aria-label="Saved replay">
      <h2>Saved replay</h2>
      <p data-testid="saved-duration">{getVideoDuration(savedVideo)} seconds</p>
      <VideoPlayer video={savedVideo} templates={templates} autoPlay={false} />
    </section>}
  </main>;
}
