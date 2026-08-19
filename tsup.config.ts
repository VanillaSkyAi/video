import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    server: "src/server.ts",
    react: "src/react.ts",
    templates: "src/templates.ts",
    "template-catalog": "src/template-catalog.ts",
    test: "src/test.ts",
    cli: "src/cli.ts",
    "check-runtime": "src/cli/check-runtime.ts",
  },
  format: ["esm"],
  dts: true,
  // Keep the published package within budget now that built-in renderers are
  // code-split. The emitted ESM remains readable and canonical sources live in
  // the repository and editable template registry.
  sourcemap: false,
  clean: true,
  splitting: true,
  external: ["react", "react-dom"],
});
