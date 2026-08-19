import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createVideoHandler } from "@vanillaskyai/video/server";
import { securityOptions } from "./server.js";

const modelId = process.env.OPENAI_MODEL;
if (!modelId) throw new Error("Set OPENAI_MODEL in the server environment");

export const handle = createVideoHandler({
  streamText: ({ systemPrompt, userPrompt, signal }) => streamText({
    model: openai(modelId),
    system: systemPrompt,
    prompt: userPrompt,
    abortSignal: signal,
  }),
  ...securityOptions(),
});
