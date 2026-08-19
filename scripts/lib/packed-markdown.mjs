import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

function listRelativeFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const relativePath = prefix ? join(prefix, entry.name) : entry.name;
      return entry.isDirectory()
        ? listRelativeFiles(join(directory, entry.name), relativePath)
        : [relativePath];
    });
}

function markdownDestination(rawTarget) {
  const trimmed = rawTarget.trim();
  if (trimmed.startsWith("<")) {
    const closingBracket = trimmed.indexOf(">");
    return closingBracket < 0 ? trimmed : trimmed.slice(1, closingBracket);
  }
  return /^(\S+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/.exec(trimmed)?.[1] ?? trimmed;
}

function isWithin(root, target) {
  return target === root || target.startsWith(`${root}${sep}`);
}

export function verifyPackedMarkdownDocumentation({ packageRoot, repositoryRoot }) {
  const documentation = listRelativeFiles(packageRoot).filter((path) => path.endsWith(".md"));
  if (documentation.length === 0) throw new Error("Packed package contains no Markdown documentation");

  const canonicalPackageRoot = realpathSync(packageRoot);
  for (const docRelative of documentation) {
    const repositoryDocument = join(repositoryRoot, docRelative);
    const packedDocument = join(canonicalPackageRoot, docRelative);
    if (!existsSync(repositoryDocument) || !readFileSync(repositoryDocument).equals(readFileSync(packedDocument))) {
      throw new Error(`Packed documentation differs from repository source: ${docRelative}`);
    }

    const markdown = readFileSync(packedDocument, "utf8");
    for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const destination = markdownDestination(match[1]);
      if (!destination || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(destination)) continue;
      const target = destination.split(/[?#]/)[0];
      if (!target) continue;

      const resolvedTarget = resolve(canonicalPackageRoot, dirname(docRelative), decodeURI(target));
      if (!isWithin(canonicalPackageRoot, resolvedTarget)) {
        throw new Error(`Packed documentation escapes the package root in ${docRelative}: ${match[1]}`);
      }
      if (!existsSync(resolvedTarget)) {
        throw new Error(`Packed documentation has a broken local link in ${docRelative}: ${match[1]}`);
      }
      if (!isWithin(canonicalPackageRoot, realpathSync(resolvedTarget))) {
        throw new Error(`Packed documentation escapes the package root in ${docRelative}: ${match[1]}`);
      }
    }
  }

  return documentation;
}
