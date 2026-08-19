import { describe, expect, it } from "vitest";

describe("acceptance template catalog", () => {
  it("loads the complete packaged template metadata without renderer services", async () => {
    const api = await import("../scripts/acceptance/catalog").catch(() => undefined);
    expect(api?.loadAcceptanceKit).toBeTypeOf("function");
    if (!api?.loadAcceptanceKit) return;

    const kit = api.loadAcceptanceKit();
    expect(kit.templates).toHaveLength(28);
    expect(kit.capabilities.templates).toContain("notification");
    expect(kit.capabilities.templates).toContain("bigNumber");
    expect(kit.capabilities.templates).toContain("ctaLogo");

    const starter = api.loadAcceptanceKit(api.ACCEPTANCE_TEMPLATE_IDS);
    expect(starter.templates).toHaveLength(10);
    expect(starter.capabilities.templates).not.toContain("testimonial");
  });
});
