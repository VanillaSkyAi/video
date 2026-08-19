import OpenAI from "openai";
import { createVideoHandler } from "@vanillaskyai/video/server";
import { securityOptions } from "./server.js";

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;
if (!apiKey || !model) throw new Error("Set OPENAI_API_KEY and OPENAI_MODEL in the server environment");

const client = new OpenAI({ apiKey });
export const handle = createVideoHandler({
  streamText: async function* ({ systemPrompt, userPrompt, signal }) {
    const stream = await client.responses.create({
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: true,
    }, { signal });

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") yield event.delta;
    }
  },
  ...securityOptions(),
});
