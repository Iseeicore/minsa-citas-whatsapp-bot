import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const FSM_FOLDER = "lib/fsm";
const CONSTANT_FOLDERS = ["lib/constants/textos", "lib/constants/prompts"];
const LEAF_IMPORT_PREFIXES = ["@/lib/enums/", "@/lib/constants/"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const MIN_SENTENCE_LENGTH = 10;
const SNIPPET_LENGTH = 60;
const SEND_HELPERS = [
  "sendText",
  "sendButtons",
  "sendList",
  "sendCtaUrl",
  "sendMinsaDigitalCta",
  "offerList",
  "offerPagedList",
  "withLeadingText",
  "withRejectionNotice",
  "reshowOffered",
];
const TEXT_PROPERTIES = ["text", "title", "description", "buttonText"];
const TEXT_DECLARATION_SUFFIXES = ["_TEXT", "_BUTTONS", "_PROMPT"];

const ALLOWED_INSIDE_FSM: ReadonlyArray<{ file: string; snippet: string; reason: string }> = [
  {
    file: "lib/fsm/parsing/ai/main-menu-intent.ts",
    snippet: "request failed ()",
    reason: "motivo que va al log ai.fallback, no al ciudadano",
  },
  {
    file: "lib/fsm/parsing/ai/main-menu-intent.ts",
    snippet: "HTTP  from model ",
    reason: "motivo que va al log ai.fallback, no al ciudadano",
  },
  {
    file: "lib/fsm/parsing/ai/main-menu-intent.ts",
    snippet: "no text in the response",
    reason: "motivo que va al log ai.fallback, no al ciudadano",
  },
  {
    file: "lib/fsm/parsing/ai/main-menu-intent.ts",
    snippet: "response was not valid JSON",
    reason: "motivo que va al log ai.fallback, no al ciudadano",
  },
  {
    file: "lib/fsm/parsing/ai/main-menu-intent.ts",
    snippet: "response was not valid JSON",
    reason: "motivo que va al log ai.fallback, no al ciudadano",
  },
  {
    file: "lib/fsm/session/turn-lock-db.ts",
    snippet: "WITH cfg AS (SELECT set_config('lock_timeout', $2, true)) SE",
    reason: "sentencia SQL del candado de turno",
  },
  {
    file: "lib/fsm/session/turn-lock.ts",
    snippet: "[turn-lock] turn waited  ms behind an earlier turn of ...",
    reason: "línea de diagnóstico del candado de turno, no llega al ciudadano",
  },
];

type TextNode = ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression;

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

function isTextNode(node: ts.Node): node is TextNode {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node);
}

function staticText(node: TextNode): string {
  if (!ts.isTemplateExpression(node)) return node.text;
  return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join("");
}

function looksLikeSentence(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= MIN_SENTENCE_LENGTH && /\s/.test(trimmed) && /\p{Ll}/u.test(trimmed);
}

function isInsideFunction(node: ts.Node): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionLike(parent)) return true;
  }
  return false;
}

function isErrorMessage(node: ts.Node, source: ts.SourceFile): boolean {
  const parent = node.parent;
  if (ts.isNewExpression(parent)) return parent.expression.getText(source).endsWith("Error");
  return ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.SuperKeyword;
}

function isCode(node: ts.Node): boolean {
  const parent = node.parent;
  return !ts.isImportDeclaration(parent) && !ts.isExportDeclaration(parent) && !ts.isLiteralTypeNode(parent);
}

function textNodes(source: ts.SourceFile): TextNode[] {
  const found: TextNode[] = [];
  const visit = (node: ts.Node): void => {
    if (isTextNode(node) && isCode(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function sentencesInsideFunctions(file: string): string[] {
  const source = parse(file);
  return textNodes(source)
    .filter((node) => isInsideFunction(node) && !isErrorMessage(node, source) && looksLikeSentence(staticText(node)))
    .map((node) => `${file}: ${staticText(node).slice(0, SNIPPET_LENGTH)}`);
}

function isHandedToTheCitizen(node: ts.Node, source: ts.SourceFile): boolean {
  const parent = node.parent;
  if (ts.isCallExpression(parent)) return SEND_HELPERS.includes(parent.expression.getText(source));
  return ts.isPropertyAssignment(parent) && parent.initializer === node && TEXT_PROPERTIES.includes(parent.name.getText(source));
}

function literalsHandedToTheCitizen(file: string): string[] {
  const source = parse(file);
  return textNodes(source)
    .filter((node) => isHandedToTheCitizen(node, source) && /\p{L}/u.test(staticText(node)))
    .map((node) => `${file}: ${staticText(node).slice(0, SNIPPET_LENGTH)}`);
}

function textDeclarations(file: string): string[] {
  const source = parse(file);
  return source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations.map((declaration) => declaration.name.getText(source)))
    .filter((name) => TEXT_DECLARATION_SUFFIXES.some((suffix) => name.endsWith(suffix)))
    .map((name) => `${file}: ${name}`);
}

function valueImports(file: string): string[] {
  return parse(file)
    .statements.filter(ts.isImportDeclaration)
    .filter((declaration) => !declaration.importClause?.isTypeOnly)
    .map((declaration) => (declaration.moduleSpecifier as ts.StringLiteral).text);
}

describe("ubicación de los textos al ciudadano y de los prompts", () => {
  it("ninguna función de lib/fsm escribe una frase, salvo las permitidas", () => {
    const allowed = ALLOWED_INSIDE_FSM.map((entry) => `${entry.file}: ${entry.snippet}`);

    expect(sourceFiles(FSM_FOLDER).flatMap(sentencesInsideFunctions)).toEqual(allowed);
  });

  it("cada excepción explica por qué se quedó", () => {
    for (const entry of ALLOWED_INSIDE_FSM) expect(entry.reason.trim()).not.toBe("");
  });

  it("ningún envío ni título de lib/fsm recibe un texto escrito a mano", () => {
    expect(sourceFiles(FSM_FOLDER).flatMap(literalsHandedToTheCitizen)).toEqual([]);
  });

  it("ningún módulo de lib/fsm declara textos, botones ni prompts", () => {
    expect(sourceFiles(FSM_FOLDER).flatMap(textDeclarations)).toEqual([]);
  });

  it("las carpetas de textos y de prompts no tienen archivo índice", () => {
    for (const folder of CONSTANT_FOLDERS) {
      const files = sourceFiles(folder);

      expect(files.length).toBeGreaterThan(0);
      expect(files.filter((file) => path.posix.basename(file).startsWith("index."))).toEqual([]);
    }
  });

  it("los textos y los prompts solo importan enums y otras constantes", () => {
    const outside = CONSTANT_FOLDERS.flatMap(sourceFiles)
      .flatMap((file) => valueImports(file).map((specifier) => `${file}: ${specifier}`))
      .filter((entry) => !LEAF_IMPORT_PREFIXES.some((prefix) => entry.includes(`: ${prefix}`)));

    expect(outside).toEqual([]);
  });
});
