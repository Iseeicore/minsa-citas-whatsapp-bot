import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_DIRS = ["lib", "app"];
const SOURCE_FILES = ["instrumentation.ts", "next.config.ts"];
const FORBIDDEN = [/\bdminsadigital\b/i, /https?:\/\/[a-z0-9.-]*minsa\.gob\.pe/i];

function sourceFiles(): string[] {
  const inDirs = SOURCE_DIRS.flatMap((dir) =>
    fs.readdirSync(path.join(ROOT, dir), { recursive: true, encoding: "utf8" }).map((file) => path.join(dir, file)),
  );
  return [...inDirs, ...SOURCE_FILES]
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file));
}

describe("la lógica no lleva URLs de MINSA escritas a mano", () => {
  it("lib/ y app/ no contienen el dominio de MINSA Digital ni URLs de minsa.gob.pe", () => {
    const offenders = sourceFiles().filter((file) => {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      return FORBIDDEN.some((pattern) => pattern.test(text));
    });

    expect(offenders).toEqual([]);
  });
});
