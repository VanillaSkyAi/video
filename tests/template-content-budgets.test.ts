import { describe, expect, it } from "vitest";

import {
  createBuiltinTemplateSystemPrompt,
  getBuiltinTemplateMetadata,
} from "../src/visual-system/catalog/catalog";
import {
  createRenderTemplateRegistry,
  createTemplateSceneValidator,
  defineTemplate,
} from "../src/visual-system/catalog/internal";

type StringBudget = readonly [minLength: number | undefined, maxLength: number];

const STRING_BUDGETS: Record<string, Record<string, StringBudget>> = {
  beforeAfter: {
    problemLabel: [undefined, 12],
    problemHeadline: [1, 48],
    solutionLabel: [undefined, 12],
    solutionHeadline: [1, 48],
  },
  tripleStats: {
    texts: [1, 48],
    stat1Value: [1, 12], stat1Label: [1, 24],
    stat2Value: [1, 12], stat2Label: [1, 24],
    stat3Value: [1, 12], stat3Label: [1, 24],
  },
  problemSolution: {
    problemLabel: [undefined, 16],
    solutionLabel: [undefined, 16],
  },
  milestone: { label: [1, 32], badgeText: [undefined, 32], badgeEmoji: [undefined, 16] },
  notification: { appName: [1, 24], appIcon: [undefined, 16], message: [1, 100] },
  bigNumber: {
    texts: [1, 48], label: [1, 32], prefix: [undefined, 2], unit: [undefined, 4],
  },
  progressRing: { texts: [1, 48], label: [1, 32], unit: [undefined, 3] },
  incomingCall: {
    callerName: [1, 40], subtitle: [undefined, 28],
    declineLabel: [undefined, 12], acceptLabel: [undefined, 12],
  },
  promptInput: { promptText: [1, 40] },
  codeEditor: { texts: [1, 48], filename: [undefined, 32] },
  terminal: {
    texts: [1, 48], command: [1, 80], promptPrefix: [undefined, 3],
  },
};

describe("built-in template content budgets", () => {
  it("bounds every copy field that can otherwise escape its composition", () => {
    for (const [templateId, fields] of Object.entries(STRING_BUDGETS)) {
      const schema = getBuiltinTemplateMetadata(templateId)?.schema;
      expect(schema, templateId).toBeDefined();
      for (const [fieldName, [minLength, maxLength]] of Object.entries(fields)) {
        const property = schema?.properties[fieldName];
        expect(property?.type, `${templateId}.${fieldName}`).toBe("string");
        expect(property?.minLength, `${templateId}.${fieldName}.minLength`).toBe(minLength);
        expect(property?.maxLength, `${templateId}.${fieldName}.maxLength`).toBe(maxLength);
      }
    }
  });

  it("bounds repeated and vertically staged content", () => {
    const beforeAfter = getBuiltinTemplateMetadata("beforeAfter")?.schema.properties;
    expect(beforeAfter?.problemEmojis).toMatchObject({
      minItems: 5,
      maxItems: 8,
      items: { type: "string", minLength: 1, maxLength: 16 },
    });
    expect(beforeAfter?.solutionEmojis).toMatchObject({
      minItems: 3,
      maxItems: 5,
      items: { type: "string", minLength: 1, maxLength: 16 },
    });

    const terminalOutput = getBuiltinTemplateMetadata("terminal")?.schema.properties.output;
    expect(terminalOutput).toMatchObject({
      maxItems: 5,
      items: { type: "string", minLength: 1, maxLength: 80 },
    });
    expect(getBuiltinTemplateMetadata("notification")?.schema.properties.appIcon)
      .toMatchObject({ type: "string", format: "emoji", maxLength: 16 });
    expect(getBuiltinTemplateMetadata("milestone")?.schema.properties.badgeEmoji)
      .toMatchObject({ type: "string", format: "emoji", maxLength: 16 });
  });

  it("rejects prose masquerading as before/after emoji decorations", () => {
    const schema = getBuiltinTemplateMetadata("beforeAfter")?.schema;
    expect(schema).toBeDefined();
    if (!schema) return;
    const kit = createRenderTemplateRegistry({ templates: [defineTemplate({
      id: "beforeAfter",
      schema,
      component: () => null,
    })] });
    const validate = createTemplateSceneValidator({ kit });
    const variables = {
      problemHeadline: "Manual work",
      solutionHeadline: "Calm automation",
      problemEmojis: ["calendar", "😰", "💼", "📊", "⏰"],
      solutionEmojis: ["✨", "✅", "🎯"],
    };

    expect(() => validate({
      id: "edge",
      templateId: "beforeAfter",
      variables,
      timing: { fixedDuration: 4.5 },
    }, { input: { input: "Manual work became calm automation." }, previousScenes: [] }))
      .toThrow(/problemEmojis\.0.*emoji/);
  });

  it("communicates character budgets compactly to planners", () => {
    const prompt = createBuiltinTemplateSystemPrompt();

    expect(prompt.length).toBeLessThan(18_000);
    expect(prompt).toContain("string{1..40}!");
    expect(prompt).toContain("string-array[5..8]{1..16}!");
    expect(prompt).toContain("character count");
  });
});
