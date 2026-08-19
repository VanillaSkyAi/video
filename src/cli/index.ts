import { resolve } from "node:path";
import {
  addRegistryTemplates,
  listRegistryTemplates,
  type RegistryFileChange,
} from "./registry.js";
import { previewTemplateSync, syncTemplates } from "./sync.js";
import { checkTemplates } from "./check.js";
import { createTemplate } from "./create.js";
import { templateVariableNotation } from "../visual-system/catalog/schema.js";
import {
  builtinTemplateCatalog,
  effectiveTemplateCatalog,
  findBuiltinTemplate,
  findEffectiveTemplate,
  hasProjectTemplateSources,
  type TemplateCatalogItem,
} from "./catalog.js";

export interface VanillaSkyCliEnvironment {
  cwd?: string;
  write?: (line: string) => void;
}

function help(): string {
  return [
    "VanillaSky source-owned templates",
    "",
    "Usage:",
    "  vanillasky list [--builtin] [--json]",
    "  vanillasky describe <template> [--builtin] [--json]",
    "  vanillasky add <template...> [--dry-run|--diff] [--overwrite]",
    "  vanillasky add --all [--dry-run|--diff] [--overwrite]",
    "  vanillasky sync [--check]",
    "  vanillasky check",
    "  vanillasky create <id>",
  ].join("\n");
}

function unknownOption(command: string, args: readonly string[], allowed: readonly string[]): string | undefined {
  const known = new Set(allowed);
  const unknown = args.find((arg) => arg.startsWith("-") && !known.has(arg));
  return unknown ? `Unknown ${command} option: ${unknown}` : undefined;
}

function compactDiff(change: RegistryFileChange): string {
  const before = change.before?.split("\n") ?? [];
  const after = change.after.split("\n");
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1;
  const removed = before.slice(prefix, before.length - suffix);
  const added = after.slice(prefix, after.length - suffix);
  return [
    `--- ${change.path}`,
    `+++ ${change.path}`,
    `@@ -${prefix + 1},${removed.length} +${prefix + 1},${added.length} @@`,
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
  ].join("\n");
}

function sanitizeTerminalOutput(value: string): string {
  return [...value].filter((character) => {
    const code = character.charCodeAt(0);
    return code > 159 || (code > 31 && code < 127) || code === 9 || code === 10;
  }).join("");
}

