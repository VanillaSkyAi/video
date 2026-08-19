#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const check = process.argv.slice(2).includes("--check");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const registryDir = join(root, "registry", "items");
const drift = [];
const generatedCatalogSource = readFileSync(join(root, "src", "visual-system", "catalog", "catalog.generated.ts"), "utf8");
const catalogStart = generatedCatalogSource.indexOf("= [") + 2;
const catalogEnd = generatedCatalogSource.indexOf(" as const satisfies readonly SceneTemplateMetadata[];");
const catalog = JSON.parse(generatedCatalogSource.slice(catalogStart, catalogEnd));
const metadataById = new Map(catalog.map((template) => [template.id, template]));

function publicSource(path) {
  return readFileSync(join(root, path), "utf8")
    .replaceAll("import.meta.env.DEV", "(import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV");
}

for (const name of readdirSync(registryDir).filter((entry) => entry.endsWith(".json")).sort()) {
  const path = join(registryDir, name);
  const item = JSON.parse(readFileSync(path, "utf8"));
  const vanillasky = item.meta?.vanillasky;
  const canonical = vanillasky?.layer === "template" ? metadataById.get(item.name) : undefined;
  if (canonical) {
    item.title = canonical.label ?? item.title;
    item.description = canonical.description ?? canonical.useWhen ?? item.description;
    for (const key of Object.keys(vanillasky)) {
      if (key !== "layer" && key !== "tier" && !(key in canonical)) delete vanillasky[key];
    }
    Object.assign(vanillasky, {
      ...canonical,
    });
    delete vanillasky.id;
  }
  for (const file of item.files ?? []) {
    if (typeof file.path === "string") file.content = publicSource(file.path);
  }
  const expected = `${JSON.stringify(item, null, 2)}\n`;
  if (readFileSync(path, "utf8") !== expected) {
    drift.push(`registry/items/${name}`);
    if (!check) writeFileSync(path, expected);
  }
}

if (check && drift.length) {
  throw new Error(`Registry is out of sync:\n${drift.map((path) => `- ${path}`).join("\n")}\nRun npm run registry:sync.`);
}

console.log(check
  ? `Registry check passed (${readdirSync(registryDir).filter((entry) => entry.endsWith(".json")).length} items).`
  : `Synchronized ${drift.length} registry files from canonical public source.`);
