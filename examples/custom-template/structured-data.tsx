import { defineTemplate } from "@vanillaskyai/video/templates";

export const template = defineTemplate({
  id: "structured-data",
  label: "Structured data",
  description: "A named metric with its previous value and grounded explanation.",
  useWhen: "Use when one exact metric and its change are the central proof.",
  avoidWhen: "Avoid when several peer metrics matter or the source contains no exact number.",
  schema: {
    type: "object",
    properties: {
      label: {
        type: "string",
        title: "Metric",
        minLength: 1,
        maxLength: 48,
        default: "Activation",
      },
      current: {
        type: "number",
        format: "grounded-stat",
        title: "Current value",
        default: 58,
      },
      previous: {
        type: "number",
        format: "grounded-stat",
        title: "Previous value",
        default: 41,
      },
      unit: {
        type: "string",
        title: "Unit",
        maxLength: 12,
        default: "%",
      },
      explanation: {
        type: "string",
        title: "Explanation",
        minLength: 1,
        maxLength: 120,
        default: "Guided onboarding helped more users reach value.",
      },
    },
    required: ["label", "current", "previous", "unit", "explanation"],
    additionalProperties: false,
    "x-vanillasky": { requiresStat: true },
  } as const,
  examples: [{
    name: "Activation improved",
    variables: {
      label: "Activation",
      current: 58,
      previous: 41,
      unit: "%",
      explanation: "Guided onboarding helped more users reach value.",
    },
  }],
  minDuration: 4,
  preferredDuration: 6,
  component: ({ variables, progress, width, height, safeZone }) => {
    const isPortrait = height >= width;
    const reveal = Math.max(0, Math.min(1, progress * 1.5));
    const delta = variables.current - variables.previous;

    return <section style={{
      boxSizing: "border-box",
      width,
      height,
      padding: `${safeZone.top}px ${safeZone.right}px ${safeZone.bottom}px ${safeZone.left}px`,
      display: "grid",
      alignContent: "center",
      gap: isPortrait ? 42 : 28,
      overflow: "hidden",
      color: "#f7f7ff",
      background: "linear-gradient(155deg, #0c1624, #173b4b 58%, #287b77)",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    }}>
      <p style={{ margin: 0, opacity: 0.72, fontSize: isPortrait ? 30 : 28 }}>
        {variables.label}
      </p>
      <div style={{
        display: "flex",
        flexDirection: isPortrait ? "column" : "row",
        alignItems: isPortrait ? "flex-start" : "baseline",
        gap: isPortrait ? 12 : 36,
        opacity: reveal,
        transform: `translateY(${Math.round((1 - reveal) * 24)}px)`,
      }}>
        <strong style={{
          fontSize: Math.max(76, Math.min(width * (isPortrait ? 0.23 : 0.14), 220)),
          lineHeight: 0.85,
          letterSpacing: "-0.07em",
        }}>{variables.current}{variables.unit}</strong>
        <span style={{ fontSize: isPortrait ? 28 : 34, color: "#83f3ca" }}>
          {delta >= 0 ? "+" : ""}{delta}{variables.unit} from {variables.previous}{variables.unit}
        </span>
      </div>
      <p style={{ margin: 0, maxWidth: 900, fontSize: isPortrait ? 27 : 30, lineHeight: 1.35 }}>
        {variables.explanation}
      </p>
    </section>;
  },
});
