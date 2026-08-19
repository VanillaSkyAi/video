# Release acceptance

The release gate validates five product shapes on every run:

- `personalized-recap`: an individual wrapped-style recap;
- `welcome-onboarding`: a personal welcome and first-week path;
- `visual-answer`: a concise chatbot answer;
- `daily-briefing`: a personalized briefing with first-scene variables;
- `release-update`: a product update containing customer-supplied media.

All five carry grounded source material, creative direction, compact semantic
brand settings, an immediate supplied opening, and audio selected before
playback.

## Deterministic CI replay

```bash
npm run acceptance:replay
```

Replay drives canonical model parts through the public streaming runtime. It
tests protocol handling, event ordering, reducer output, and the automated
quality gates without network variance. CI requires all five fixtures to pass.

## Live OpenAI and Anthropic runs

Run these only in a trusted server or local shell. Never expose API keys through
a browser build, client environment variable, request payload, fixture, or
artifact.

```bash
OPENAI_API_KEY=... OPENAI_MODEL=... \
  npm run acceptance:live -- --provider openai

ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=... \
  npm run acceptance:live -- --provider anthropic
```

Use `--fixture visual-answer` to run one fixture. A live run writes:

```text
artifacts/acceptance/<provider>/<fixture>/
  video.json
  acceptance.json
```

`acceptance.json` records event type, sequence, elapsed time, metrics, and gate
results. It never records API keys or raw model deltas. The directory is ignored
by Git.

After watching the generated video, score its factual accuracy, hierarchy,
motion, pacing, brand fit, and overall polish from 0 to 100 without paying for
another provider run:

```bash
npm run acceptance:review -- \
  --provider openai --fixture personalized-recap --score 86
```

A run without `--human-quality-score` intentionally exits unsuccessfully after
writing artifacts. Automated checks cannot establish production visual quality.

Use the same 100-point rubric for every provider and fixture:

| Dimension | Points | Reject when |
| --- | ---: | --- |
| Factual accuracy | 30 | Any visible claim is invented, changed, or misleading |
| Story and hierarchy | 20 | Scenes repeat facts, feel padded, or lack a clear arc |
| Template and motion fit | 20 | A template misrepresents the content or motion obscures it |
| Readability and pacing | 15 | Copy cannot be read comfortably at playback speed |
| Brand and personalization | 10 | Supplied identity or viewer context is ignored or malformed |
| Media and finish | 5 | Media flashes, loads visibly, trails blank, or audio fails to end cleanly |

Any factual invention is a release blocker regardless of the numeric total.

## Default gates

| Gate | Requirement |
| --- | --- |
| Supplied opening | at most 250 ms |
| First generated scene | at most 15 seconds and independent of media |
| Completion | at most 30 seconds |
| Body scenes | at least 3 |
| Template diversity | at least 3 distinct body templates |
| Media | resolved before its scene is committed |
| Audio | emitted before the opening and includes a fade-out |
| Human quality | at least 80/100 |

The repository acceptance harness accepts threshold overrides for stricter
service-level objectives. It is release tooling, not an additional public
package entry point; applications can keep their own operational checks around
the six documented package entry points.

The OpenAI adapter consumes typed `response.output_text.delta` events from the
Responses API. The Anthropic adapter consumes `content_block_delta` events whose
delta is `text_delta`. The official provider references are linked from
[provider adapter reference](../reference/provider-adapters.md).
