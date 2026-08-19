import { link, lstat, mkdir, open, rmdir, unlink } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { syncTemplates, type SyncTemplatesResult } from "./sync.js";
import { safeProjectPath } from "./safe-path.js";

export interface CreateTemplateOptions {
  cwd?: string;
  id: string;
  sync?: (options: { cwd: string }) => Promise<SyncTemplatesResult | unknown>;
}

export interface CreateTemplateResult {
  path: string;
  templates: number;
  warnings?: readonly string[];
}

const TEMPLATE_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
const MAX_TEMPLATE_ID_BYTES = 128;
const WINDOWS_RESERVED_BASENAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
let temporaryFileSequence = 0;

function titleFor(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function sourceFor(id: string): string {
  const title = titleFor(id);
  const titleLiteral = JSON.stringify(title);
  return `import { defineTemplate } from "@vanillaskyai/video/templates";

export const template = defineTemplate({
  id: ${JSON.stringify(id)},
  label: ${titleLiteral},
  description: "A focused headline and supporting detail for a grounded visual response.",
  useWhen: "Use when the response should emphasize ${title} with one concise supporting detail.",
  schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        title: "Headline",
        description: "The main grounded point the viewer should remember.",
        minLength: 1,
        maxLength: 72,
        default: ${titleLiteral},
      },
      subtitle: {
        type: "string",
        title: "Supporting detail",
        description: "One concise detail that explains or grounds the headline.",
        minLength: 1,
        maxLength: 140,
        default: "A visual response grounded in the available context.",
      },
    },
    required: ["title", "subtitle"],
    additionalProperties: false,
  } as const,
  examples: [{
    name: "${title} update",
    variables: {
      title: ${titleLiteral},
      subtitle: "A visual response grounded in the available context.",
    },
  }],
  minDuration: 3,
  preferredDuration: 5,
  component: ({ variables, progress, width, height, safeZone }) => {
    const isPortrait = height >= width;
    const reveal = Math.max(0, Math.min(1, progress * 1.5));
    const contentWidth = isPortrait
      ? width - safeZone.left - safeZone.right
      : Math.min(width * 0.72, 960);

    return <section style={{
      boxSizing: "border-box",
      width,
      height,
      padding: safeZone.top + "px " + safeZone.right + "px " + safeZone.bottom + "px " + safeZone.left + "px",
      display: "grid",
      placeItems: "center",
      overflow: "hidden",
      color: "#ffffff",
      background: "linear-gradient(145deg, #15112b 0%, #382f73 55%, #7658d6 100%)",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    }}>
      <div style={{
        width: contentWidth,
        opacity: reveal,
        transform: "translateY(" + Math.round((1 - reveal) * 24) + "px)",
        textAlign: isPortrait ? "left" : "center",
      }}>
        <h1 style={{
          margin: 0,
          fontSize: Math.max(34, Math.min(width * (isPortrait ? 0.1 : 0.065), 88)),
          lineHeight: 0.98,
          letterSpacing: "-0.045em",
        }}>
          {variables.title}
        </h1>
        <p style={{
          margin: Math.max(18, height * 0.035) + "px 0 0",
          maxWidth: isPortrait ? "100%" : 760,
          fontSize: Math.max(18, Math.min(width * 0.03, 34)),
          lineHeight: 1.35,
          color: "rgba(255, 255, 255, 0.78)",
        }}>
          {variables.subtitle}
        </p>
      </div>
    </section>;
  },
});
`;
}

async function status(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function assertDirectoryOrMissing(path: string, displayPath: string): Promise<boolean> {
  const existing = await status(path);
  if (!existing) return false;
  if (existing.isSymbolicLink()) throw new Error(`Refusing to create through symbolic link: ${displayPath}`);
  if (!existing.isDirectory()) throw new Error(`Template path ancestor is not a directory: ${displayPath}`);
  return true;
}

async function removeCreatedDirectories(paths: readonly string[]): Promise<void> {
  for (const path of [...paths].reverse()) {
    try {
      await rmdir(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTEMPTY") throw error;
    }
  }
}

export async function createTemplate(options: CreateTemplateOptions): Promise<CreateTemplateResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const { id } = options;
  if (!TEMPLATE_ID.test(id)) {
    throw new Error(`Invalid template id: ${JSON.stringify(id)}. Use a letter first, followed by letters, numbers, _ or -.`);
  }
  if (Buffer.byteLength(id, "utf8") > MAX_TEMPLATE_ID_BYTES) {
    throw new Error(`Invalid template id: template ids must be at most ${MAX_TEMPLATE_ID_BYTES} UTF-8 bytes.`);
  }
  const windowsBasename = `${id}.tsx`.replace(/[ .]+$/u, "").split(".", 1)[0];
  if (WINDOWS_RESERVED_BASENAME.test(windowsBasename)) {
    throw new Error(`Invalid template id: ${JSON.stringify(id)}. This name is reserved on Windows.`);
  }

  const vanillaskyDirectory = join(cwd, "vanillasky");
  const templatesDirectory = join(vanillaskyDirectory, "templates");
  const destination = join(templatesDirectory, `${id}.tsx`);
  const destinationPath = relative(cwd, destination);
  const createdDirectories: string[] = [];
  for (const target of [destination, join(vanillaskyDirectory, "index.ts"), join(vanillaskyDirectory, "server.ts")]) {
    safeProjectPath(cwd, target);
  }

  for (const [path, displayPath] of [
    [vanillaskyDirectory, "vanillasky"],
    [templatesDirectory, "vanillasky/templates"],
  ] as const) {
    if (!await assertDirectoryOrMissing(path, displayPath)) {
      try {
        await mkdir(path);
        createdDirectories.push(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await assertDirectoryOrMissing(path, displayPath);
      }
    }
    safeProjectPath(cwd, destination);
  }

  const existingDestination = await status(destination);
  if (existingDestination?.isSymbolicLink()) {
    await removeCreatedDirectories(createdDirectories);
    throw new Error(`Refusing to replace symbolic link: ${destinationPath}`);
  }
  if (existingDestination) {
    await removeCreatedDirectories(createdDirectories);
    throw new Error(`Template already exists: ${destinationPath}`);
  }

  const temporary = join(templatesDirectory, `.${id}.${process.pid}.${temporaryFileSequence += 1}.tmp`);
  let temporaryExists = false;
  let createdIdentity: { dev: bigint; ino: bigint } | undefined;
  try {
    const handle = await open(temporary, "wx", 0o644);
    temporaryExists = true;
    try {
      await handle.writeFile(sourceFor(id), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temporary, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(`Template already exists: ${destinationPath}`);
      }
      throw error;
    }
    const created = await lstat(destination, { bigint: true });
    createdIdentity = { dev: created.dev, ino: created.ino };
    await unlink(temporary);
    temporaryExists = false;

    const result = await (options.sync ?? syncTemplates)({ cwd });
    const templates = typeof result === "object" && result != null && "templates" in result && Array.isArray(result.templates)
      ? result.templates.length
      : 1;
    const warnings = typeof result === "object" && result != null && "warnings" in result && Array.isArray(result.warnings)
      ? result.warnings.filter((warning): warning is string => typeof warning === "string")
      : [];
    return { path: destinationPath, templates, ...(warnings.length > 0 ? { warnings } : {}) };
  } catch (error) {
    if (temporaryExists) {
      try { await unlink(temporary); } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") throw cleanupError;
      }
    }
    if (createdIdentity) {
      const current = await status(destination);
      if (current && !current.isSymbolicLink()) {
        const identity = await lstat(destination, { bigint: true });
        if (identity.dev === createdIdentity.dev && identity.ino === createdIdentity.ino) await unlink(destination);
      }
    }
    await removeCreatedDirectories(createdDirectories);
    throw error;
  }
}
