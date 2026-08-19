import { createTemplateRegistry, defineTemplate } from "@vanillaskyai/video/templates";

const metric = defineTemplate({
  id: "metric",
  useWhen: "Show one grounded metric",
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      value: { type: "number" },
    },
    required: ["title", "value"],
  } as const,
  component: ({ variables }) => <section><h1>{variables.title}</h1><strong>{variables.value}</strong></section>,
});

export const templates = createTemplateRegistry({ definitions: [metric] });
