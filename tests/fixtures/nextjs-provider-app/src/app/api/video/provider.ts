import "server-only";

import { createAnthropicModel } from "./providers/anthropic";
import { createOpenAIModel } from "./providers/openai";

type VideoProvider = "openai" | "anthropic";

function configuredProvider(): VideoProvider {
  const provider = process.env.VIDEO_PROVIDER;
  if (provider === "openai" || provider === "anthropic") return provider;
  throw new Error("Set VIDEO_PROVIDER to openai or anthropic in the server environment");
}

function configuredModel(): string {
  const model = process.env.VIDEO_MODEL?.trim();
  if (!model) throw new Error("Set VIDEO_MODEL in the server environment");
  return model;
}

export function getVideoModel() {
  const provider = configuredProvider();
  const modelId = configuredModel();
  return provider === "openai"
    ? createOpenAIModel(modelId)
    : createAnthropicModel(modelId);
}
