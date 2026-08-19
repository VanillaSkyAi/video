// ─── List variable parser ──────────────────────────────────────
//
// Single source of truth for parsing list-shaped template variables
// (items, texts, words, steps, itemEmojis, oldItems, newItems, etc.)
//
// Accepts any of:
//   - string[]                          → returned as-is (trimmed, filtered)
//   - { label | name | text | title | value }[]  → text extracted
//   - JSON-encoded array string         → parsed then normalized
//   - comma-separated string            → split on commas
//   - single string / number / boolean  → wrapped as single-item array
//   - null / undefined                  → []
//
// Never splits on semicolons. A single item may contain any punctuation.
// Use this everywhere instead of ad-hoc `.split(",")`.

export function parseList(value: unknown, max?: number): string[] {
  if (value === null || value === undefined) return [];

  let arr: unknown[];

  if (Array.isArray(value)) {
    arr = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    // Try JSON array first — supports real array output from AI
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        arr = Array.isArray(parsed) ? parsed : [trimmed];
      } catch {
        arr = trimmed.split(",");
      }
    } else {
      // Accept a compact comma-separated list.
      arr = trimmed.split(",");
    }
  } else if (typeof value === "number" || typeof value === "boolean") {
    arr = [value];
  } else if (typeof value === "object") {
    arr = [value];
  } else {
    return [];
  }

  const out = arr
    .map((item) => {
      if (item === null || item === undefined) return "";
      if (typeof item === "string") return item.trim();
      if (typeof item === "number" || typeof item === "boolean") return String(item);
      if (typeof item === "object") {
        const o = item as Record<string, unknown>;
        const picked =
          o.label ?? o.name ?? o.text ?? o.title ?? o.description ?? o.value;
        return picked !== undefined ? String(picked).trim() : "";
      }
      return String(item).trim();
    })
    .filter((s) => s.length > 0);

  return typeof max === "number" ? out.slice(0, max) : out;
}
