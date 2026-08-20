import { describe, expect, it } from "vitest";
import {
  createVideo,
  createVideoRequest,
  decodeVideoSse,
  streamVideo,
} from "../src/internal";
import { createVideoStreamHandler } from "../src/server/video-stream-handler";

const validScene = (id: string) => ({
  type: "scene.add" as const,
  scene: { id, templateId: "notification", variables: { message: id }, timing: { fixedDuration: 3 } },
});

describe("generated-part resilience", () => {
  it("drops an invalid scene, reports its internal reason, and keeps accumulated context", async () => {
    const reported: string[] = [];
    const contexts: string[][] = [];
    const run = createVideo({ input: "facts" }, {
      invalidPartBehavior: "drop",
      onError: (error) => reported.push(error.message),
      validateScene: (scene, context) => {
        contexts.push(context.previousScenes.map(({ id }) => id));
        if (scene.id === "bad") throw new Error("private variable detail");
      },
      generate: async function* () {
        yield validScene("one");
        yield validScene("bad");
        yield validScene("two");
        yield { type: "plan.complete" as const };
      },
    });
    const events = [];
    for await (const event of run.stream) events.push(event);
    expect((await run.result).status).toBe("complete");
    expect((await run.result).config?.scenes.map(({ id }) => id))
      .toEqual(["supplied-opening", "one", "two"]);
    expect(reported).toEqual(["private variable detail"]);
    expect(contexts).toEqual([
      [],
      ["supplied-opening"],
      ["supplied-opening", "one"],
      ["supplied-opening", "one"],
    ]);
    expect(JSON.stringify(events)).not.toContain("private variable detail");
    expect(events).toContainEqual(expect.objectContaining({
      type: "response.error",
      data: { error: { code: "invalid_generated_part", message: "Generated content was skipped", recoverable: true }, terminal: false },
    }));
  });

  it("preserves explicit fail-fast behavior", async () => {
    const run = createVideo({ input: "facts" }, {
      invalidPartBehavior: "fail",
      validateScene: (scene) => { if (scene.id === "bad") throw new Error("rejected"); },
      generate: async function* () { yield validScene("bad"); },
    });
    const events = [];
    for await (const event of run.stream) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: "response.error", data: { terminal: true } });
  });

  it("makes handler dropping the default, redacts the client, and isolates throwing onError", async () => {
    const reported: string[] = [];
    const handler = createVideoStreamHandler({
      authorize: "none",
      heartbeatMs: false,
      onError(error) { reported.push(error.message); throw new Error("reporter failed"); },
      validateScene: (scene) => { if (scene.id === "bad") throw new Error("secret schema detail"); },
      generate: async function* () {
        yield validScene("bad");
        yield validScene("good");
        yield { type: "plan.complete" as const };
      },
    });
    const body = createVideoRequest({ input: "facts" }, { requestId: "request-1" });
    const response = await handler(new Request("https://app.test/api", { method: "POST", body: JSON.stringify(body) }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);
    expect(events.at(-1)?.type).toBe("response.complete");
    expect(reported).toEqual(["secret schema detail"]);
    expect(JSON.stringify(events)).not.toMatch(/secret schema detail|reporter failed/);
  });

  it("reports and redacts terminal core failures", async () => {
    const reported: string[] = [];
    const handler = createVideoStreamHandler({
      authorize: "none",
      heartbeatMs: false,
      onError: (error) => reported.push(error.message),
      generate: async function* () { yield validScene("good"); },
    });
    const body = createVideoRequest({ input: "facts" }, { requestId: "request-terminal" });
    const response = await handler(new Request("https://app.test/api", { method: "POST", body: JSON.stringify(body) }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);
    expect(reported).toContain("The planner stream ended before plan.complete");
    expect(events.at(-1)).toMatchObject({
      type: "response.error",
      data: { error: { message: "Video response generation failed" } },
    });
  });

  it("supports explicit handler fail-fast behavior without leaking the reason", async () => {
    const handler = createVideoStreamHandler({
      authorize: "none",
      heartbeatMs: false,
      invalidPartBehavior: "fail",
      validateScene: (scene) => {
        if (scene.id === "bad") throw new Error("private rejection");
      },
      generate: async function* () { yield validScene("bad"); },
    });
    const body = createVideoRequest({ input: "facts" }, { requestId: "request-fail" });
    const response = await handler(new Request("https://app.test/api", { method: "POST", body: JSON.stringify(body) }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: "response.error", data: { terminal: true } });
    expect(JSON.stringify(events)).not.toContain("private rejection");
  });

  it("drops malformed runtime values before a later valid scene", async () => {
    const handler = createVideoStreamHandler({
      authorize: "none",
      heartbeatMs: false,
      generate: async function* () {
        yield null as never;
        yield validScene("good");
        yield { type: "plan.complete" as const };
      },
    });
    const body = createVideoRequest({ input: "facts" }, { requestId: "request-malformed" });
    const response = await handler(new Request("https://app.test/api", { method: "POST", body: JSON.stringify(body) }));
    const events = [];
    for await (const event of decodeVideoSse(response.body!)) events.push(event);
    expect(events.map(({ type }) => type)).toEqual([
      "response.start", "scene.add", "response.error", "scene.add", "response.complete",
    ]);
  });
});

