import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const LIB_FOLDER = "lib";
const REGEX_FOLDER = "lib/constants/regex";
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const STANDALONE_REGEX_FILES = ["lib/constants/regex/chat-format.ts", "lib/constants/regex/text.ts"];

const ALLOWED_OUTSIDE_REGEX_FOLDER: ReadonlyArray<{ file: string; constant: string; reason: string }> = [
  {
    file: "lib/fsm/parsing/date/date-parser.ts",
    constant: "DAY_AND_MONTH_NAME",
    reason: "se arma con las claves de MONTHS, que el mismo módulo usa para calcular el mes; moverla crearía un ciclo",
  },
  {
    file: "lib/fsm/parsing/date/date-parser.ts",
    constant: "WEEKDAY_NAME",
    reason: "se arma con las claves de WEEKDAYS, que el mismo módulo usa para calcular el día; moverla crearía un ciclo",
  },
];

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

function buildsRegex(node: ts.Node, source: ts.SourceFile): boolean {
  if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) return true;
  if (ts.isNewExpression(node) || ts.isCallExpression(node)) return node.expression.getText(source) === "RegExp";
  return false;
}

function ownerName(statement: ts.Statement, source: ts.SourceFile): string {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.map((declaration) => declaration.name.getText(source)).join(",");
  }
  if (ts.isFunctionDeclaration(statement) && statement.name) return statement.name.getText(source);
  return ts.SyntaxKind[statement.kind];
}

function regexOwners(file: string): string[] {
  const source = parse(file);
  const owners: string[] = [];

  for (const statement of source.statements) {
    const visit = (node: ts.Node): void => {
      if (buildsRegex(node, source)) owners.push(`${file}: ${ownerName(statement, source)}`);
      ts.forEachChild(node, visit);
    };
    visit(statement);
  }

  return owners;
}

function valueImports(file: string): string[] {
  return parse(file)
    .statements.filter(ts.isImportDeclaration)
    .filter((declaration) => !declaration.importClause?.isTypeOnly)
    .map((declaration) => declaration.moduleSpecifier.getText());
}

describe("ubicación de las expresiones regulares", () => {
  it("toda expresión regular de lib vive en lib/constants/regex, salvo las permitidas por nombre", () => {
    const outside = sourceFiles(LIB_FOLDER)
      .filter((file) => !file.startsWith(`${REGEX_FOLDER}/`))
      .flatMap(regexOwners);
    const allowed = ALLOWED_OUTSIDE_REGEX_FOLDER.map((entry) => `${entry.file}: ${entry.constant}`);

    expect(outside).toEqual(allowed);
  });

  it("cada excepción explica por qué no se pudo mover", () => {
    for (const entry of ALLOWED_OUTSIDE_REGEX_FOLDER) expect(entry.reason.trim()).not.toBe("");
  });

  it("la carpeta de expresiones regulares no tiene archivo índice", () => {
    const files = sourceFiles(REGEX_FOLDER);

    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((file) => path.posix.basename(file).startsWith("index."))).toEqual([]);
  });

  it("los patrones de la vista del chat y de texto no importan nada del resto del proyecto", () => {
    expect(STANDALONE_REGEX_FILES.flatMap(valueImports)).toEqual([]);
  });
});
