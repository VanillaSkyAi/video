import type { Video } from "./types.js";
import { stableJson } from "./stable-json.js";

/** Deterministic replay checksum. This detects drift; it is not a cryptographic signature. */
export function checksumVideo(config: Video): string {
  const input = stableJson(config);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}
