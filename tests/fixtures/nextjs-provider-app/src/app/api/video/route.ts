import { createVideoHandler } from "@vanillaskyai/video/server";
import { templates } from "../../../../vanillasky/server";
import { streamVideoPlan } from "./planner";

const handle = createVideoHandler({
  templates,
  // This deterministic compatibility fixture intentionally produces one body
  // scene. Ordinary AI planners should keep the default closer requirement.
  requireCloser: false,
  // This local-only bypass makes the copied quickstart runnable in development.
  // Replace it with your application's session check before deploying.
  authorize: (request) => {
    if (process.env.VANILLASKY_LOCAL_DEMO !== "1") return false;
    const hostname = new URL(request.url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  },
  streamText: streamVideoPlan,
  onWarning: (warning) => console.warn(JSON.stringify({
    event: "video.warning",
    code: warning.code,
    category: warning.category,
    recoverable: warning.recoverable,
  })),
  onComplete: (summary) => console.info(JSON.stringify({
    event: "video.complete",
    finishReason: summary.finishReason,
    usage: summary.usage,
    requestedModelId: summary.requestedModelId,
    resolvedModelId: summary.resolvedModelId,
    totalDurationMs: summary.totalDurationMs,
    acceptedSceneCount: summary.acceptedSceneCount,
    rejectedSceneCount: summary.rejectedSceneCount,
    videoDurationSec: summary.videoDurationSec,
  })),
  onError: (error) => console.error(JSON.stringify({
    event: "video.error",
    name: error.name,
  })),
});

export const POST = handle;
export const OPTIONS = handle;