describe("remote consumption and credentials", () => {
  it("settles result eagerly and replays buffered events to a delayed stream consumer", async () => {
    const handler = createVideoStreamHandler({
      authorize: "none",
      heartbeatMs: false,
      generate: async function* () { yield validScene("good"); yield { type: "plan.complete" as const }; },
    });
    let credentials: RequestCredentials | undefined;
    const run = streamVideo({
      endpoint: "https://api.test/motion",
      input: { input: "facts" },
      requestId: "request-remote",
      credentials: "include",
      fetcher: async (input, init) => {
        credentials = init?.credentials;
        return handler(new Request(input, init));
      },
    });
    await expect(run.result).resolves.toMatchObject({ status: "complete" });
    const events = [];
    for await (const event of run.stream) events.push(event);
    expect(events.map(({ type }) => type)).toEqual([
      "response.start", "scene.add", "scene.add", "response.complete",
    ]);
    expect(credentials).toBe("include");
  });

  it("emits credentialed CORS headers only for an allowed origin", async () => {
    const handler = createVideoStreamHandler({
      authorize: "none",
      allowedOrigins: ["https://app.test"], allowCredentials: true, heartbeatMs: false,
      generate: async function* () { yield validScene("good"); yield { type: "plan.complete" as const }; },
    });
    const response = await handler(new Request("https://api.test", {
      method: "OPTIONS", headers: { origin: "https://app.test" },
    }));
    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.test");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("propagates eager fetch failures to both result and stream", async () => {
    const run = streamVideo({
      endpoint: "https://api.test/motion",
      input: { input: "facts" }, requestId: "request-error",
      fetcher: async () => { throw new Error("network unavailable"); },
    });
    await expect(run.result).rejects.toThrow("Video response stream failed");
    await expect(async () => { for await (const event of run.stream) void event; })
      .rejects.toThrow("Video response stream failed");
  });
});

describe("local consumption lifecycle", () => {
  it("settles result eagerly and replays buffered events to delayed consumers", async () => {
    const run = createVideo({ input: "facts" }, {
      generate: async function* () {
        yield validScene("good");
        yield { type: "plan.complete" as const };
      },
    });

    await expect(run.result).resolves.toMatchObject({ status: "complete" });
    const first = [];
    for await (const event of run.stream) first.push(event);
    const replay = [];
    for await (const event of run.stream) replay.push(event);
    expect(first.map(({ type }) => type)).toEqual([
      "response.start", "scene.add", "scene.add", "response.complete",
    ]);
    expect(replay).toEqual(first);
  });

  it("resolves terminal protocol errors and aborts without a stream consumer", async () => {
    const failed = createVideo({ input: "facts" }, {
      generate: async function* () { yield validScene("good"); },
    });
    await expect(failed.result).resolves.toMatchObject({ status: "error" });

    const waiting = createVideo({ input: "facts" }, {
      generate: async function* ({ signal }) {
        if (signal.aborted) return;
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
        yield* [];
      },
    });
    waiting.abort("cancelled in test");
    await expect(waiting.result).resolves.toMatchObject({ status: "aborted", abortReason: "cancelled in test" });
  });

  it("rejects lifecycle execution failures", async () => {
    const run = createVideo({ input: "facts" }, {
      onEvent: () => { throw new Error("host callback failed"); },
      generate: async function* () { yield { type: "plan.complete" as const }; },
    });
    await expect(run.result).rejects.toThrow("host callback failed");
    await expect(async () => { for await (const event of run.stream) void event; })
      .rejects.toThrow("host callback failed");
  });
});
