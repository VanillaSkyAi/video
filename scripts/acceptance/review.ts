import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyHumanQualityReview, type LiveAcceptanceArtifact } from "./review-artifact";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const provider = option("--provider");
const fixture = option("--fixture");
const score = Number(option("--score"));
if (!provider || !fixture || !Number.isFinite(score)) {
  throw new Error("Pass --provider, --fixture, and --score");
}

const artifactPath = join(
  process.cwd(),
  "artifacts",
  "acceptance",
  provider,
  fixture,
  "acceptance.json",
);
const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as LiveAcceptanceArtifact;
const reviewed = applyHumanQualityReview(artifact, score, new Date().toISOString());
writeFileSync(artifactPath, `${JSON.stringify(reviewed, null, 2)}\n`);
console.log(JSON.stringify({
  provider,
  fixture,
  score,
  passed: reviewed.report.passed,
  artifactPath,
}));
if (!reviewed.report.passed) process.exitCode = 1;
