[← Documentation home](../README.md)

# Video response use cases

These four inputs show the primary product shape: AI answers and live
application context become embedded video responses. The application decides
which context matters and keeps it current. VanillaSky grounds, validates,
composes, and plays the visual response.

## News summary

```ts
video.generate({
  input: `Headline: North Sea wind output reached a record on August 17.
Source summary: Grid operators reported 18.2 GW at 14:00 CET, 12% above the
previous record. Operators said lower demand helped reduce wholesale prices.`,
  instructions: "Lead with the record, explain the comparison, then the impact.",
  maxDurationSec: 24,
});
```

## Contextual help

```ts
video.generate({
  input: `The user is configuring an alert. The current threshold is 80%.
Alerts evaluate every 15 minutes. Email and Slack are enabled. The Save button
applies the rule to 42 selected accounts.`,
  instructions: "Explain what will happen if the user saves this configuration.",
  opening: "Here is what this alert will do.",
  maxDurationSec: 24,
});
```

## Personalized briefing

```ts
video.generate({
  input: `The Acme account has 1,240 weekly active users, up 18% month over
month. Three renewals are due in September. Support response time improved from
4.2 hours to 2.8 hours.`,
  personalization: { firstName: "Maya", accountName: "Acme" },
  instructions: "Create a concise morning account briefing.",
  maxDurationSec: 30,
});
```

## Dynamic personalized page content

```ts
video.generate({
  input: `The page shows the Q2 onboarding funnel. 8,420 users started setup,
6,315 connected a data source, and 4,884 invited a teammate. The largest drop
is between connecting a data source and inviting a teammate.`,
  instructions: "Respond to the visible funnel and focus on the largest drop.",
  orientation: "landscape",
  maxDurationSec: 24,
});
```
