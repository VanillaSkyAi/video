function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractChangesetReleaseNotes(changelog, version) {
  const headings = [...changelog.matchAll(new RegExp(`^## ${escapeRegExp(version)}[ \\t]*$`, "gm"))];
  if (headings.length !== 1) {
    throw new Error(`CHANGELOG.md must contain exactly one release heading for ${version}`);
  }

  const heading = headings[0];
  const tail = changelog.slice((heading.index ?? 0) + heading[0].length);
  const nextHeading = tail.search(/^## /m);
  const section = (nextHeading >= 0 ? tail.slice(0, nextHeading) : tail).trim();
  const hasChangesetsHeading = /^### (?:Major|Minor|Patch) Changes[ \t]*$/m.test(section);
  const hasReleaseItem = /^- \S/m.test(section);
  if (!hasChangesetsHeading || !hasReleaseItem) {
    throw new Error(`CHANGELOG.md must contain Changesets release notes for ${version}`);
  }
  return section;
}
