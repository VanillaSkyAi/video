import "server-only";

import { openai } from "@ai-sdk/openai";

export function createOpenAIModel(modelId: string) {
  return openai(modelId);
}