export function runVanillaSkyCli(
  argv: string[],
  environment: VanillaSkyCliEnvironment = {},
): number | Promise<number> {
  const output = environment.write ?? console.log;
  const write = (line: string): void => output(sanitizeTerminalOutput(line));
  const cwd = resolve(environment.cwd ?? process.cwd());
  const [command, ...args] = argv;

  if (command === "create") {
    return (async () => {
      try {
        const unknown = unknownOption("create", args, []);
        if (unknown) throw new Error(unknown);
        if (args.length === 0) throw new Error("Choose one template id. Usage: vanillasky create <id>.");
        if (args.length > 1) throw new Error(`Unexpected create argument: ${args[1]}`);
        const id = args[0];
        const result = await createTemplate({ cwd, id });
        write(`Created template: ${result.path}`);
        write(`Synced ${result.templates} template${result.templates === 1 ? "" : "s"} to vanillasky/index.ts and vanillasky/server.ts.`);
        write(`Source: ${result.path}`);
        write("Validate templates: vanillasky check");
        for (const warning of result.warnings ?? []) write(`Warning: ${warning}`);
        return 0;
      } catch (error) {
        write(error instanceof Error ? error.message : String(error));
        return 1;
      }
    })();
  }

  if (command === "check") {
    return (async () => {
      try {
        const unknown = unknownOption("check", args, []);
        if (unknown) throw new Error(unknown);
        if (args.length > 0) throw new Error(`Unexpected check argument: ${args[0]}`);
        const result = await checkTemplates({ cwd });
        write(`Checked ${result.templates} template${result.templates === 1 ? "" : "s"}, ${result.examples} example${result.examples === 1 ? "" : "s"}, and ${result.renders} deterministic renders.`);
        write("Generated browser/server registries match. Application imports were not inspected.");
        return 0;
      } catch (error) {
        write(error instanceof Error ? error.message : String(error));
        return 1;
      }
    })();
  }

  if (command === "sync") {
    return (async () => {
      try {
        const unknown = unknownOption("sync", args, ["--check"]);
        if (unknown) throw new Error(unknown);
        const result = await syncTemplates({ cwd, check: args.includes("--check") });
        if (args.includes("--check")) {
          write("Template entrypoints are up to date.");
        } else {
          const count = result.templates.length;
          write(`Synced ${count} template${count === 1 ? "" : "s"} to vanillasky/index.ts and vanillasky/server.ts.`);
        }
        for (const warning of result.warnings) write(`Warning: ${warning}`);
        return 0;
      } catch (error) {
        write(error instanceof Error ? error.message : String(error));
        return 1;
      }
    })();
  }

  if (command === "list") {
    const unknown = unknownOption("list", args, ["--builtin", "--json"]);
    if (unknown) {
      write(unknown);
      return 1;
    }
    const positional = args.filter((arg) => !["--builtin", "--json"].includes(arg));
    if (positional.length > 0) {
      write(`Unexpected list argument: ${positional[0]}`);
      return 1;
    }
    const render = (items: readonly TemplateCatalogItem[]): number => {
      if (args.includes("--json")) write(JSON.stringify(items.map((item) => ({
        id: item.id,
        title: item.title,
        origin: item.origin,
        status: item.status,
        useWhen: item.useWhen,
        summary: item.summary,
      })), null, 2));
      else {
        write("ID\tORIGIN\tSTATUS\tUSE WHEN");
        for (const item of items) write(`${item.id}\t${item.origin}\t${item.status}\t${item.useWhen}`);
      }
      return 0;
    };
    if (args.includes("--builtin") || !hasProjectTemplateSources(cwd)) return render(builtinTemplateCatalog());
    return effectiveTemplateCatalog(cwd).then(render).catch((error) => {
      write(error instanceof Error ? error.message : String(error));
      return 1;
    });
  }

  if (command === "add") {
    const allowed = ["--all", "--dry-run", "--diff", "--overwrite"];
    const unknown = unknownOption("add", args, allowed);
    if (unknown) {
      write(unknown);
      return 1;
    }
    const dryRun = args.includes("--dry-run");
    const showDiff = args.includes("--diff");
    if (dryRun && showDiff) {
      write("Choose either --dry-run or --diff.");
      return 1;
    }
    const addAll = args.includes("--all");
    const positional = args.filter((arg) => !allowed.includes(arg));
    if (addAll && positional.length > 0) {
      write("Use either named templates or --all.");
      return 1;
    }
    const names = addAll ? listRegistryTemplates().map(({ id }) => id) : positional;
    if (names.length === 0) {
      write("Choose at least one template. Run `vanillasky list` to see the catalog.");
      return 1;
    }
    return (async () => {
      try {
        const preview = dryRun || showDiff;
        const result = addRegistryTemplates({
          cwd,
          names,
          dryRun: preview,
          overwrite: args.includes("--overwrite"),
        });
        const changes = preview
          ? [...result.changes, ...await previewTemplateSync({ cwd, templates: result.previewTemplates })]
          : result.changes;
        if (showDiff) {
          if (changes.length === 0) write("No changes.");
          else for (const change of changes) write(compactDiff(change));
          return 0;
        }
        if (dryRun) {
          if (result.added.length > 0) write(`Would add ${result.added.join(", ")}.`);
          if (result.updated.length > 0) write(`Would update ${result.updated.join(", ")}.`);
          if (changes.length === 0) write("No changes.");
          else for (const change of changes) write(`${change.action}\t${change.path}`);
          return 0;
        }

        await syncTemplates({ cwd });
        if (result.added.length > 0) write(`Added ${result.added.join(", ")}.`);
        if (result.updated.length > 0) write(`Updated ${result.updated.join(", ")}.`);
        if (result.added.length === 0 && result.updated.length === 0) {
          write("Those templates are already installed.");
        }
        const templateSources = result.files.filter((file) => /^vanillasky\/templates\/.*\.tsx$/.test(file));
        if (templateSources.length > 0) {
          write(`${templateSources.length === 1 ? "Template source" : "Template sources"}: ${templateSources.join(", ")}`);
        }
        return 0;
      } catch (error) {
        write(error instanceof Error ? error.message : String(error));
        return 1;
      }
    })();
  }

  if (command === "describe") {
    const unknown = unknownOption("describe", args, ["--builtin", "--json"]);
    if (unknown) {
      write(unknown);
      return 1;
    }
    const names = args.filter((arg) => arg !== "--json" && arg !== "--builtin");
    if (names.length > 1) {
      write(`Unexpected describe argument: ${names[1]}`);
      return 1;
    }
    const name = names[0];
    const render = (item: TemplateCatalogItem | undefined): number => {
      if (!item) {
        write(`Unknown template: ${name ?? ""}. Run \`vanillasky list\` to see the catalog.`);
        return 1;
      }
      if (args.includes("--json")) {
        write(JSON.stringify(item, null, 2));
        return 0;
      }
      write(`${item.id} — ${item.title}`);
      if (item.summary) write(item.summary);
      write(`Origin\t${item.origin}`);
      write(`Status\t${item.status}`);
      write(`Use when\t${item.planner.useWhen}`);
      if (item.planner.avoidWhen) write(`Avoid when\t${item.planner.avoidWhen}`);
      if (item.family) write(`Family\t${item.family}`);
      if (item.jobs) write(`Jobs\t${item.jobs.join(", ")}`);
      if (item.register) write(`Register\t${item.register}`);
      const duration = [
        item.duration.min == null ? undefined : `${item.duration.min}s minimum`,
        item.duration.preferred == null ? undefined : `${item.duration.preferred}s preferred`,
      ].filter(Boolean).join(", ");
      if (duration) write(`Duration\t${duration}`);
      write(`Generated browser\t${item.generated.browser.path}\t${item.generated.browser.current == null ? "not applicable" : item.generated.browser.current ? "current" : "stale"}`);
      write(`Generated server\t${item.generated.server.path}\t${item.generated.server.current == null ? "not applicable" : item.generated.server.current ? "current" : "stale"}`);
      write(`Generated files\t${item.generated.current == null ? "not applicable to packaged templates" : item.generated.current ? "current" : "stale"}`);
      write("Application wiring\tnot inspected or verified");
      for (const [fieldName, property] of Object.entries(item.schema.properties)) {
        const required = item.schema.required?.includes(fieldName) === true;
        const notation = templateVariableNotation(property, required).replace(/!$/, "");
        write(`${fieldName}\t${notation}\t${required ? "required" : "optional"}\t${property.description ?? ""}`);
      }
      return 0;
    };
    if (!name) return render(undefined);
    if (args.includes("--builtin") || !hasProjectTemplateSources(cwd)) return render(findBuiltinTemplate(name));
    return findEffectiveTemplate(cwd, name).then(render).catch((error) => {
      write(error instanceof Error ? error.message : String(error));
      return 1;
    });
  }

  write(help());
  return command == null || command === "help" || command === "--help" || command === "-h" ? 0 : 1;
}
