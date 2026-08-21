import type { VideoInput, VideoPlanPart } from "../../src/internal";

export interface AcceptanceFixture {
  id: string;
  label: string;
  input: VideoInput;
  templateIds: string[];
  replayParts: VideoPlanPart[];
}

const darkBrand = {
  name: "Acme Cloud",
  logoUrl: "https://cdn.acme.test/acme-logo.svg",
  font: "Inter",
  scriptFont: "Caveat",
  background: "twilight" as const,
  colors: {
    primary: "#6D5EF5",
    secondary: "#17122F",
    foreground: "#FFFFFF",
    surface: "#17122F",
    surfaceElevated: "#231B42",
    muted: "#A7A6B0",
  },
};

const lightBrand = {
  name: "Acme Cloud",
  font: "Inter",
  background: { color: "#F8FAFC" },
  colors: {
    primary: "#5B3FD6",
    secondary: "#3D2A78",
    foreground: "#111827",
    surface: "#FFFFFF",
    surfaceElevated: "#E2E8F0",
    muted: "#475569",
  },
};

const partialBrand = {
  name: "Acme Cloud",
  colors: { primary: "#6D5EF5" },
};

export const BRAND_INPUT_FIXTURES = {
  withLogo: darkBrand,
  withoutLogo: { ...darkBrand, logoUrl: undefined },
  light: lightBrand,
  partial: partialBrand,
  invalidColor: { colors: { primary: "violet" } },
} as const;

