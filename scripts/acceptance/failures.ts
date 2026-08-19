export type AcceptanceFailureCategory =
  | "network"
  | "authentication"
  | "model_not_found"
  | "rate_limit"
  | "provider"
  | "planner_parse"
  | "scene_validation"
  | "unknown";

export function classifyAcceptanceFailure(error: unknown): AcceptanceFailureCategory {
  const value = error as { code?: string; status?: number; message?: string };
  const message = value?.message?.toLowerCase() ?? "";
  if (["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(value?.code ?? "")) return "network";
  if (value?.status === 401 || value?.status === 403) return "authentication";
  if (value?.status === 404 || message.includes("model_not_found")) return "model_not_found";
  if (value?.status === 429) return "rate_limit";
  if (error instanceof SyntaxError || message.includes("parse") || message.includes("json")) return "planner_parse";
  if (message.includes("scene validation") || message.includes("invalid scene")) return "scene_validation";
  if (typeof value?.status === "number" && value.status >= 400) return "provider";
  return "unknown";
}
