import { streamText } from "ai";
import { getVideoModel } from "./provider";

export const streamVideoPlan = ({ systemPrompt, userPrompt, signal }: {
  systemPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
}) => streamText({
  model: getVideoModel(),
  system: systemPrompt,
  prompt: userPrompt,
  abortSignal: signal,
});
