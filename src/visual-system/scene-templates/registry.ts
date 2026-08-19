/**
 * Scene template registry — central lookup for all scene templates.
 *
 * AI composition uses listTemplateMetadata() to get serializable template info.
 * Renderers and editors use getTemplate() / listTemplates().
 */

import type { SceneTemplate, SceneTemplateMetadata } from "../catalog/types";
// ─── App templates ──────────────────────────────────────────
// ─── Background templates ────────────────────────────────────
import { BgMediaTemplate } from "./bg-media";
import { BgConfettiTemplate } from "./bg-confetti";
import { BgEmojiTemplate } from "./bg-emoji";
import { ReactionTemplate } from "./reaction";
// ─── Chart templates ─────────────────────────────────────────
import { ChartCounterTemplate } from "./chart-counter";
import { ChartBarTemplate } from "./chart-bar";
import { ChartProgressRingTemplate } from "./chart-progress-ring";
// ─── Showcase templates ──────────────────────────────────────
import { ShowcasePhoneTemplate } from "./showcase-phone";
import { ShowcaseWebTemplate } from "./showcase-web";
import { ShowcaseTerminalTemplate } from "./showcase-terminal";
import { ShowcaseCodeTemplate } from "./showcase-code";
// ─── Infographic templates ────────────────────────────────────
import { InfographicStepsTemplate } from "./infographic-steps";
// InfographicFeatureGrid (emojiGrid) removed — cardList works better
import { InfographicFeatureListTemplate } from "./infographic-feature-list";
import { InfographicProblemSolutionTemplate } from "./infographic-problem-solution";
import { InfographicStatRowTemplate } from "./infographic-stat-row";
import { InfographicBeforeAfterTemplate } from "./infographic-before-after";
// ─── CTA templates ──────────────────────────────────────────
import { CtaLogoTemplate } from "./cta-logo";
import { CtaMediaTemplate } from "./cta-media";
// ─── Social templates ────────────────────────────────────────
import { SocialTweetTemplate } from "./social-tweet";
import { SocialConversationTemplate } from "./social-conversation";
import { SocialNotificationTemplate } from "./social-notification";
import { SocialTestimonialTemplate } from "./social-testimonial";
import { SocialReviewStackTemplate } from "./social-review-stack";
import { SocialMilestoneTemplate } from "./social-milestone";
import { IncomingCallTemplate } from "./incoming-call";
import { BrandMessageTemplate } from "./brand-message";
import { PromptInputTemplate } from "./prompt-input";
import {
  BUILTIN_TEMPLATE_MANIFEST,
  type BuiltinTemplateId,
} from "../catalog/builtin-manifest";

const components = {
  media: BgMediaTemplate,
  reaction: ReactionTemplate,
  confetti: BgConfettiTemplate,
  emojiBurst: BgEmojiTemplate,
  bigNumber: ChartCounterTemplate,
  barChart: ChartBarTemplate,
  progressRing: ChartProgressRingTemplate,
  phoneMockup: ShowcasePhoneTemplate,
  webMockup: ShowcaseWebTemplate,
  codeEditor: ShowcaseCodeTemplate,
  terminal: ShowcaseTerminalTemplate,
  tweet: SocialTweetTemplate,
  notification: SocialNotificationTemplate,
  chatMessenger: SocialConversationTemplate,
  chatWhatsapp: SocialConversationTemplate,
  milestone: SocialMilestoneTemplate,
  reviewStack: SocialReviewStackTemplate,
  testimonial: SocialTestimonialTemplate,
  incomingCall: IncomingCallTemplate,
  brandMessage: BrandMessageTemplate,
  promptInput: PromptInputTemplate,
  beforeAfter: InfographicBeforeAfterTemplate,
  tripleStats: InfographicStatRowTemplate,
  problemSolution: InfographicProblemSolutionTemplate,
  cardList: InfographicFeatureListTemplate,
  steps: InfographicStepsTemplate,
  ctaLogo: CtaLogoTemplate,
  ctaMedia: CtaMediaTemplate,
} satisfies Record<BuiltinTemplateId, SceneTemplate["component"]>;

const templates: readonly SceneTemplate[] = Object.freeze(
  BUILTIN_TEMPLATE_MANIFEST.map((metadata) => Object.freeze({
    ...metadata,
    component: components[metadata.id],
  })),
);

// ─── Public API ─────────────────────────────────────────────────

export function getTemplate(id: string): SceneTemplate | undefined {
  return templates.find((template) => template.id === id);
}

export function listTemplates(): readonly SceneTemplate[] {
  return templates;
}

export function getTemplateComponent(id: string): SceneTemplate["component"] | undefined {
  return getTemplate(id)?.component;
}

/**
 * Get serializable metadata for a single template (no component).
 * Used by servers and other non-rendering consumers.
 */
export function getTemplateMetadata(id: string): SceneTemplateMetadata | undefined {
  const t = getTemplate(id);
  if (!t) return undefined;
  const { component: _component, ...metadata } = t;
  return metadata;
}

/**
 * Get serializable metadata for ALL templates.
 * Used by AI composition to pick templates from descriptions.
 */
export function listTemplateMetadata(): SceneTemplateMetadata[] {
  return templates.map(({ component: _component, ...metadata }) => metadata);
}
