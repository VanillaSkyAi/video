import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createVideoHandler } from "@vanillaskyai/video/server";

const model = openai(process.env.OPENAI_MODEL ?? "gpt-4.1");

const handle = createVideoHandler({
  authorize: (request) => {
    if (process.env.NODE_ENV !== "development") return false;
    const hostname = new URL(request.url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  },
  streamText: ({ systemPrompt, userPrompt, signal }) => streamText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    abortSignal: signal,
  }),
});

export const POST = handle;
export const OPTIONS = handle;
