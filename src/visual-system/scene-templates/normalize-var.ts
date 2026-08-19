/**
 * normalize-var — Defensive parsing for structured template variables.
 *
 * LLMs may pass variables as colon-separated strings (expected), JSON strings,
 * or raw objects. These helpers normalize any format to the colon-separated
 * string that existing template parsers expect.
 */

/**
 * Normalize a structured variable (e.g. notif1, transaction1) to a colon-separated string.
 *
 * Accepts:
 *  - Colon-separated string: "🔔:App:Hello:1m" → passed through
 *  - JSON string: '{"emoji":"🔔","app":"App"}' → parsed and mapped
 *  - Object: {emoji: "🔔", app: "App"} → mapped to colon-separated
 *
 * @param raw - The variable value (string, object, or unknown)
 * @param keyAliases - Array of alias arrays, one per field position.
 *   e.g. [["emoji"], ["app", "title", "appName"], ["message", "body", "text"], ["time"]]
 */
export function normalizeStructuredVar(
  raw: unknown,
  keyAliases: string[][],
): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      try {
        const obj = JSON.parse(trimmed);
        if (typeof obj === "object" && obj !== null) {
          return extractFromObject(obj, keyAliases);
        }
      } catch {
        // Not valid JSON — pass through as regular string
      }
    }
    return raw;
  }

  if (typeof raw === "object" && raw !== null) {
    return extractFromObject(raw as Record<string, unknown>, keyAliases);
  }

  return String(raw || "");
}

function extractFromObject(
  obj: Record<string, unknown>,
  keyAliases: string[][],
): string {
  return keyAliases
    .map((aliases) => {
      for (const key of aliases) {
        if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
          return String(obj[key]);
        }
      }
      return "";
    })
    .join(":");
}

/**
 * Normalize a simple text variable for chat templates (msg1-msg4).
 *
 * Accepts:
 *  - Plain string: "Hello" → passed through
 *  - String with side: "Hello|in" → passed through
 *  - JSON string: '{"text":"Hello","side":"in"}' → "Hello|in"
 *  - Object: {text: "Hello", side: "in"} → "Hello|in"
 */
export function normalizeTextVar(raw: unknown): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      try {
        const obj = JSON.parse(trimmed);
        if (typeof obj === "object" && obj !== null) {
          return extractTextFromObject(obj);
        }
      } catch {
        // Not valid JSON
      }
    }
    return raw;
  }

  if (typeof raw === "object" && raw !== null) {
    return extractTextFromObject(raw as Record<string, unknown>);
  }

  return String(raw || "");
}

function extractTextFromObject(obj: Record<string, unknown>): string {
  const text = String(
    obj.text || obj.message || obj.body || obj.content || "",
  );
  const side = String(obj.side || obj.direction || "").toLowerCase();
  if (
    side === "in" ||
    side === "left" ||
    side === "incoming" ||
    side === "received"
  ) {
    return text + "|in";
  }
  if (
    side === "out" ||
    side === "right" ||
    side === "outgoing" ||
    side === "sent"
  ) {
    return text + "|out";
  }
  return text;
}
