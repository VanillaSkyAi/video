import { builtinModules } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);
const declarationPrinter = ts.createPrinter({
  newLine: ts.NewLineKind.LineFeed,
  removeComments: true,
});

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function assertEqual(actual, expected, label) {
  const actualJson = JSON.stringify(sorted(actual));
  const expectedJson = JSON.stringify(sorted(expected));
  if (actualJson !== expectedJson) {
    throw new Error(`${label}\nexpected ${expectedJson}\nreceived ${actualJson}`);
  }
}

function topLevelDeclaration(declaration) {
  let current = declaration;
  while (current.parent && !ts.isSourceFile(current.parent) && !ts.isModuleBlock(current.parent)) {
    current = current.parent;
  }
  return ts.isSourceFile(current) ? undefined : current;
}

function isPackageDeclaration(packageRoot, declaration) {
  return isPackageOwnedPath(packageRoot, declaration.getSourceFile().fileName);
}

function resolveSymbol(checker, symbol) {
  if (!symbol) return undefined;
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function normalizedDeclarationText(declaration) {
  return declarationPrinter
    .printNode(ts.EmitHint.Unspecified, declaration, declaration.getSourceFile())
    .replaceAll("\r\n", "\n")
    .replace(/(from |import\()["'](\.\/[^"']+?)-[A-Z0-9]{8}\.js["']/g, '$1"$2.js"')
    .trim();
}

function signatureForExport(packageRoot, checker, exported) {
  const target = resolveSymbol(checker, exported);
  if (!target) throw new Error(`Could not resolve public export ${exported.name}`);
  const rootDeclarations = new Set(
    (target.declarations ?? [])
      .map(topLevelDeclaration)
      .filter((declaration) => declaration && isPackageDeclaration(packageRoot, declaration)),
  );
  const pending = [...rootDeclarations];
  const declarations = new Set();
  while (pending.length > 0) {
    const declaration = pending.pop();
    if (!declaration || declarations.has(declaration)) continue;
    declarations.add(declaration);
    function visit(node) {
      if (ts.isIdentifier(node) || ts.isQualifiedName(node)) {
        const dependency = resolveSymbol(checker, checker.getSymbolAtLocation(node));
        for (const dependencyDeclaration of dependency?.declarations ?? []) {
          const topLevel = topLevelDeclaration(dependencyDeclaration);
          if (topLevel && isPackageDeclaration(packageRoot, topLevel) && !declarations.has(topLevel)) {
            pending.push(topLevel);
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(declaration);
  }
  const format = (values) => sorted([...values].map(normalizedDeclarationText));
  return {
    kinds: [
      ...(target.flags & ts.SymbolFlags.Value ? ["value"] : []),
      ...(target.flags & ts.SymbolFlags.Type ? ["type"] : []),
    ],
    declaration: format(rootDeclarations),
    support: format([...declarations].filter((declaration) => !rootDeclarations.has(declaration))),
  };
}

function isInsidePackage(packageRoot, path) {
  const child = relative(packageRoot, path);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

function isPackageOwnedPath(packageRoot, path) {
  const canonicalPackageRoot = realpathSync(packageRoot);
  const canonicalPath = realpathSync(path);
  return isCanonicalPackageOwnedPath(canonicalPackageRoot, canonicalPath);
}

function isCanonicalPackageOwnedPath(canonicalPackageRoot, canonicalPath) {
  if (!isInsidePackage(canonicalPackageRoot, canonicalPath)) return false;
  const child = relative(canonicalPackageRoot, canonicalPath);
  return child !== "node_modules" && !child.startsWith(`node_modules${sep}`);
}

function assertDeclarationImportInsidePackage(packageRoot, sourcePath, specifier, compilerOptions) {
  const lexicalPackageRoot = resolve(packageRoot);
  const dependency = resolve(dirname(sourcePath), specifier);
  if (!isCanonicalPackageOwnedPath(lexicalPackageRoot, dependency)) {
    throw new Error(`Public declaration import escaped the package: ${specifier} from ${sourcePath}`);
  }
  const resolvedModule = ts.resolveModuleName(
    specifier,
    sourcePath,
    compilerOptions,
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  if (resolvedModule) {
    if (!isPackageOwnedPath(packageRoot, resolvedModule)) {
      throw new Error(`Public declaration import escaped the package: ${specifier} from ${sourcePath}`);
    }
    return;
  }
  const canonicalPackageRoot = realpathSync(packageRoot);
  const canonicalDependency = resolve(realpathSync(dirname(dependency)), basename(dependency));
  if (!isCanonicalPackageOwnedPath(canonicalPackageRoot, canonicalDependency)) {
    throw new Error(`Public declaration import escaped the package: ${specifier} from ${sourcePath}`);
  }
}

function inspectDeclaration(packageRoot, declarationPath) {
  const program = ts.createProgram([declarationPath], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: false,
    types: [],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => dirname(declarationPath),
      getNewLine: () => "\n",
    }));
  }
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(declarationPath);
  const module = source && checker.getSymbolAtLocation(source);
  if (!module) throw new Error(`Could not inspect declaration entry ${declarationPath}`);
  const runtimeExports = [];
  const typeExports = [];
  const signatures = {};
  for (const exported of checker.getExportsOfModule(module)) {
    const target = exported.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(exported)
      : exported;
    if (target.flags & ts.SymbolFlags.Value) runtimeExports.push(exported.name);
    if (target.flags & ts.SymbolFlags.Type) typeExports.push(exported.name);
    signatures[exported.name] = signatureForExport(packageRoot, checker, exported);
  }
  const files = new Set();
  const external = new Set();
  for (const sourceFile of program.getSourceFiles()) {
    const sourcePath = resolve(sourceFile.fileName);
    if (!isPackageOwnedPath(packageRoot, sourcePath)) continue;
    files.add(sourcePath);
    for (const specifier of moduleReferences(sourceFile.text, sourcePath)) {
      if (specifier.startsWith(".")) {
        assertDeclarationImportInsidePackage(
          packageRoot,
          sourcePath,
          specifier,
          program.getCompilerOptions(),
        );
      } else {
        external.add(specifier);
      }
    }
  }
  const orderedSignatures = Object.fromEntries(
    Object.entries(signatures).sort(([left], [right]) => left.localeCompare(right)),
  );
  const publicDeclarations = new Set(
    Object.values(orderedSignatures).flatMap(({ declaration }) => declaration),
  );
  const signatureSupport = new Set();
  for (const signature of Object.values(orderedSignatures)) {
    for (const declaration of signature.support) {
      if (!publicDeclarations.has(declaration)) signatureSupport.add(declaration);
    }
    delete signature.support;
  }
  return {
    runtimeExports,
    typeExports,
    files: sorted(files),
    external: sorted(external),
    signatures: {
      exports: orderedSignatures,
      support: sorted(signatureSupport),
    },
  };
}

function moduleReferences(sourceText, fileName) {
  const scriptKind = fileName.endsWith(".js") || fileName.endsWith(".mjs") || fileName.endsWith(".cjs")
    ? ts.ScriptKind.JS
    : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.ES2022, false, scriptKind);
  const specifiers = [];
  for (const reference of source.referencedFiles) specifiers.push(reference.fileName);
  for (const reference of source.typeReferenceDirectives) specifiers.push(reference.fileName);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression
      && ts.isStringLiteralLike(node.moduleReference.expression)) {
      specifiers.push(node.moduleReference.expression.text);
    }
    if (ts.isImportTypeNode(node)
      && ts.isLiteralTypeNode(node.argument)
      && ts.isStringLiteralLike(node.argument.literal)) {
      specifiers.push(node.argument.literal.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0])) {
        throw new Error(`${fileName} contains a non-literal dynamic import`);
      }
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return specifiers;
}

function assertInsidePackage(packageRoot, path) {
  if (isInsidePackage(packageRoot, path)) return;
  throw new Error(`Public runtime import escaped the package: ${path}`);
}

function runtimeDependencies(packageRoot, entryPath) {
  const files = new Set();
  const external = new Set();
  const pending = [entryPath];
  while (pending.length > 0) {
    const path = pending.pop();
    if (files.has(path)) continue;
    assertInsidePackage(packageRoot, path);
    files.add(path);
    const source = readFileSync(path, "utf8");
    for (const specifier of moduleReferences(source, path)) {
      if (!specifier.startsWith(".")) {
        external.add(specifier);
        continue;
      }
      const dependency = resolve(dirname(path), specifier);
      assertInsidePackage(packageRoot, dependency);
      pending.push(dependency);
    }
  }
  return { files: sorted(files), external: sorted(external) };
}

function verifyExternalDependencies(entryName, expected, external, graphLabel) {
  const isNodeImport = (specifier) =>
    NODE_BUILTINS.has(specifier) || specifier === "node" || specifier === "@types/node";
  const nodeImports = external.filter(isNodeImport);
  const isReactImport = (specifier) =>
    specifier === "react" || specifier === "react-dom" || specifier.startsWith("react/") || specifier.startsWith("react-dom/");
  const reactImports = external.filter(isReactImport);
  if (expected.environment !== "test" && nodeImports.length > 0) {
    throw new Error(`${entryName} ${graphLabel} loads Node built-ins: ${nodeImports.join(", ")}`);
  }
  if (expected.environment !== "browser" && reactImports.length > 0) {
    throw new Error(`${entryName} ${graphLabel} loads React: ${reactImports.join(", ")}`);
  }
  const unsupportedExternal = external.filter((specifier) => {
    if (isNodeImport(specifier)) return expected.environment !== "test";
    if (isReactImport(specifier)) return expected.environment !== "browser";
    return true;
  });
  if (unsupportedExternal.length > 0) {
    throw new Error(`${entryName} ${graphLabel} loads unsupported external dependencies: ${unsupportedExternal.join(", ")}`);
  }
}

function verifyEnvironment(entryName, expected, packageRoot) {
  const runtimePath = resolve(packageRoot, expected.runtime);
  const dependencies = runtimeDependencies(packageRoot, runtimePath);
  verifyExternalDependencies(entryName, expected, dependencies.external, "runtime graph");
  return dependencies;
}

export function createPublicApiSignatureReport({ packageRoot, manifestPath }) {
  const resolvedPackageRoot = resolve(packageRoot);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const report = {};
  for (const [entryName, expected] of Object.entries(manifest)) {
    const declarationPath = resolve(resolvedPackageRoot, expected.declaration);
    report[entryName] = inspectDeclaration(resolvedPackageRoot, declarationPath).signatures;
  }
  return report;
}

export async function verifyPublicApiSurface({ packageRoot, manifestPath, signaturePath }) {
  const resolvedPackageRoot = resolve(packageRoot);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const report = {};
  const signatureReport = {};
  for (const [entryName, expected] of Object.entries(manifest)) {
    const declarationPath = resolve(resolvedPackageRoot, expected.declaration);
    const declared = inspectDeclaration(resolvedPackageRoot, declarationPath);
    assertEqual(declared.runtimeExports, expected.runtimeExports, `${entryName} declaration runtime exports differ`);
    assertEqual(declared.typeExports, expected.typeExports, `${entryName} declaration type exports differ`);
    verifyExternalDependencies(entryName, expected, declared.external, "declaration graph");
    signatureReport[entryName] = declared.signatures;

    const runtimePath = resolve(resolvedPackageRoot, expected.runtime);
    const runtime = await import(`${pathToFileURL(runtimePath).href}?surface=${encodeURIComponent(entryName)}`);
    assertEqual(Object.keys(runtime), expected.runtimeExports, `${entryName} runtime exports differ`);
    const dependencies = verifyEnvironment(entryName, expected, resolvedPackageRoot);
    report[entryName] = {
      runtimeExports: sorted(expected.runtimeExports),
      typeExports: sorted(expected.typeExports),
      environment: expected.environment,
      files: dependencies.files.map((path) => relative(resolvedPackageRoot, path)),
      external: dependencies.external,
      declarationFiles: declared.files.map((path) => relative(resolvedPackageRoot, path)),
      declarationExternal: declared.external,
    };
  }
  if (signaturePath) {
    const expectedSignatures = JSON.parse(readFileSync(signaturePath, "utf8"));
    if (JSON.stringify(signatureReport) !== JSON.stringify(expectedSignatures)) {
      throw new Error("Public API signature report differs from the reviewed snapshot");
    }
  }
  return report;
}
