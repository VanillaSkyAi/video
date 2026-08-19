// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, StrictMode, type ReactNode } from "react";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { Video } from "../src/index";
import type { VideoInput } from "../src/internal";
import { checksumVideo } from "../src/protocol/checksum";
import { createRenderTemplateRegistry, defineTemplate } from "../src/visual-system/catalog/internal";
import { TEST_VIDEO_STYLE } from "./semantic-brand-fixture";

const kit = createRenderTemplateRegistry({ templates: [defineTemplate({
  id: "metric",
  schema: {
    type: "object",
    properties: { value: { type: "string", default: "" } },
    required: ["value"],
    additionalProperties: false,
  },
  component: ({ variables }) => createElement("span", null, String(variables.value)),
})] });

function sseResponse(requestId: string, value: string): Response {
  const snapshot = { schemaVersion: "0.1" as const, orientation: "portrait" as const, scenes: [{ id: "one", templateId: "metric", variables: { value }, timing: { fixedDuration: 4, startTime: 0, endTime: 4 } }], style: TEST_VIDEO_STYLE };
  const events = [
    { protocolVersion: "0.4", type: "response.start", eventId: "run:0", runId: "run", sequence: 0, data: { requestId, format: { orientation: "portrait" }, style: TEST_VIDEO_STYLE, capabilities: { templates: ["metric"] } } },
    { protocolVersion: "0.4", type: "scene.add", eventId: "run:1", runId: "run", sequence: 1, data: { scene: { id: "one", templateId: "metric", variables: { value }, timing: { fixedDuration: 4, startTime: 0, endTime: 4 } }, position: 0, revision: 0 } },
    { protocolVersion: "0.4", type: "response.complete", eventId: "run:2", runId: "run", sequence: 2, data: { finishReason: "stop", snapshot, checksum: checksumVideo(snapshot) } },
  ];
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", {
    headers: { "content-type": "text/event-stream", "x-vanillasky-video-stream": "0.4" },
  });
}

function terminalErrorResponse(requestId: string): Response {
  const events = [
    { protocolVersion: "0.4", type: "response.start", eventId: "failed-run:0", runId: "failed-run", sequence: 0, data: { requestId, format: { orientation: "portrait" }, style: TEST_VIDEO_STYLE, capabilities: { templates: ["metric"] } } },
    { protocolVersion: "0.4", type: "response.error", eventId: "failed-run:1", runId: "failed-run", sequence: 1, data: { error: { code: "generation_failed", message: "Video response generation failed", recoverable: false }, terminal: true, snapshot: { schemaVersion: "0.1", orientation: "portrait", scenes: [], style: TEST_VIDEO_STYLE } } },
  ];
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream", "x-vanillasky-video-stream": "0.4" },
  });
}

function terminalAbortResponse(requestId: string): Response {
  const snapshot = { schemaVersion: "0.1" as const, orientation: "portrait" as const, scenes: [], style: TEST_VIDEO_STYLE };
  const events = [
    { protocolVersion: "0.4", type: "response.start", eventId: "aborted-run:0", runId: "aborted-run", sequence: 0, data: { requestId, format: { orientation: "portrait" }, style: TEST_VIDEO_STYLE, capabilities: { templates: ["metric"] } } },
    { protocolVersion: "0.4", type: "response.abort", eventId: "aborted-run:1", runId: "aborted-run", sequence: 1, data: { reason: "server stopped", snapshot } },
  ];
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream", "x-vanillasky-video-stream": "0.4" },
  });
}

function warningResponse(requestId: string): Response {
  const snapshot = { schemaVersion: "0.1" as const, orientation: "portrait" as const, scenes: [{ id: "one", templateId: "metric", variables: { value: "warned" }, timing: { fixedDuration: 4, startTime: 0, endTime: 4 } }], style: TEST_VIDEO_STYLE };
  const events = [
    { protocolVersion: "0.4", type: "response.start", eventId: "warning-run:0", runId: "warning-run", sequence: 0, data: { requestId, format: { orientation: "portrait" }, style: TEST_VIDEO_STYLE, capabilities: { templates: ["metric"] } } },
    { protocolVersion: "0.4", type: "response.warning", eventId: "warning-run:1", runId: "warning-run", sequence: 1, data: { warning: { code: "provider_warning", category: "provider", message: "The model provider reported a warning.", recoverable: true } } },
    { protocolVersion: "0.4", type: "scene.add", eventId: "warning-run:2", runId: "warning-run", sequence: 2, data: { scene: snapshot.scenes[0], position: 0, revision: 0 } },
    { protocolVersion: "0.4", type: "response.complete", eventId: "warning-run:3", runId: "warning-run", sequence: 3, data: { finishReason: "stop", snapshot, checksum: checksumVideo(snapshot) } },
  ];
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", {
    headers: { "content-type": "text/event-stream", "x-vanillasky-video-stream": "0.4" },
  });
}

