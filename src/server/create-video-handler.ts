import {
  createTextDeltaVideoPlanner,
  type TextDeltaVideoPlannerOptions,
} from "./model/text-stream.js";
import {
  createVideoStreamHandler,
  type VideoStreamHandler,
  type VideoStreamHandlerOptions,
} from "./video-stream-handler.js";
import { createTemplateSystemPrompt } from "../visual-system/catalog/prompt.js";
import type { ServerTemplateRegistry } from "../visual-system/catalog/server-kit.js";
import { overlayServerTemplateRegistry } from "../visual-system/catalog/server-kit.js";
import { BUILTIN_SERVER_TEMPLATE_KIT } from "../visual-system/catalog/builtin-server.js";
import { createTemplateSceneValidator } from "../visual-system/catalog/validate.js";
import {
  createMediaResolvingPlanner,
  type MediaResolver,
} from "./media-resolver.js";
import type { VideoInput } from "../protocol/types.js";

export type { MediaResolver, MediaResolverContext, ResolvedMedia } from "./media-resolver.js";

export interface VideoHandlerOptions extends Omit<
  VideoStreamHandlerOptions,
  "generate" | "systemPrompt" | "supportedCapabilities" | "validateScene" | "getTemplatePacing"
> {
  /** Customer-owned templates that replace matching built-ins and add new IDs. */
  templates?: ServerTemplateRegistry;
  /** App-owned provider adapter. Choose any model per request and keep provider clients and credentials in this closure. */
  streamText: TextDeltaVideoPlannerOptions["streamText"];
  /** Opt in to bounded provider-native usage and metadata in onComplete. */
  includeRawProviderData?: boolean;
  /** Additional video-direction rules prepended to the generated trusted-template catalog. */
  basePrompt?: string;
  /** Authorize an app-approved media URL in addition to URLs supplied in the request. */
  allowMediaUrl?: Parameters<typeof createTemplateSceneValidator>[0]["allowMediaUrl"];
  /** Resolve bounded semantic media intent through an application-owned provider. */
  resolveMedia?: MediaResolver;
}

/**
 * Build the secure route for a template kit while leaving provider, model,
 * credentials, authentication, and deployment ownership with the app.
 */
export function createVideoHandler(
  options: VideoHandlerOptions,
): VideoStreamHandler {
  if (options?.authorize !== "none" && typeof options?.authorize !== "function") {
    throw new Error('createVideoHandler requires authorize or authorize: "none"');
  }
  if (options && "mediaPolicy" in options) {
    throw new Error("mediaPolicy is not supported; resolve media before generation and pass it through VideoInput.suppliedMedia");
  }
  const {
    templates: configuredTemplates,
    streamText,
    includeRawProviderData,
    basePrompt,
    allowMediaUrl,
    resolveMedia,
    requireCloser = true,
    ...handlerOptions
  } = options;
  const templates = configuredTemplates
    ? overlayServerTemplateRegistry(BUILTIN_SERVER_TEMPLATE_KIT, configuredTemplates)
    : BUILTIN_SERVER_TEMPLATE_KIT;
  const approvedMediaUrls = new WeakMap<VideoInput, Set<string>>();
  const openingReadyInputs = new WeakSet<VideoInput>();
  const approveUrl = (input: VideoInput, url: string) => {
    const approved = approvedMediaUrls.get(input) ?? new Set<string>();
    approved.add(url);
    approvedMediaUrls.set(input, approved);
  };
  const planner = createTextDeltaVideoPlanner({ streamText, includeRawProviderData });
  const validateTemplateScene = createTemplateSceneValidator({
    kit: templates,
    allowMediaUrl: (url, context) =>
      approvedMediaUrls.get(context.input)?.has(url) === true ||
      allowMediaUrl?.(url, context) === true,
  });
  return createVideoStreamHandler({
    ...handlerOptions,
    requireCloser,
    generate: createMediaResolvingPlanner({
      planner,
      templates,
      resolveMedia,
      approveUrl,
      isOpeningReady: (input) => openingReadyInputs.has(input),
    }),
    systemPrompt: ({ request, capabilities }) => {
      const selectedIds = capabilities?.templates == null
        ? undefined
        : new Set(capabilities.templates);
      const selectedTemplates = selectedIds == null
        ? templates.listTemplateMetadata()
        : templates.listTemplateMetadata().filter(({ id }) => selectedIds.has(id));
      return createTemplateSystemPrompt({
        kit: { listTemplateMetadata: () => selectedTemplates },
        basePrompt,
        knowledgeMode: request.input.knowledgeMode,
        mediaResolverAvailable: resolveMedia != null,
      });
    },
    supportedCapabilities: templates.capabilities,
    validateScene: (scene, context) => {
      validateTemplateScene(scene, context);
      const isAsk = templates.getTemplateMetadata(scene.templateId)?.jobs?.includes("ask") === true;
      if (!isAsk) {
        openingReadyInputs.add(context.input);
      }
    },
    getTemplatePacing: (templateId) => templates.getTemplateMetadata(templateId),
  });
}
