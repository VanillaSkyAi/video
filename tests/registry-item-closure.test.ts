import { readFileSync, readdirSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const registryDir = resolve(import.meta.dirname, "../registry/items");
const SIBLING_IMPORT = /(?:from|import)\s+["'](\.\/[^"']*)["']/g;
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

interface RegistryItem {
  name: string;
  files?: Array<{ path: string; content: string }>;
  registryDependencies?: string[];
}

const items = new Map<string, RegistryItem>(
  readdirSync(registryDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const item = JSON.parse(readFileSync(join(registryDir, name), "utf8")) as RegistryItem;
      return [name, item];
    }),
);
const byName = new Map([...items.values()].map((item) => [item.name, item]));

/** Files this item installs, plus everything its dependencies install. */
function reachableFiles(item: RegistryItem, seen = new Set<string>()): Set<string> {
  const paths = new Set((item.files ?? []).map((file) => file.path));
  for (const dependency of item.registryDependencies ?? []) {
    const name = dependency.replace(/^@vanillasky\//, "");
    if (seen.has(name)) continue;
    seen.add(name);
    const dependencyItem = byName.get(name);
    if (!dependencyItem) continue;
    for (const path of reachableFiles(dependencyItem, seen)) paths.add(path);
  }
  return paths;
}

/**
 * A registry item's `files` list is hand-maintained — the sync script only
 * refreshes each file's content. Adding an import to shared template source
 * therefore ships customers a module that imports a file nobody installed,
 * and `vanillasky add` emits source that cannot compile. Nothing else in the
 * suite notices, because the generated JSON stays internally consistent.
 */
describe("registry item file closure", () => {
  it.each([...items.keys()])("%s installs every sibling module its source imports", (name) => {
    const item = items.get(name) as RegistryItem;
    const available = reachableFiles(item);
    const missing: string[] = [];

    for (const file of item.files ?? []) {
      const dir = posix.dirname(file.path);
      for (const [, specifier] of file.content.matchAll(SIBLING_IMPORT)) {
        const target = posix.normalize(posix.join(dir, specifier.replace(/\.js$/, "")));
        if (!EXTENSIONS.some((extension) => available.has(`${target}${extension}`))) {
          missing.push(`${file.path} → ${specifier}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
