import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const packageVersion = JSON.parse(read("package.json")).version as string;

describe("human and agent onboarding", () => {
  it("offers one obvious package command and one optional agent command", () => {
    const readme = read("README.md");
    const product = readme.indexOf("VanillaSky is the open-source video response layer");
    const install = readme.indexOf(`npm install @vanillaskyai/video@${packageVersion} ai @ai-sdk/openai`);
    const skill = readme.indexOf("npx skills add VanillaSkyAi/video@vanillasky");

    expect(product).toBeGreaterThanOrEqual(0);
    expect(install).toBeGreaterThan(product);
    expect(skill).toBeGreaterThan(install);
    expect(readme).toContain("Use $vanillasky to turn this application's data into a personalized video response.");
    expect(readme.split("\n").length).toBeLessThan(200);
  });

  it("ships a generic VanillaSky integration skill", () => {
    const skillRoot = resolve(root, "skills", "vanillasky");
    expect(existsSync(resolve(skillRoot, "SKILL.md"))).toBe(true);
    expect(existsSync(resolve(skillRoot, "agents/openai.yaml"))).toBe(true);
    const source = read("skills/vanillasky/SKILL.md");
    const metadata = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";

    expect(metadata).toContain("name: vanillasky");
    expect(metadata).toContain("@vanillaskyai/video");
    expect(metadata).not.toMatch(/POC|101|cold-start|evaluation|HyperFrames|Remotion/i);
    expect(source).toContain(`npm install @vanillaskyai/video@${packageVersion} ai @ai-sdk/openai`);
    expect(source).toContain("createVideoHandler");
    expect(source).toContain("useVideo");
    expect(source).toContain("VideoPlayer");
    expect(source).toContain("built-in templates");
    expect(source).toContain("ignored `.env.local`");
  });

  it("keeps the public agent guide task-focused and evaluation rules maintainer-only", () => {
    const publicGuide = read("docs/agent-integration.md");
    const maintainerGuide = read("docs/maintainers/cold-start-evaluation.md");
    const agents = read("AGENTS.md");

    expect(publicGuide).toContain("input");
    expect(publicGuide).toContain("createVideoHandler");
    expect(publicGuide).toContain("useVideo");
    expect(publicGuide).not.toMatch(/choose.*101|proof of concept|candidate tarball|fresh consumer directory/i);
    expect(maintainerGuide).toMatch(/cold-start evaluation/i);
    expect(maintainerGuide).toContain("fresh consumer");
    expect(agents).toContain("Only for an explicit cold-start evaluation");
  });
});