export const ACCEPTANCE_FIXTURES: AcceptanceFixture[] = [
  {
    id: "personalized-recap",
    label: "Personalized recap",
    templateIds: ["notification", "tripleStats", "bigNumber", "milestone", "ctaLogo"],
    input: {
      input: "Maya completed 142 customer conversations this quarter, helped resolve 96% of escalations, launched 4 product improvements, and received a 4.8 out of 5 customer rating. The strongest month was June with 54 conversations.",
      instructions: "Create a celebratory quarterly recap. Keep every metric exact and make the achievement feel personal.",
      opening: "Maya, your quarter deserves a look back.",
      personalization: { firstName: "Maya", period: "Q2", role: "Product leader" },
      brand: BRAND_INPUT_FIXTURES.withLogo,
      maxDurationSec: 26,
      orientation: "portrait",
    },
    replayParts: [
      {
        type: "scene.add",
        scene: {
          id: "recap-highlight",
          templateId: "bigNumber",
          variables: {
            texts: "54 in your strongest month",
            value: 142,
            label: "customer conversations",
          },
          timing: { fixedDuration: 4.5 },
        },
      },
      {
        type: "scene.add",
        scene: {
          id: "recap-stats",
          templateId: "tripleStats",
          variables: {
            texts: "The impact",
            stat1Value: "96%",
            stat1Label: "escalations resolved",
            stat2Value: "4",
            stat2Label: "improvements launched",
            stat3Value: "4.8/5",
            stat3Label: "customer rating",
          },
          timing: { fixedDuration: 5 },
        },
      },
      {
        type: "scene.add",
        scene: {
          id: "recap-milestone",
          templateId: "milestone",
          variables: {
            label: "Product improvements shipped",
            targetNumber: 4,
            startNumber: 0,
            badgeText: "A quarter worth celebrating",
            badgeEmoji: "🎉",
          },
          timing: { fixedDuration: 4 },
        },
      },
      {
        type: "scene.add",
        scene: {
          id: "recap-close",
          templateId: "ctaLogo",
          variables: { cta: "Bring on next quarter" },
          timing: { fixedDuration: 3 },
        },
      },
      { type: "plan.complete" },
    ],
  },
  {
    id: "daily-briefing",
    label: "Personalized daily briefing",
    templateIds: ["notification", "bigNumber", "tripleStats", "ctaLogo"],
    input: {
      input: "Activation reached 58%, up from 41% last month. Enterprise adoption is 64%. SMB adoption is 49%. Expansion pipeline reached $2.4M.",
      instructions: "Prioritize the biggest movement and keep every number exact.",
      opening: "Maya, here is your daily product briefing.",
      personalization: { firstName: "Maya", role: "Product leader", focus: "activation" },
      brand: BRAND_INPUT_FIXTURES.light,
      maxDurationSec: 24,
      orientation: "portrait",
    },
    replayParts: [
      {
        type: "scene.add",
        scene: {
          id: "activation",
          templateId: "bigNumber",
          variables: {
            texts: "Up from 41% last month",
            value: 58,
            unit: "%",
            label: "activation",
          },
          timing: { fixedDuration: 4 },
        },
      },
      {
        type: "scene.add",
        scene: {
          id: "segments",
          templateId: "tripleStats",
          variables: {
            texts: "What to watch",
            stat1Value: "64%",
            stat1Label: "Enterprise adoption",
            stat2Value: "49%",
            stat2Label: "SMB adoption",
            stat3Value: "$2.4M",
            stat3Label: "Expansion pipeline",
          },
          timing: { fixedDuration: 5 },
        },
      },
      {
        type: "scene.add",
        scene: {
          id: "briefing-close",
          templateId: "ctaLogo",
          variables: { cta: "Keep activation moving" },
          timing: { fixedDuration: 3 },
        },
      },
      { type: "plan.complete" },
    ],
  },
  {
    id: "welcome-onboarding",
    label: "Personalized welcome and onboarding",
    templateIds: ["notification", "brandMessage", "steps", "ctaLogo"],
    input: {
      input: "Alex joined Acme Cloud as VP Product. Their onboarding goals are to meet the leadership team, review the activation dashboard, and publish a 30-day product assessment. Their onboarding partner is Maya.",
      instructions: "Welcome Alex personally and turn the three grounded onboarding goals into a clear first-week path.",
      opening: "Welcome to Acme Cloud, Alex.",
      personalization: { firstName: "Alex", role: "VP Product", onboardingPartner: "Maya" },
      brand: BRAND_INPUT_FIXTURES.partial,
      maxDurationSec: 24,
      orientation: "landscape",
    },
    replayParts: [
      {
        type: "scene.add",
        scene: {
          id: "welcome-message",
          templateId: "brandMessage",
          variables: { message: "We are excited to build what comes next with you." },
          timing: { fixedDuration: 4 },
        },
      },
      {
        type: "scene.add",
        scene: {
          id: "welcome-path",
          templateId: "steps",
          variables: {
            texts: "Your first-week path",
            steps: ["Meet leadership", "Review activation", "Start assessment"],
            stepEmojis: ["👋", "📊", "📝"],
          },
          timing: { fixedDuration: 5.5 },
        },
      },
      {
        type: "scene.add",
        scene: {
          id: "welcome-partner",
          templateId: "notification",
          variables: { appName: "Acme Cloud", appIcon: "👋", message: "Maya is your onboarding partner." },
          timing: { fixedDuration: 3.5 },
        },
      },
      {
        type: "scene.add",
        scene: {
          id: "welcome-close",
          templateId: "ctaLogo",
          variables: { cta: "Start your first week" },
          timing: { fixedDuration: 3 },
        },
      },
      { type: "plan.complete" },
    ],
  },
  {
    id: "release-update",
    label: "Release update",
    templateIds: ["notification", "cardList", "media", "ctaLogo"],
    input: {
      input: "Acme Cloud launched account alerts today. Alerts refresh every 15 minutes, can be filtered by account segment, and are available to all Pro customers. Teams can use the alert view during account reviews.",
      instructions: "Explain what shipped, how it works, and who can use it.",
      opening: "Account alerts are now live.",
      brand: BRAND_INPUT_FIXTURES.withLogo,
      suppliedMedia: [{
        id: "alerts-screen",
        url: "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1080",
        type: "image",
        description: "Team using the alert view during an account review",
        role: "product",
      }],
      maxDurationSec: 26,
      orientation: "landscape",
    },
    replayParts: [
      {
        type: "scene.add",
        scene: {
          id: "release-summary",
          templateId: "cardList",
          variables: {
            texts: "Account alerts",
            items: ["Refresh every 15 minutes", "Filter by account segment", "Available to all Pro customers"],
            itemEmojis: ["⚡", "🎯", "✅"],
          },
          timing: { fixedDuration: 5 },
        },
      },
      {
        type: "scene.add",
        scene: {
          id: "release-media",
          templateId: "media",
          variables: {
            texts: "Use the alert view during account reviews",
            mediaUrl: "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1080",
            mediaType: "photo",
          },
          timing: { fixedDuration: 4 },
        },
      },
      {
        type: "scene.add",
        scene: {
          id: "release-close",
          templateId: "ctaLogo",
          variables: { cta: "Open account alerts" },
          timing: { fixedDuration: 3 },
        },
      },
      { type: "plan.complete" },
    ],
  },
  {
    id: "visual-answer",
    label: "Visual answer",
    templateIds: ["notification", "problemSolution", "steps", "media", "ctaLogo"],
    input: {
      input: "Activation falls because the generic product tour delays the user's first outcome. Replace it with a short first-session path: choose one account, import its data, and view the first risk summary. Measure whether the user reaches that useful result.",
      instructions: "Answer the question directly and end with the first change to make.",
      opening: "Here is the fastest way to improve activation.",
      brand: BRAND_INPUT_FIXTURES.withoutLogo,
      maxDurationSec: 24,
      orientation: "portrait",
    },
    replayParts: [
      {
        type: "scene.add",
        scene: {
          id: "answer",
          templateId: "problemSolution",
          variables: {
            problemLabel: "THE PROBLEM",
            problemText: "The tour delays the first useful outcome.",
            solutionLabel: "CHANGE FIRST",
            solutionText: "Guide users to one useful result in session one.",
          },
          timing: { fixedDuration: 5 },
        },
      },
      {
        type: "scene.add",
        scene: {
          id: "path",
          templateId: "steps",
          variables: {
            texts: "The shorter path",
            steps: ["Choose one account", "Import its data", "View the risk summary"],
            stepEmojis: ["🎯", "📥", "🔎"],
          },
          timing: { fixedDuration: 5 },
        },
      },
      {
        type: "scene.add",
        scene: {
          id: "answer-close",
          templateId: "ctaLogo",
          variables: { cta: "Start with the first outcome" },
          timing: { fixedDuration: 3 },
        },
      },
      { type: "plan.complete" },
    ],
  },
];
