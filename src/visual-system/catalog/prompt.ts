import { DEFAULT_VIDEO_SYSTEM_PROMPT } from "../../server/prompts/system-prompt.js";
import type {
  SceneTemplateMetadata,
  TemplateMetadataCatalog,
} from "./catalog-types.js";
import type { TemplateJsonSchema, TemplateJsonSchemaProperty } from "./types.js";
import { getTemplateSchemaGates, templateVariableNotation } from "./schema.js";
import { getStandardMediaResolverContract } from "./media-resolver-contract.js";
import { PACING_PLANNER_RULES } from "../../server/pacing.js";

function plannerProperty(property: TemplateJsonSchemaProperty): TemplateJsonSchemaProperty {
  return {
    ...(property.type == null ? {} : { type: property.type }),
    ...(property.format == null ? {} : { format: property.format }),
    ...(property.enum == null ? {} : { enum: property.enum }),
    ...(property.minItems == null ? {} : { minItems: property.minItems }),
    ...(property.maxItems == null ? {} : { maxItems: property.maxItems }),
    ...(property.minLength == null ? {} : { minLength: property.minLength }),
    ...(property.maxLength == null ? {} : { maxLength: property.maxLength }),
    ...(property.minimum == null ? {} : { minimum: property.minimum }),
    ...(property.maximum == null ? {} : { maximum: property.maximum }),
    ...(property.items == null ? {} : { items: plannerProperty(property.items) }),
    ...(property.properties == null ? {} : {
      properties: Object.fromEntries(Object.entries(property.properties)
        .map(([name, child]) => [name, plannerProperty(child)])),
    }),
    ...(property.required == null ? {} : { required: property.required }),
    ...(property.additionalProperties == null ? {} : {
      additionalProperties: property.additionalProperties,
    }),
  };
}

function plannerSchema(schema: TemplateJsonSchema, exposeMediaKeyword: boolean): TemplateJsonSchema {
  const hiddenFields = exposeMediaKeyword ? new Set<string>() : new Set(["mediaKeyword"]);
  const properties = Object.fromEntries(
    Object.entries(schema.properties)
      .filter(([name]) => !hiddenFields.has(name))
      .map(([name, property]) => [name, name === "mediaKeyword"
        ? plannerProperty({ ...property, minLength: 2, maxLength: 80 })
        : plannerProperty(property)]),
  );
  const required = schema.required?.filter((name) => !hiddenFields.has(name));
  return {
    type: "object",
    properties,
    ...(required === undefined ? {} : { required }),
    ...(schema.additionalProperties == null ? {} : {
      additionalProperties: schema.additionalProperties,
    }),
  };
}

function needsPlannerSchema(schema: TemplateJsonSchema): boolean {
  const visit = (property: TemplateJsonSchema["properties"][string]): boolean =>
    property.minimum != null || property.maximum != null ||
    property.type === "object" ||
    (property.items != null && visit(property.items));
  return Object.values(schema.properties).some(visit);
}

const COMMON_MEDIA_VARIABLES = {
  mediaUrl: "media",
  mediaType: "enum(auto|photo|video|gradient)",
  mediaPoster: "media",
  mediaPosition: "enum(center|top|bottom|left|right)",
  mediaTreatment: "enum(subtle|cinematic|text-safe)",
} as const;

