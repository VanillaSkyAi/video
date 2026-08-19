interface OpenAIStreamEvent {
  type: string;
  delta?: string;
}

export interface OpenAIClientLike {
  responses: {
    create(
      request: Record<string, unknown>,
      options?: { signal?: AbortSignal },
    ): Promise<AsyncIterable<OpenAIStreamEvent>>;
  };
}

interface AnthropicStreamEvent {
  type: string;
  delta?: { type?: string; text?: string };
}

export interface AnthropicClientLike {
  messages: {
    stream(
      request: Record<string, unknown>,
      options?: { signal?: AbortSignal },
    ): AsyncIterable<AnthropicStreamEvent>;
  };
}

interface ProviderTextStreamOptions<TClient> {
  client: TClient;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
}

export async function* streamOpenAIText({
  client,
  model,
  systemPrompt,
  userPrompt,
  signal,
}: ProviderTextStreamOptions<OpenAIClientLike>): AsyncGenerator<string> {
  const stream = await client.responses.create({
    model,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: true,
  }, { signal });
  for await (const event of stream) {
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      yield event.delta;
    }
  }
}

export async function* streamAnthropicText({
  client,
  model,
  systemPrompt,
  userPrompt,
  signal,
}: ProviderTextStreamOptions<AnthropicClientLike>): AsyncGenerator<string> {
  const stream = client.messages.stream({
    model,
    max_tokens: 4096,
    thinking: { type: "disabled" },
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  }, { signal });
  for await (const event of stream) {
    if (event.type === "content_block_delta" &&
      event.delta?.type === "text_delta" &&
      typeof event.delta.text === "string") {
      yield event.delta.text;
    }
  }
}
