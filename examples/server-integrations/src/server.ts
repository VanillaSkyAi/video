export const EXAMPLE_MAX_BODY_BYTES = 64 * 1024;

export function securityOptions() {
  const bearerToken = process.env.DEMO_BEARER_TOKEN;
  if (!bearerToken) throw new Error("Set DEMO_BEARER_TOKEN before starting the example");
  return {
    allowedOrigins: [process.env.APP_ORIGIN ?? "http://127.0.0.1:5173"],
    authorize: (request: Request) => request.headers.get("authorization") === `Bearer ${bearerToken}`,
    maxBodyBytes: EXAMPLE_MAX_BODY_BYTES,
    onError: (error: Error) => console.error("planner error", error.message),
  };
}
