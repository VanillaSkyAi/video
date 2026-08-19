import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { createTextDeltaVideoPlanner, type VideoPlanner } from "../../src/internal";
import { createTemplateSceneValidator, createTemplateSystemPrompt } from "../../src/visual-system/catalog/internal";
import { loadAcceptanceKit } from "./catalog";
import { ACCEPTANCE_FIXTURES } from "./fixtures";
import {
  streamAnthropicText,
  streamOpenAIText,
  type AnthropicClientLike,
  type OpenAIClientLike,
} from "./providers";
import { runAcceptanceFixture } from "./run";
import { classifyAcceptanceFailure } from "./failures";

type ProviderName = "openai" | "anthropic";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for a live acceptance run`);
  return value;
}

function createLivePlanner(provider: ProviderName): VideoPlanner {
  if (provider === "openai") {
    const client = new OpenAI({ apiKey: requireEnvironment("OPENAI_API_KEY") });
    const model = requireEnvironment("OPENAI_MODEL");
    return createTextDeltaVideoPlanner({
      streamText: ({ systemPrompt, userPrompt, signal }) => streamOpenAIText({
        client: client as unknown as OpenAIClientLike,
        model,
        systemPrompt,
        userPrompt,
        signal,
      }),
    });
  }
  const client = new Anthropic({ apiKey: requireEnvironment("ANTHROPIC_API_KEY") });
  const model = requireEnvironment("ANTHROPIC_MODEL");
  return createTextDeltaVideoPlanner({
    streamText: ({ systemPrompt, userPrompt, signal }) => streamAnthropicText({
      client: client as unknown as AnthropicClientLike,
      model,
      systemPrompt,
      userPrompt,
      signal,
    }),
  });
}

const provider = option("--provider") as ProviderName | undefined;
if (provider !== "openai" && provider !== "anthropic") {
  throw new Error("Pass --provider openai or --provider anthropic");
}
const fixtureId = option("--fixture");
const selectedFixtures = fixtureId
  ? ACCEPTANCE_FIXTURES.filter((fixture) => fixture.id === fixtureId)
  : ACCEPTANCE_FIXTURES;
if (selectedFixtures.length === 0) throw new Error(`Unknown fixture: ${fixtureId}`);
const scoreValue = option("--human-quality-score");
const humanQualityScore = scoreValue == null ? undefined : Number(scoreValue);
if (humanQualityScore != null &&
  (!Number.isFinite(humanQualityScore) || humanQualityScore < 0 || humanQualityScore > 100)) {
  throw new Error("--human-quality-score must be between 0 and 100");
}

const basePlanner = createLivePlanner(provider);
const outputDirectory = join(process.cwd(), "artifacts", "acceptance", provider);
mkdirSync(outputDirectory, { recursive: true });

let failed = humanQualityScore == null;
for (const fixture of selectedFixtures) {
  const kit = loadAcceptanceKit(fixture.templateIds);
  const systemPrompt = createTemplateSystemPrompt({ kit });
  const validateScene = createTemplateSceneValidator({ kit });
  try {
  const result = await runAcceptanceFixture({
    fixture,
    capabilities: fixture.templateIds,
    validateScene,
    humanQualityScore,
    generate: (context) => basePlanner({ ...context, systemPrompt }),
  });
  const fixtureDirectory = join(outputDirectory, fixture.id);
  mkdirSync(fixtureDirectory, { recursive: true });
  writeFileSync(
    join(fixtureDirectory, "video.json"),
    `${JSON.stringify(result.state.config, null, 2)}\n`,
  );
  writeFileSync(
    join(fixtureDirectory, "acceptance.json"),
    `${JSON.stringify({
      provider,
      fixture: fixture.id,
      report: result.report,
      state: {
        status: result.state.status,
        errors: result.state.errors,
        finishReason: result.state.finishReason,
      },
      timeline: result.events.map(({ event, elapsedMs }) => ({
        sequence: event.sequence,
        type: event.type,
        elapsedMs,
      })),
    }, null, 2)}\n`,
  );
  console.log(JSON.stringify({
    provider,
    fixture: fixture.id,
    passed: result.report.passed,
    metrics: result.report.metrics,
    errors: result.state.errors,
    artifactDirectory: fixtureDirectory,
  }));
  if (!result.report.passed) failed = true;
  } catch (error) {
    const fixtureDirectory = join(outputDirectory, fixture.id);
    mkdirSync(fixtureDirectory, { recursive: true });
    const category = classifyAcceptanceFailure(error);
    writeFileSync(join(fixtureDirectory, "acceptance.json"), `${JSON.stringify({
      provider,
      fixture: fixture.id,
      passed: false,
      failure: { category },
    }, null, 2)}\n`);
    console.error(JSON.stringify({ provider, fixture: fixture.id, passed: false, failureCategory: category }));
    failed = true;
  }
}

if (humanQualityScore == null) {
  console.error("Live artifacts were generated, but release acceptance requires --human-quality-score.");
}
if (failed) process.exitCode = 1;
