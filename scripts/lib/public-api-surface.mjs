import { builtinModules } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { findBreakingChangeEvidence } from "./compatibility-release-intent.mjs";
import { compareSemver, parseSemver } from "./release-integrity.mjs";

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

function simplePeerRange(range) {
  const bounds = { lower: undefined, upper: undefined };
  for (const token of String(range).trim().split(/\s+/)) {
    const match = /^(>=|>|<=|<)(\d+(?:\.\d+){0,2})$/.exec(token);
    if (!match) return undefined;
    const version = `${match[2]}.0.0`.split(".").slice(0, 3).join(".");
    if (match[1].startsWith(">")) bounds.lower = { version, inclusive: match[1] === ">=" };
    else bounds.upper = { version, inclusive: match[1] === "<=" };
  }
  return bounds.lower || bounds.upper ? bounds : undefined;
}

function peerRangeIncludes(candidateRange, baselineRange) {
  if (candidateRange === baselineRange) return true;
  const candidate = simplePeerRange(candidateRange);
  const baseline = simplePeerRange(baselineRange);
  if (!candidate || !baseline) return false;
  if (baseline.lower) {
    if (candidate.lower) {
      const comparison = compareSemver(candidate.lower.version, baseline.lower.version);
      if (comparison > 0 || (comparison === 0 && baseline.lower.inclusive && !candidate.lower.inclusive)) return false;
    }
  } else if (candidate.lower) return false;
  if (baseline.upper) {
    if (candidate.upper) {
      const comparison = compareSemver(candidate.upper.version, baseline.upper.version);
      if (comparison < 0 || (comparison === 0 && baseline.upper.inclusive && !candidate.upper.inclusive)) return false;
    }
  } else if (candidate.upper) return false;
  return true;
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

export function assertPatchCompatibility({
  baselineVersion,
  candidateVersion,
  baselineManifest,
  candidateManifest,
  baselineSignatures,
  candidateSignatures,
  releaseIntent,
}) {
  const baselineSemver = parseSemver(baselineVersion);
  const candidateSemver = parseSemver(candidateVersion);
  const versionComparison = compareSemver(candidateVersion, baselineVersion);
  if (versionComparison < 0) {
    throw new Error(`Patch candidate ${candidateVersion} must be newer than npm latest ${baselineVersion}`);
  }
  const breakingChanges = [];
  for (const entry of Object.keys(baselineManifest.exports ?? {})) {
    if (!Object.hasOwn(candidateManifest.exports ?? {}, entry)) {
      breakingChanges.push(`removed package export ${entry}`);
    }
  }
  const baselineNodeEngine = baselineManifest.engines?.node;
  const candidateNodeEngine = candidateManifest.engines?.node;
  if (baselineNodeEngine && candidateNodeEngine
    && !peerRangeIncludes(candidateNodeEngine, baselineNodeEngine)) {
    breakingChanges.push(`narrowed Node engine from ${baselineNodeEngine} to ${candidateNodeEngine}`);
  }
  for (const [peer, baselineRange] of Object.entries(baselineManifest.peerDependencies ?? {})) {
    const candidateRange = candidateManifest.peerDependencies?.[peer];
    if (!peerRangeIncludes(candidateRange, baselineRange)) {
      breakingChanges.push(`changed peer dependency ${peer} from ${baselineRange} to ${candidateRange ?? "removed"}`);
    }
    const baselineMeta = baselineManifest.peerDependenciesMeta?.[peer] ?? {};
    const candidateMeta = candidateManifest.peerDependenciesMeta?.[peer] ?? {};
    if (JSON.stringify(candidateMeta) !== JSON.stringify(baselineMeta)) {
      breakingChanges.push(`changed peer dependency metadata for ${peer}`);
    }
  }
  for (const peer of Object.keys(candidateManifest.peerDependencies ?? {})) {
    if (Object.hasOwn(baselineManifest.peerDependencies ?? {}, peer)) continue;
    if (candidateManifest.peerDependenciesMeta?.[peer]?.optional !== true) {
      breakingChanges.push(`added new required peer dependency ${peer}`);
    }
  }
  for (const [entryName, baselineEntry] of Object.entries(baselineSignatures ?? {})) {
    const candidateEntry = candidateSignatures?.[entryName];
    if (!candidateEntry) {
      breakingChanges.push(`removed public entry ${entryName}`);
      continue;
    }
    for (const [exportName, baselineSignature] of Object.entries(baselineEntry.exports ?? {})) {
      if (exportName.startsWith("experimental_")) continue;
      const candidateSignature = candidateEntry.exports?.[exportName];
      if (!candidateSignature) {
        breakingChanges.push(`removed public signature ${entryName}.${exportName}`);
        continue;
      }
      if (JSON.stringify(candidateSignature) !== JSON.stringify(baselineSignature)) {
        breakingChanges.push(`changed public signature ${entryName}.${exportName}`);
      }
    }
    const candidateSupport = new Set(candidateEntry.support ?? []);
    for (const declaration of baselineEntry.support ?? []) {
      if (!candidateSupport.has(declaration)) {
        breakingChanges.push(`changed public signature support for ${entryName}`);
        break;
      }
    }
  }

  const sameMajor = baselineSemver.core[0] === candidateSemver.core[0];
  const sameMinor = sameMajor && baselineSemver.core[1] === candidateSemver.core[1];
  const preOneMinor = baselineSemver.core[0] === "0"
    && candidateSemver.core[0] === "0"
    && baselineSemver.core[1] !== candidateSemver.core[1];
  const pendingPreOneMinor = versionComparison === 0
    && baselineSemver.core[0] === "0"
    && releaseIntent?.releaseType === "minor";

  if (breakingChanges.length > 0) {
    if (preOneMinor || pendingPreOneMinor) {
      const evidence = findBreakingChangeEvidence(releaseIntent);
      if (!evidence) {
        throw new Error(
          "Breaking public API changes in a pre-1.0 minor require release evidence: "
          + "the Breaking changes section must contain a concrete fenced before example, "
          + "and the Adoption section must contain a concrete fenced after example. "
          + `Detected: ${breakingChanges.join("; ")}`,
        );
      }
      return {
        baseline: baselineVersion,
        candidate: candidateVersion,
        status: "documented-breaking-minor",
        evidence,
      };
    }
    if (sameMajor) {
      throw new Error(`Patch candidate ${breakingChanges.join("; ")}`);
    }
    return {
      baseline: baselineVersion,
      candidate: candidateVersion,
      status: "breaking-major",
    };
  }
  return {
    baseline: baselineVersion,
    candidate: candidateVersion,
    status: versionComparison === 0
      ? "current-version"
      : sameMinor
        ? "compatible-patch"
        : preOneMinor
          ? "compatible-minor"
          : "compatible-major",
  };
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
