import { createRoot } from "react-dom/client";
import { VideoPlayer, useVideo } from "@vanillaskyai/video/react";
import { templates } from "./templates";
import "./styles.css";

function App() {
  const video = useVideo({ endpoint: "/api/video", templates });
  return <main>
    <h1>VanillaSky</h1>
    <button onClick={() => video.generate({ input: "Revenue grew from 4.2M to 5.1M" })}>
      Generate video
    </button>
    {video.error && <p role="alert">Video generation failed.</p>}
    <VideoPlayer {...video.playerProps} />
    <pre>{JSON.stringify(video.video ?? null, null, 2)}</pre>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
