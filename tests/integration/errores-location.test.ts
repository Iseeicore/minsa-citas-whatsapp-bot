import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_FOLDERS = ["lib", "app"];
const ERRORS_FOLDER = "lib/errors";
const ERRORS_TEST_FOLDER = "tests/lib/errors";
const LEAF_IMPORT_PREFIXES = ["@/lib/enums/"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const GENERIC_ERROR = "Error";

const ALLOWED_GENERIC_ERRORS: ReadonlyArray<{ file: string; reason: string }> = [];

function toPosix(file: string): string {
  return file.split(path.sep).join("/");
}

function sourceFiles(folder: string): string[] {
  return fs
    .readdirSync(path.join(ROOT, folder), { recursive: true, encoding: "utf8" })
    .filter((file) => SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension)))
    .map((file) => toPosix(path.join(folder, file)))
    .sort();
}

function parse(file: string): ts.SourceFile {
  const content = fs.readFileSync(path.join(ROOT, file), "utf8");
  return ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
}

function nodesOf(source: ts.SourceFile): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function buildsGenericError(node: ts.Node, source: ts.SourceFile): boolean {
  if (!ts.isNewExpression(node) && !ts.isCallExpression(node)) return false;
  return node.expression.getText(source) === GENERIC_ERROR;
}

function genericErrors(file: string): string[] {
  const source = parse(file);
  return nodesOf(source)
    .filter((node) => buildsGenericError(node, source))
    .map(() => file);
}

function extendsError(node: ts.ClassDeclaration, source: ts.SourceFile): boolean {
  return (node.heritageClauses ?? [])
    .filter((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
    .some((clause) => clause.types.some((type) => type.expression.getText(source).endsWith(GENERIC_ERROR)));
}

function errorClasses(file: string): string[] {
  const source = parse(file);
  return nodesOf(source)
    .filter(ts.isClassDeclaration)
    .filter((node) => extendsError(node, source))
    .map((node) => node.name?.getText(source) ?? "");
}

function kebabCase(className: string): string {
  return className.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function assignedName(file: string): string[] {
  const source = parse(file);
  return nodesOf(source)
    .filter(ts.isBinaryExpression)
    .filter((node) => node.left.getText(source) === "this.name" && ts.isStringLiteral(node.right))
    .map((node) => (node.right as ts.StringLiteral).text);
}

function valueImports(file: string): string[] {
  return parse(file)
    .statements.filter(ts.isImportDeclaration)
    .filter((declaration) => !declaration.importClause?.isTypeOnly)
    .map((declaration) => (declaration.moduleSpecifier as ts.StringLiteral).text);
}

describe("ubicación de las clases de error", () => {
  it("ningún módulo de lib ni de app construye un Error genérico, salvo los permitidos", () => {
    const outside = SOURCE_FOLDERS.flatMap(sourceFiles)
      .filter((file) => !file.startsWith(`${ERRORS_FOLDER}/`))
      .flatMap(genericErrors);

    expect(outside).toEqual(ALLOWED_GENERIC_ERRORS.map((entry) => entry.file));
  });

  it("cada excepción explica por qué se quedó", () => {
    for (const entry of ALLOWED_GENERIC_ERRORS) expect(entry.reason.trim()).not.toBe("");
  });

  it("toda clase de error de lib y de app vive en lib/errors", () => {
    const outside = SOURCE_FOLDERS.flatMap(sourceFiles)
      .filter((file) => !file.startsWith(`${ERRORS_FOLDER}/`))
      .flatMap((file) => errorClasses(file).map((name) => `${file}: ${name}`));

    expect(outside).toEqual([]);
  });

  it("cada archivo de lib/errors declara una sola clase, con el nombre del archivo, y la usa como nombre del error", () => {
    const files = sourceFiles(ERRORS_FOLDER);

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const classes = errorClasses(file);

      expect(classes).toHaveLength(1);
      expect(`${ERRORS_FOLDER}/${kebabCase(classes[0])}.ts`).toBe(file);
      expect(assignedName(file)).toEqual(classes);
    }
  });

  it("la carpeta de errores no tiene archivo índice", () => {
    expect(sourceFiles(ERRORS_FOLDER).filter((file) => path.posix.basename(file).startsWith("index."))).toEqual([]);
  });

  it("las clases de error solo importan enums", () => {
    const outside = sourceFiles(ERRORS_FOLDER)
      .flatMap((file) => valueImports(file).map((specifier) => `${file}: ${specifier}`))
      .filter((entry) => !LEAF_IMPORT_PREFIXES.some((prefix) => entry.includes(`: ${prefix}`)));

    expect(outside).toEqual([]);
  });

  it("cada clase de error tiene su test en la ruta espejo", () => {
    const expected = sourceFiles(ERRORS_FOLDER).map((file) =>
      file.replace(`${ERRORS_FOLDER}/`, `${ERRORS_TEST_FOLDER}/`).replace(/\.ts$/, ".test.ts"),
    );

    expect(sourceFiles(ERRORS_TEST_FOLDER)).toEqual(expected);
  });
});
