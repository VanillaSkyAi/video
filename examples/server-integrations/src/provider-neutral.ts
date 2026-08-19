import { createVideoHandler } from "@vanillaskyai/video/server";
import { securityOptions } from "./server.js";

export const handle = createVideoHandler({
  streamText: async function* ({ signal }) {
    if (signal.aborted) throw signal.reason;
    yield '{"type":"scene.add","scene":{"id":"result","templateId":"bigNumber","variables":{"texts":"Your quarter","value":142,"label":"conversations"},"timing":{"fixedDuration":4}}}\n';
    yield '{"type":"plan.complete"}\n';
  },
  ...securityOptions(),
});