function plannerCatalog(templates: SceneTemplateMetadata[], mediaResolverAvailable: boolean) {
  return templates.map((template) => {
    const gates = getTemplateSchemaGates(template.schema);
    const exposeMediaKeyword = mediaResolverAvailable &&
      getStandardMediaResolverContract(template.schema) != null;
    const variables = Object.fromEntries(
      Object.entries(template.schema.properties)
        .filter(([name]) => name !== "mediaKeyword" || exposeMediaKeyword)
        .map(([name, property]) => [
          name,
          name === "mediaKeyword"
            ? "string{2..80}"
            : templateVariableNotation(property, template.schema.required?.includes(name) === true),
        ]),
    );
    const usesCommonMedia = Object.entries(COMMON_MEDIA_VARIABLES)
      .every(([name, notation]) => variables[name] === notation);
    if (usesCommonMedia) {
      for (const name of Object.keys(COMMON_MEDIA_VARIABLES)) delete variables[name];
    }
    return {
      id: template.id,
      jobs: template.jobs,
      use: template.useWhen ?? template.description,
      ...(template.minDuration == null && template.preferredDuration == null ? {} : {
        seconds: [template.minDuration ?? null, template.preferredDuration ?? null],
      }),
      ...(gates.requiresStat ? { requiresStat: true } : {}),
      ...(gates.requiresQuote ? { requiresQuote: true } : {}),
      ...(gates.requiresScreenshot ? { requiresScreenshot: true } : {}),
      ...(gates.requiredAnyOf.length > 0 ? { requiredAnyOf: gates.requiredAnyOf } : {}),
      ...(needsPlannerSchema(template.schema) ? { schema: plannerSchema(template.schema, exposeMediaKeyword) } : {}),
      ...(usesCommonMedia ? { media: true } : {}),
      variables,
    };
  });
}

