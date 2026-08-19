/** True only when appending closing quotes/brackets turns a JSON prefix into valid JSON. */
export function isConfidentlyTruncatedJson(source: string): boolean {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const character of source) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{" || character === "[") stack.push(character);
    else if (character === "}" || character === "]") {
      const expected = character === "}" ? "{" : "[";
      if (stack.pop() !== expected) return false;
    }
  }
  if (!inString && stack.length === 0) return false;
  let completed = source;
  if (inString && !escaped) completed += '"';
  else if (inString && escaped) return false;
  completed += stack.reverse().map((open) => open === "{" ? "}" : "]").join("");
  try { JSON.parse(completed); return true; } catch { return false; }
}