describe("useVideo", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("defaults to /api/video and returns the completed video", async () => {
    const { useVideo } = await import("../src/react");
    let endpoint: RequestInfo | URL | undefined;
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      endpoint = input;
      const body = JSON.parse(String(init?.body));
      return sseResponse(body.requestId, "awaited");
    });
    const { result } = renderHook(() => useVideo({ templates: kit, fetcher }));

    expectTypeOf(useVideo).toBeCallableWith();
    expectTypeOf(result.current.generate).returns.toEqualTypeOf<Promise<Video>>();
    expectTypeOf(result.current.playerProps).not.toBeNullable();
    expect(result.current.playerProps.templates.getTemplate("metric")).toBe(kit.getTemplate("metric"));
    expect(result.current.playerProps.templates.getTemplate("bigNumber")).toBeDefined();

    let generated: Promise<Video> | undefined;
    act(() => {
      generated = result.current.generate({ input: "Await this video" });
    });

    await expect(generated).resolves.toMatchObject({
      orientation: "portrait",
      scenes: [{ variables: { value: "awaited" } }],
    });
    expect(endpoint).toBe("/api/video");
    await waitFor(() => expect(result.current.status).toBe("complete"));
    expect(result.current.video).toEqual(await generated);
    expect(result.current.warnings).toEqual([]);
    expect(result.current).not.toHaveProperty("state");
    expect(result.current).not.toHaveProperty("config");
  });

  it("allows overriding the inferred endpoint", async () => {
    const { useVideo } = await import("../src/react");
    let endpoint: RequestInfo | URL | undefined;
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      endpoint = input;
      const body = JSON.parse(String(init?.body));
      return sseResponse(body.requestId, "override");
    });
    const { result } = renderHook(() => useVideo({ endpoint: "/api/custom-video", templates: kit, fetcher }));

    await act(async () => {
      await result.current.generate({ input: "Use the custom route" });
    });

    expect(endpoint).toBe("/api/custom-video");
  });

  it("exposes safe streamed warnings at the top level", async () => {
    const { useVideo } = await import("../src/react");
    const { result } = renderHook(() => useVideo({
      templates: kit,
      fetcher: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        return warningResponse(body.requestId);
      },
    }));

    await act(async () => {
      await result.current.generate({ input: "Warn safely" });
    });

    expect(result.current.warnings).toEqual([{
      code: "provider_warning",
      category: "provider",
      message: "The model provider reported a warning.",
      recoverable: true,
    }]);
    expect(result.current.video?.scenes).toHaveLength(1);
  });

  it("reports an incompatible server protocol version distinctly from a missing header", async () => {
    const { useVideo } = await import("../src/react");
    const fetcher: typeof fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      const response = sseResponse(body.requestId, "old server");
      response.headers.set("x-vanillasky-video-stream", "0.2");
      return response;
    });
    const { result } = renderHook(() => useVideo({ templates: kit, fetcher }));

    let generation: Promise<Video> | undefined;
    act(() => {
      generation = result.current.generate({ input: "Detect protocol skew" });
    });

    await expect(generation).rejects.toThrow(
      "Video response protocol mismatch: expected 0.4, received 0.2",
    );
  });

  it("rejects terminal generation errors with safe typed server context", async () => {
    const { useVideo, VideoError } = await import("../src/react");
    const fetcher: typeof fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      return terminalErrorResponse(body.requestId);
    });
    const { result } = renderHook(() => useVideo({
      templates: kit,
      fetcher,
      createRequestId: () => "request-terminal",
    }));

    let generation: Promise<Video> | undefined;
    act(() => { generation = result.current.generate({ input: "Fail safely" }); });

    await expect(generation).rejects.toMatchObject({
      name: "VideoError",
      code: "generation_failed",
      message: "Video response generation failed",
      status: 200,
      requestId: "request-terminal",
      runId: "failed-run",
      recoverable: false,
    });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(VideoError));
    expect(result.current.status).toBe("error");
    expect(result.current.video).toMatchObject({ scenes: [] });
    const events = [];
    for await (const event of result.current.playerProps.stream!) events.push(event);
    expect(events.map(({ type }) => type)).toEqual(["response.start", "response.error"]);
  });

  it("keeps server response.abort as aborted while rejecting a typed error", async () => {
    const { useVideo, VideoError } = await import("../src/react");
    const fetcher: typeof fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      return terminalAbortResponse(body.requestId);
    });
    const { result } = renderHook(() => useVideo({
      templates: kit,
      fetcher,
      createRequestId: () => "request-server-abort",
    }));

    let generation: Promise<Video> | undefined;
    act(() => { generation = result.current.generate({ input: "Abort safely" }); });

    await expect(generation).rejects.toSatisfy((error: unknown) =>
      error instanceof VideoError &&
      error.code === "aborted" &&
      error.message === "server stopped" &&
      error.requestId === "request-server-abort" &&
      error.runId === "aborted-run",
    );
    await waitFor(() => expect(result.current.error).toBeInstanceOf(VideoError));
    expect(result.current.status).toBe("aborted");
    expect(result.current.video).toMatchObject({ scenes: [] });
  });

  it("preserves safe JSON details on typed HTTP errors", async () => {
    const { useVideo, VideoError } = await import("../src/react");
    const fetcher: typeof fetch = vi.fn(async () => Response.json({
      error: { code: "unauthorized", message: "Authentication required" },
    }, { status: 401 }));
    const { result } = renderHook(() => useVideo({
      templates: kit,
      fetcher,
      createRequestId: () => "request-http",
    }));

    let generation: Promise<Video> | undefined;
    act(() => { generation = result.current.generate({ input: "Authenticate" }); });

    await expect(generation).rejects.toSatisfy((error: unknown) =>
      error instanceof VideoError &&
      error.code === "unauthorized" &&
      error.message === "Authentication required" &&
      error.status === 401 &&
      error.requestId === "request-http" &&
      error.runId === undefined,
    );
  });

  it("bounds and redacts unrecognized HTTP diagnostics", async () => {
    const { useVideo } = await import("../src/react");
    const fetcher: typeof fetch = vi.fn(async () => Response.json({
      error: {
        code: "provider_secret_code",
        message: `authorization=private-token ${"x".repeat(500)}`,
      },
    }, { status: 502 }));
    const { result } = renderHook(() => useVideo({ templates: kit, fetcher }));

    let generation: Promise<Video> | undefined;
    act(() => { generation = result.current.generate({ input: "Fail safely" }); });

    await expect(generation).rejects.toMatchObject({ code: "http_error", status: 502 });
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message.length).toBeLessThanOrEqual(160);
    expect(result.current.error?.message).not.toContain("private-token");
  });

  it("generates after React Strict Mode replays effects", async () => {
    const { useVideo } = await import("../src/react");
    const fetcher: typeof fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      return sseResponse(body.requestId, "strict");
    });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);
    const { result } = renderHook(() => useVideo({ endpoint: "/api/motion", templates: kit, fetcher }), { wrapper });
    act(() => {
      void result.current.generate({ input: "Strict mode" });
    });
    await waitFor(() => expect(result.current.status).toBe("complete"));
  });

  it("uses the trusted built-in templates when no registry is configured", async () => {
    const { useVideo } = await import("../src/react");
    let sent: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = vi.fn(async (_input, init) => {
      sent = JSON.parse(String(init?.body));
      return sseResponse(String(sent?.requestId), "default");
    });
    const { result } = renderHook(() => useVideo({ endpoint: "/api/motion", fetcher }));

    act(() => {
      void result.current.generate({ input: "Revenue reached 42." });
    });
    await waitFor(() => expect(result.current.status).toBe("complete"));

    expect((sent?.capabilities as { templates?: string[] }).templates).toContain("bigNumber");
    expect(result.current.playerProps?.templates.getTemplate("bigNumber")).toBeDefined();
  });

  it("negotiates an explicit template selection without removing renderers", async () => {
    const { useVideo } = await import("../src/react");
    let sent: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = vi.fn(async (_input, init) => {
      sent = JSON.parse(String(init?.body));
      return sseResponse(String(sent?.requestId), "selected");
    });
    const { result } = renderHook(() => useVideo({
      templateIds: ["metric"],
      templates: kit,
      fetcher,
    }));

    await act(async () => {
      await result.current.generate({ input: "Use only the selected planner template" });
    });

    expect((sent?.capabilities as { templates: string[] }).templates).toEqual(["metric"]);
    expect(result.current.playerProps.templates.getTemplate("metric")).toBeDefined();
    expect(result.current.playerProps.templates.getTemplate("bigNumber")).toBeDefined();
  });

  it("infers request IDs and kit capabilities and exposes player-ready state", async () => {
    const { useVideo } = await import("../src/react");
    expect(useVideo).toBeTypeOf("function");
    let sent: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = vi.fn(async (_input, init) => {
      sent = JSON.parse(String(init?.body));
      return sseResponse(String(sent?.requestId), "latest");
    });
    const { result } = renderHook(() => useVideo({ endpoint: "/api/motion", templates: kit, fetcher }));
    const input: VideoInput = { input: "Compose this" };

    act(() => {
      void result.current.generate(input);
    });
    await waitFor(() => expect(result.current.status).toBe("complete"));

    expect(sent).toMatchObject({ input });
    expect((sent?.capabilities as { templates: string[] }).templates).toEqual(
      expect.arrayContaining(["metric", "bigNumber"]),
    );
    expect(sent?.requestId).toMatch(/^request-/);
    expect(result.current.video?.scenes[0]?.variables).toEqual({ value: "latest" });
    expect(result.current.error).toBeUndefined();
    expect(result.current.playerProps.templates.getTemplate("metric")).toBe(kit.getTemplate("metric"));
    expect(result.current.playerProps.templates.getTemplate("bigNumber")).toBeDefined();
    expect(result.current.playerProps?.stream).toBeDefined();
    expect(result.current).not.toHaveProperty("run");
    expect(result.current).not.toHaveProperty("stream");
    expect(result.current).not.toHaveProperty("result");

    act(() => result.current.abort("too late"));
    expect(result.current.status).toBe("complete");
  });

  it("aborts replacement and unmounted runs and ignores stale completions", async () => {
    const { useVideo } = await import("../src/react");
    const requests: Array<{ signal: AbortSignal; resolve: (response: Response) => void; body: Record<string, unknown> }> = [];
    const fetcher: typeof fetch = vi.fn((_input, init) => new Promise<Response>((resolve) => {
      requests.push({ signal: init!.signal as AbortSignal, resolve, body: JSON.parse(String(init?.body)) });
    }));
    const { result, unmount } = renderHook(() => useVideo({ endpoint: "/api/motion", templates: kit, fetcher }));

    act(() => {
      void result.current.generate({ input: "first" });
    });
    await waitFor(() => expect(requests).toHaveLength(1));
    act(() => {
      void result.current.generate({ input: "second" });
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0].signal.aborted).toBe(true);

    act(() => requests[1].resolve(sseResponse(String(requests[1].body.requestId), "second")));
    await waitFor(() => expect(result.current.status).toBe("complete"));
    expect(result.current.video?.scenes[0]?.variables).toEqual({ value: "second" });

    act(() => requests[0].resolve(sseResponse(String(requests[0].body.requestId), "stale")));
    await Promise.resolve();
    expect(result.current.video?.scenes[0]?.variables).toEqual({ value: "second" });

    act(() => {
      void result.current.generate({ input: "third" });
    });
    await waitFor(() => expect(requests).toHaveLength(3));
    unmount();
    expect(requests[2].signal.aborted).toBe(true);
  });

  it("supports explicit cancellation and reports endpoint failures", async () => {
    const { useVideo } = await import("../src/react");
    let signal: AbortSignal | undefined;
    const fetcher: typeof fetch = vi.fn(async (_input, init) => {
      signal = init?.signal as AbortSignal;
      return new Response("no", { status: 500 });
    });
    const { result } = renderHook(() => useVideo({ endpoint: "/api/motion", templates: kit, fetcher }));

    let failedGeneration: Promise<Video> | undefined;
    act(() => {
      failedGeneration = result.current.generate({ input: "failure" });
    });
    await expect(failedGeneration).rejects.toThrow(/endpoint failed/i);
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.message).toMatch(/endpoint failed/i);

    const pendingFetcher: typeof fetch = vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => {
      signal = init?.signal as AbortSignal;
      signal.addEventListener("abort", () => reject(signal?.reason), { once: true });
    }));
    const pending = renderHook(() => useVideo({
      endpoint: "/api/motion",
      templates: kit,
      fetcher: pendingFetcher,
      createRequestId: () => "request-aborted",
    }));
    let cancelledGeneration: Promise<Video> | undefined;
    act(() => {
      cancelledGeneration = pending.result.current.generate({ input: "cancel" });
    });
    await waitFor(() => expect(signal).toBeDefined());
    act(() => pending.result.current.abort("stopped"));
    expect(signal?.aborted).toBe(true);
    expect(pending.result.current.status).toBe("aborted");
    const { VideoError } = await import("../src/react");
    await expect(cancelledGeneration).rejects.toSatisfy((error: unknown) =>
      error instanceof VideoError &&
      error.code === "aborted" &&
      error.message === "stopped" &&
      error.requestId === "request-aborted",
    );
    expect(pending.result.current.error).toBeInstanceOf(VideoError);
    expect(pending.result.current.error).toMatchObject({
      code: "aborted",
      message: "stopped",
      requestId: "request-aborted",
      recoverable: false,
    });
  });
});
