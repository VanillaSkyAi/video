import { ACCEPTANCE_FIXTURES } from "./fixtures";
import { ACCEPTANCE_TEMPLATE_IDS, loadAcceptanceKit } from "./catalog";
import { runAcceptanceFixture } from "./run";
import { createTemplateSceneValidator } from "../../src/visual-system/catalog/internal";

let failed = false;
const kit = loadAcceptanceKit(ACCEPTANCE_TEMPLATE_IDS);
const validateScene = createTemplateSceneValidator({ kit });
for (const fixture of ACCEPTANCE_FIXTURES) {
  const result = await runAcceptanceFixture({
    fixture,
    generate: async function* () {
      for (const part of fixture.replayParts) yield part;
    },
    humanQualityScore: 100,
    capabilities: fixture.templateIds,
    validateScene,
  });
  console.log(JSON.stringify({
    fixture: result.fixtureId,
    passed: result.report.passed,
    metrics: result.report.metrics,
    failedChecks: result.report.checks.filter((item) => !item.passed),
  }));
  if (!result.report.passed) failed = true;
}

if (failed) process.exitCode = 1;
