import "server-only";

import { anthropic } from "@ai-sdk/anthropic";

export function createAnthropicModel(modelId: string) {
  return anthropic(modelId);
}
