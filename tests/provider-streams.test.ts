import { describe, expect, it } from "vitest";

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let result = "";
  for await (const chunk of stream) result += chunk;
  return result;
}

describe("live acceptance provider streams", () => {
  it("extracts OpenAI Responses API output text deltas", async () => {
    const api = await import("../scripts/acceptance/providers").catch(() => undefined);
    expect(api?.streamOpenAIText).toBeTypeOf("function");
    if (!api?.streamOpenAIText) return;

    let request: Record<string, unknown> | undefined;
    const client = {
      responses: {
        create: async (value: Record<string, unknown>) => {
          request = value;
          return (async function* () {
            yield { type: "response.created" };
            yield { type: "response.output_text.delta", delta: "{\"type\":" };
            yield { type: "response.output_text.delta", delta: "\"plan.complete\"}\n" };
            yield { type: "response.completed" };
          })();
        },
      },
    };

    await expect(collect(api.streamOpenAIText({
      client,
      model: "customer-openai-model",
      systemPrompt: "system",
      userPrompt: "user",
      signal: new AbortController().signal,
    }))).resolves.toBe("{\"type\":\"plan.complete\"}\n");
    expect(request).toEqual(expect.objectContaining({
      model: "customer-openai-model",
      stream: true,
      input: [
        { role: "system", content: "system" },
        { role: "user", content: "user" },
      ],
    }));
  });

  it("extracts Anthropic Messages API text deltas", async () => {
    const api = await import("../scripts/acceptance/providers").catch(() => undefined);
    expect(api?.streamAnthropicText).toBeTypeOf("function");
    if (!api?.streamAnthropicText) return;

    let request: Record<string, unknown> | undefined;
    const client = {
      messages: {
        stream: (value: Record<string, unknown>) => {
          request = value;
          return (async function* () {
            yield { type: "message_start" };
            yield { type: "content_block_delta", delta: { type: "text_delta", text: "one" } };
            yield { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "{}" } };
            yield { type: "content_block_delta", delta: { type: "text_delta", text: " two" } };
          })();
        },
      },
    };

    await expect(collect(api.streamAnthropicText({
      client,
      model: "customer-anthropic-model",
      systemPrompt: "system",
      userPrompt: "user",
      signal: new AbortController().signal,
    }))).resolves.toBe("one two");
    expect(request).toEqual(expect.objectContaining({
      model: "customer-anthropic-model",
      max_tokens: 4096,
      thinking: { type: "disabled" },
      system: "system",
      messages: [{ role: "user", content: "user" }],
    }));
  });
});
