export function parseNpmPackJson(output) {
  for (let index = output.lastIndexOf("["); index >= 0; index = output.lastIndexOf("[", index - 1)) {
    try {
      const parsed = JSON.parse(output.slice(index).trim());
      if (Array.isArray(parsed) && typeof parsed[0]?.filename === "string") return parsed;
    } catch {
      // npm can prefix JSON with lifecycle output; keep looking for the final payload.
    }
  }
  throw new Error("npm pack did not return a valid JSON artifact description");
}
