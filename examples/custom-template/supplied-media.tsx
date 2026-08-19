import { defineTemplate } from "@vanillaskyai/video/templates";

const previewImageUrl = "data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221200%22%20height=%22720%22%20viewBox=%220%200%201200%20720%22%3E%3Crect%20width=%221200%22%20height=%22720%22%20rx=%2248%22%20fill=%22%23181733%22/%3E%3Crect%20x=%2280%22%20y=%2280%22%20width=%221040%22%20height=%22560%22%20rx=%2232%22%20fill=%22%23f4f1ff%22/%3E%3Ccircle%20cx=%22220%22%20cy=%22230%22%20r=%2270%22%20fill=%22%237867dd%22/%3E%3Cpath%20d=%22M160%20520L380%20360L580%20430L820%20220L1040%20300%22%20fill=%22none%22%20stroke=%22%23287b77%22%20stroke-width=%2232%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22/%3E%3C/svg%3E";

export const template = defineTemplate({
  id: "supplied-media",
  label: "Supplied media",
  description: "An application-supplied screenshot with a grounded caption.",
  useWhen: "Use when a supplied product image is the strongest evidence for the answer.",
  avoidWhen: "Avoid when no approved image was supplied or text and data communicate the point more clearly.",
  schema: {
    type: "object",
    properties: {
      imageUrl: {
        type: "string",
        format: "supplied-image",
        title: "Supplied image",
        description: "The URL of an image present in VideoInput.suppliedMedia.",
        default: previewImageUrl,
      },
      headline: {
        type: "string",
        title: "Headline",
        minLength: 1,
        maxLength: 72,
        default: "See the change in context.",
      },
      caption: {
        type: "string",
        title: "Caption",
        minLength: 1,
        maxLength: 120,
        default: "The dashboard reflects the grounded result described in the answer.",
      },
    },
    required: ["imageUrl", "headline", "caption"],
    additionalProperties: false,
  } as const,
  examples: [{
    name: "Product dashboard",
    variables: {
      imageUrl: previewImageUrl,
      headline: "See the change in context.",
      caption: "The dashboard reflects the grounded result described in the answer.",
    },
  }],
  minDuration: 4,
  preferredDuration: 6,
  component: ({ variables, progress, width, height, safeZone }) => {
    const isPortrait = height >= width;
    const reveal = Math.max(0, Math.min(1, progress * 1.7));

    return <section style={{
      boxSizing: "border-box",
      width,
      height,
      padding: `${safeZone.top}px ${safeZone.right}px ${safeZone.bottom}px ${safeZone.left}px`,
      display: "grid",
      gridTemplateColumns: isPortrait ? "1fr" : "minmax(0, 1.1fr) minmax(320px, 0.9fr)",
      alignContent: "center",
      alignItems: "center",
      gap: isPortrait ? 44 : 64,
      overflow: "hidden",
      color: "#15152b",
      background: "linear-gradient(145deg, #f4f1ff, #dfe7ff)",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    }}>
      <img
        src={variables.imageUrl}
        alt=""
        style={{
          display: "block",
          width: "100%",
          maxHeight: isPortrait ? height * 0.48 : height * 0.68,
          objectFit: "cover",
          borderRadius: 28,
          boxShadow: "0 28px 80px rgba(28, 34, 75, 0.24)",
          opacity: reveal,
          transform: `scale(${0.96 + reveal * 0.04})`,
        }}
      />
      <div style={{ opacity: reveal }}>
        <h1 style={{ margin: 0, fontSize: isPortrait ? 58 : 70, lineHeight: 0.98, letterSpacing: "-0.045em" }}>
          {variables.headline}
        </h1>
        <p style={{ margin: "24px 0 0", fontSize: isPortrait ? 25 : 28, lineHeight: 1.4 }}>
          {variables.caption}
        </p>
      </div>
    </section>;
  },
});
