export {
  createVideoHandler,
  type MediaResolver,
  type MediaResolverContext,
  type ResolvedMedia,
} from "./server/create-video-handler.js";
export type { VideoHandlerOptions } from "./server/create-video-handler.js";
export { createServerTemplateRegistry } from "./visual-system/catalog/server-kit.js";
export type { ServerTemplateRegistry } from "./visual-system/catalog/server-kit.js";
export type { SceneTemplateMetadata as ServerTemplateMetadata } from "./visual-system/catalog/catalog-types.js";
export type { VideoFinishReason } from "./protocol/events.js";
export type {
  VideoGenerationSummary,
  VideoProviderUsage,
} from "./server/lifecycle.js";
export type {
  VideoWarning,
  VideoWarningCategory,
} from "./protocol/warnings.js";
