import { defineTemplate } from "@vanillaskyai/video/templates";

export const template = defineTemplate({
  id: "minimal-text",
  label: "Minimal text",
  description: "A single grounded statement with a short supporting line.",
  useWhen: "Use when one concise idea should be the entire visual response.",
  avoidWhen: "Avoid when exact metrics, comparisons, or supplied media are the main proof.",
  schema: {
    type: "object",
    properties: {
      headline: {
        type: "string",
        title: "Headline",
        description: "The grounded idea the viewer should remember.",
        minLength: 1,
        maxLength: 72,
        default: "The answer, made visual.",
      },
      detail: {
        type: "string",
        title: "Supporting detail",
        description: "One short line that explains the headline.",
        minLength: 1,
        maxLength: 140,
        default: "Grounded in the context your application already has.",
      },
    },
    required: ["headline", "detail"],
    additionalProperties: false,
  } as const,
  examples: [{
    name: "Visual answer",
    variables: {
      headline: "The answer, made visual.",
      detail: "Grounded in the context your application already has.",
    },
  }],
  minDuration: 3,
  preferredDuration: 5,
  component: ({ variables, progress, width, height, safeZone }) => {
    const isPortrait = height >= width;
    const reveal = Math.max(0, Math.min(1, progress * 1.6));
    const contentWidth = isPortrait
      ? width - safeZone.left - safeZone.right
      : Math.min(width * 0.7, 980);

    return <section style={{
      boxSizing: "border-box",
      width,
      height,
      padding: `${safeZone.top}px ${safeZone.right}px ${safeZone.bottom}px ${safeZone.left}px`,
      display: "grid",
      placeItems: "center",
      overflow: "hidden",
      color: "#ffffff",
      background: "linear-gradient(145deg, #11152c, #34357d 58%, #7867dd)",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    }}>
      <div style={{
        width: contentWidth,
        opacity: reveal,
        transform: `translateY(${Math.round((1 - reveal) * 28)}px)`,
        textAlign: isPortrait ? "left" : "center",
      }}>
        <h1 style={{
          margin: 0,
          fontSize: Math.max(38, Math.min(width * (isPortrait ? 0.105 : 0.064), 92)),
          lineHeight: 0.98,
          letterSpacing: "-0.05em",
        }}>{variables.headline}</h1>
        <p style={{
          margin: `${Math.max(20, height * 0.035)}px auto 0`,
          maxWidth: 760,
          fontSize: Math.max(18, Math.min(width * 0.028, 34)),
          lineHeight: 1.35,
          color: "rgba(255,255,255,0.76)",
        }}>{variables.detail}</p>
      </div>
    </section>;
  },
});