export function createTemplateSystemPrompt(options: {
  kit: TemplateMetadataCatalog;
  basePrompt?: string;
  /** Expose host-resolved semantic media intent without exposing a provider. */
  mediaResolverAvailable?: boolean;
}): string {
  const templates = options.kit.listTemplateMetadata();
  const resolverMediaAvailable = options.mediaResolverAvailable === true &&
    templates.some(({ schema }) => getStandardMediaResolverContract(schema) != null);
  const ids = new Set(templates.map(({ id }) => id));
  const fields = new Set(templates.flatMap(({ schema }) => Object.keys(schema.properties)));
  const basePrompt = DEFAULT_VIDEO_SYSTEM_PROMPT
    .split("\n")
    .filter((line) =>
      !line.includes("Never use media, ctaMedia, or reaction as the first generated body template") &&
      !(resolverMediaAvailable && line.includes("Never expose a loading placeholder or unresolved media keyword")) &&
      !(resolverMediaAvailable && line.includes("Prefer resolved media on scene.add. Use asset.patch")) &&
      !(resolverMediaAvailable && line.includes('{"type":"asset.patch","sceneId":"stable-id"'))
    )
    .join("\n");
  const factRules = [
    ...(ids.has("cardList") ? ["cardList needs two or three unused parallel facts"] : []),
    ...(ids.has("steps") ? ["steps needs two or three unused sequential facts"] : []),
    ...(ids.has("tripleStats") ? ["tripleStats needs exactly three unused peer values"] : []),
  ];
  const mediaTemplates = ["media", "ctaMedia", "reaction"].filter((id) => ids.has(id));
  const mediaTemplateNames = mediaTemplates.length === 3
    ? "media, ctaMedia, and reaction"
    : mediaTemplates.join(", ");
  const terminalPayoffs = ["media", "emojiBurst", "confetti"].filter((id) => ids.has(id));
  const terminalPayoffNames = terminalPayoffs.length < 2
    ? terminalPayoffs.join("")
    : `${terminalPayoffs.slice(0, -1).join(", ")}, or ${terminalPayoffs.at(-1)}`;
  const listFields = ["items", "itemEmojis", "steps", "stepEmojis", "problemEmojis", "solutionEmojis"]
    .filter((name) => fields.has(name));
  return [
    basePrompt.trim(),
    options.basePrompt?.trim()
      ? `\nAPPLICATION GUIDANCE\n${options.basePrompt.trim()}`
      : undefined,
    "",
    "TRUSTED TEMPLATE CATALOG",
    "Only use template IDs from this catalog. Only emit variables declared for the selected template.",
    "Variable notation is type[count]{characters}(options)! where count is list cardinality, characters is the inclusive character count for a string or each string-array item, and ! means required. Omitted ! means optional.",
    `seconds is [minimum, preferred]. media=true adds these optional variables: ${Object.entries(COMMON_MEDIA_VARIABLES).map(([name, notation]) => `${name}:${notation}`).join(", ")}.`,
    "Choose a template only when the input contains every fact it needs. Never invent peer values to complete a chart, comparison, stat set, timeline, or list.",
    ...PACING_PLANNER_RULES,
    ids.has("cardList") && ids.has("steps") && ids.has("tripleStats")
      ? "Fact availability carries across templates: cardList and steps each need two or three unused facts (parallel for cardList, sequential for steps) and must carry only the count the evidence supports, and tripleStats needs exactly three unused peer values. Never invent a fact to fill a collection, and do not fill one with facts already shown in another scene."
      : factRules.length > 0
        ? `Fact availability carries across templates: ${factRules.join(", and ")}. Use only the count the evidence supports. Never invent a fact to fill a collection, and do not fill one with facts already shown in another scene.`
      : undefined,
    "Do not compress a list, sequence, metric set, or comparison into a general-purpose prose field when a specific catalog template can show that structure.",
    "If the catalog includes a suitable ask template and the input supplies a grounded CTA or URL, keep that concise action closer as its own final scene instead of folding it into preceding content.",
    "When a grounded CTA or URL is supplied and the catalog contains jobs:[ask], emit that final closer. A brand name may accompany the action but never qualifies as an ask by itself.",
    terminalPayoffs.length > 0
      ? `When the input has no clear grounded action, never invent one and do not use jobs:[ask]. End with a grounded payoff using ${terminalPayoffNames}. Its concise 6–12 words of declarative copy must answer the story's so-what without repeating hook or setup language. Use media for an honest visual payoff, emojiBurst for playful delight, and confetti only for a real celebration, win, or milestone.`
      : undefined,
    "requiresQuote is a hard gate: use those templates only for exact quoted words and attribution present in raw input. Never turn a role, relationship, or summary into speech. requiresScreenshot likewise needs an actual supplied screenshot URL.",
    templates.some(({ schema }) => (schema["x-vanillasky"]?.requiredAnyOf?.length ?? 0) > 0)
      ? "requiredAnyOf is a hard presence gate: satisfy every listed group with at least one non-empty value."
      : undefined,
    mediaTemplates.length > 0
      ? `For streaming startup, ${mediaTemplateNames} ${mediaTemplates.length === 1 ? "is" : "are"} forbidden as the first generated body template, even when mediaType is gradient. Start with a content-fit non-media template.`
      : undefined,
    listFields.length > 0
      ? `For list variables (${listFields.join(", ")}), emit actual JSON arrays. Keep list labels to 1–3 words. Keep step labels to 1–2 words and at most 18 characters. Do not use pipes or newlines as list delimiters.`
      : undefined,
    fields.has("bars")
      ? 'For bars, emit an actual JSON array of 2–6 grounded objects with "label" and "value" fields. Use comparable units and avoid a largest-to-smallest positive ratio above 20. Do not encode bars as a string.'
      : undefined,
    resolverMediaAvailable
      ? "Prefer a relevant resolved image or video background on later media-capable scenes whenever the input names a concrete person, place, product context, activity, or outcome that can be depicted honestly. Emit mediaKeyword on scene.add as a specific 2–8 word semantic query of at most 80 characters; never put mediaKeyword in scene.patch or asset.patch. The host removes mediaKeyword before the scene reaches the browser and replaces it with an approved asset. Use mediaType=gradient for abstract, sensitive, unsafe, or visually ambiguous material. Never emit or invent mediaUrl or mediaPoster."
      : mediaTemplates.length > 0
      ? `Use exact grounded values for required fields. mediaUrl must come verbatim from supplied input. Stock queries are not available. Do not select ${mediaTemplateNames} without a supplied mediaUrl; if another template has no mediaUrl, explicitly use mediaType=gradient. mediaType auto detects a URL, while gradient deliberately uses no external asset.`
      : "Use exact grounded values for required fields.",
    "Catalog guidance describes composition; it is not a factual source and must never replace customer input.",
    JSON.stringify(plannerCatalog(templates, resolverMediaAvailable)),
  ].filter((line): line is string => line != null).join("\n");
}
