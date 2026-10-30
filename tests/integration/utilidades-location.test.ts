import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_FOLDERS = ["lib", "app"];
const LIMITS_FOLDER = "lib/constants/limits";
const TUNED_FOLDERS = ["lib/fsm/core", "lib/fsm/flows", "lib/fsm/routing", "lib/fsm/parsing", "lib/integrations"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];

const IDIOMS: ReadonlyArray<{ name: string; pattern: RegExp; owners: string[] }> = [
  {
    name: 'typeof x === "string"',
    pattern: /typeof\s+[^\n=!]+?\s*[!=]==\s*"string"/,
    owners: ["lib/utils/type-guards.ts", "lib/utils/text-values.ts"],
  },
  {
    name: 'String(x ?? "")',
    pattern: /String\([^()\n]*\?\?\s*""\s*\)/,
    owners: ["lib/utils/text-values.ts"],
  },
  {
    name: 'typeof x === "object" && x !== null',
    pattern: /typeof\s+[\w.?[\]]+\s*===\s*"object"\s*&&\s*[\w.?[\]]+\s*!==\s*null/,
    owners: ["lib/utils/type-guards.ts"],
  },
  {
    name: "lectura a mano del botón o la fila tocada",
    pattern: /InboundEventType\.(BUTTON|LIST)\s*\?\s*[\w.]+\.listId\s*:\s*undefined/,
    owners: ["lib/fsm/core/handlers-shared.ts"],
  },
  {
    name: '(event.text ?? "").trim()',
    pattern: /\(\s*event\.text\s*\?\?\s*""\s*\)\.trim\(\)/,
    owners: ["lib/fsm/core/handlers-shared.ts"],
  },
  {
    name: 'normalize("NFD")',
    pattern: /\.normalize\("NFD"\)/,
    owners: ["lib/utils/text-values.ts", "lib/fsm/parsing/text/inicio-incidencia.ts"],
  },
];

const ALLOWED_NUMBERS_OUTSIDE_LIMITS: ReadonlyArray<{ file: string; constant: string; reason: string }> = [
  {
    file: "lib/integrations/minsa/fake-data.ts",
    constant: "SINGLE_HORARIO_DAYS_AHEAD",
    reason: "parámetro del juego de datos falso, que vive junto a esos datos",
  },
  {
    file: "lib/integrations/minsa/wire.ts",
    constant: "HTTP_SERVICE_UNAVAILABLE",
    reason: "código de estado HTTP, no un límite que se ajuste",
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

function read(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
}

function isNumericValue(node: ts.Expression): boolean {
  if (ts.isNumericLiteral(node)) return true;
  if (ts.isPrefixUnaryExpression(node)) return isNumericValue(node.operand);
  if (ts.isParenthesizedExpression(node)) return isNumericValue(node.expression);
  if (ts.isBinaryExpression(node)) return isNumericValue(node.left) && isNumericValue(node.right);
  return false;
}

function numericDeclarations(file: string): string[] {
  const source = parse(file);
  return source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .filter((declaration) => declaration.initializer !== undefined && isNumericValue(declaration.initializer))
    .map((declaration) => `${file}: ${declaration.name.getText(source)}`);
}

describe("ubicación de las utilidades y de los límites numéricos", () => {
  it.each(IDIOMS)("solo los módulos dueños escriben $name", ({ pattern, owners }) => {
    const outside = SOURCE_FOLDERS.flatMap(sourceFiles)
      .filter((file) => !owners.includes(file))
      .filter((file) => pattern.test(read(file)));

    expect(outside).toEqual([]);
  });

  it("cada módulo dueño sigue usando la forma que le pertenece", () => {
    for (const { pattern, owners } of IDIOMS) {
      for (const owner of owners) expect(pattern.test(read(owner))).toBe(true);
    }
  });

  it("los pasos, las rutas, los parsers y las integraciones no declaran números sueltos, salvo los permitidos", () => {
    const allowed = ALLOWED_NUMBERS_OUTSIDE_LIMITS.map((entry) => `${entry.file}: ${entry.constant}`);

    expect(TUNED_FOLDERS.flatMap(sourceFiles).flatMap(numericDeclarations).sort()).toEqual(allowed);
  });

  it("cada excepción explica por qué se quedó", () => {
    for (const entry of ALLOWED_NUMBERS_OUTSIDE_LIMITS) expect(entry.reason.trim()).not.toBe("");
  });

  it("la carpeta de límites no tiene archivo índice, no importa nada y solo declara números", () => {
    const files = sourceFiles(LIMITS_FOLDER);

    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((file) => path.posix.basename(file).startsWith("index."))).toEqual([]);

    for (const file of files) {
      const source = parse(file);

      expect(source.statements.filter(ts.isImportDeclaration)).toEqual([]);
      expect(source.statements.every(ts.isVariableStatement)).toBe(true);
      expect(numericDeclarations(file).length).toBe(source.statements.length);
    }
  });
});
