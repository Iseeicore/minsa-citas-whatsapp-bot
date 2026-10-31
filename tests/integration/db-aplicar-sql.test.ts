import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { archivosEnOrden, armarScript } from "@/scripts/db-aplicar-sql.mjs";

const PRISMA = path.join(process.cwd(), "prisma");
const read = (file: string) => fs.readFileSync(path.join(PRISMA, file), "utf8");
const names = (folder: string) => fs.readdirSync(path.join(PRISMA, folder)).filter((n) => n.endsWith(".sql"));
const kebab = (name: string) => name.replaceAll("_", "-");

describe("db-aplicar-sql: the order of the files", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "aplicar-sql-"));
    for (const [folder, files] of Object.entries({
      "sql/functions": ["b.sql", "a.sql", "nota.txt"],
      "sql/triggers": ["z.sql"],
      seeds: [],
      "seeds/catalogos": ["02-segundo.sql", "01-primero.sql"],
    })) {
      fs.mkdirSync(path.join(dir, folder), { recursive: true });
      for (const file of files) fs.writeFileSync(path.join(dir, folder, file), `-- ${file}\r\n`);
    }
    fs.writeFileSync(path.join(dir, "sql/comentarios.sql"), "-- comentarios\n");
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("applies the functions, then the triggers, then the comments, then the seeds, each folder in alphabetical order", () => {
    const files = archivosEnOrden(dir).map((file: string) => path.relative(dir, file).replaceAll("\\", "/"));

    expect(files).toEqual([
      "sql/functions/a.sql",
      "sql/functions/b.sql",
      "sql/triggers/z.sql",
      "sql/comentarios.sql",
      "seeds/catalogos/01-primero.sql",
      "seeds/catalogos/02-segundo.sql",
    ]);
  });

  it("wraps everything in one transaction under a lock, so a failure changes nothing and two instances never overlap", () => {
    const script = armarScript(dir);

    expect(script.startsWith("BEGIN;")).toBe(true);
    expect(script.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(script).toContain("SET LOCAL lock_timeout");
    expect(script).toContain("SET LOCAL statement_timeout");
    expect(script).toContain("pg_advisory_xact_lock");
    expect(script).not.toContain("\r");
  });
});

describe("the SQL files of prisma/", () => {
  const functions = names("sql/functions");
  const triggers = names("sql/triggers");
  const seeds = names("seeds/catalogos");

  it("are applied in a fixed, complete list", () => {
    expect(archivosEnOrden(PRISMA)).toHaveLength(functions.length + triggers.length + 1 + seeds.length);
  });

  it("carry no SQL comments: the intent goes in the names and in COMMENT ON", () => {
    for (const file of [
      ...functions.map((n) => `sql/functions/${n}`),
      ...triggers.map((n) => `sql/triggers/${n}`),
      "sql/comentarios.sql",
      ...seeds.map((n) => `seeds/catalogos/${n}`),
    ]) {
      const comments = read(file)
        .split("\n")
        .filter((line) => line.trimStart().startsWith("--"));
      expect(comments, file).toEqual([]);
    }
  });

  it("define one function per file, named after the file", () => {
    for (const file of functions) {
      const defined = [...read(`sql/functions/${file}`).matchAll(/CREATE OR REPLACE FUNCTION\s+\w+\.(\w+)\s*\(/g)].map((m) => kebab(m[1]));
      expect(defined, file).toEqual([file.replace(".sql", "")]);
    }
  });

  it("only call functions that have their own file", () => {
    for (const file of triggers) {
      const called = [...read(`sql/triggers/${file}`).matchAll(/EXECUTE FUNCTION\s+(?:\w+\.)?(\w+)\(/g)].map((m) => kebab(m[1]));
      expect(called.length, file).toBeGreaterThan(0);
      for (const name of called) expect(functions, `${file} llama a ${name}`).toContain(`${name}.sql`);
    }
  });

  it("declare every trigger statically, one CREATE OR REPLACE TRIGGER per line", () => {
    for (const file of triggers) {
      const lines = read(`sql/triggers/${file}`)
        .split("\n")
        .filter((line) => line.trim() !== "");
      expect(
        lines.filter((line) => !line.startsWith("CREATE OR REPLACE TRIGGER ")),
        file,
      ).toEqual([]);
    }
  });

  it("leave roles, owners and privileges to the DBA script, outside the migrations and db:aplicar", () => {
    const migrations = fs.readdirSync(path.join(PRISMA, "migrations")).filter((d) => /^\d{14}_/.test(d));
    for (const file of [
      ...migrations.map((d) => `migrations/${d}/migration.sql`),
      ...archivosEnOrden(PRISMA).map((file: string) => path.relative(PRISMA, file)),
    ]) {
      expect(read(file), file).not.toMatch(/\b(GRANT|REVOKE|CREATE ROLE|ALTER ROLE)\b|OWNER TO/);
    }
  });

  it("pass the business quantities to the triggers instead of writing them inside the function", () => {
    expect(read("sql/triggers/fn-limitar-usuarios-establecimiento.sql")).toContain("fn_limitar_usuarios_establecimiento(3)");
    expect(read("sql/triggers/fn-reglas-incidencia-etiqueta.sql")).toContain("fn_reglas_incidencia_etiqueta(10)");
    expect(read("sql/triggers/fn-reglas-incidencia.sql")).toContain("fn_reglas_incidencia(10)");
    expect(read("sql/functions/fn-limitar-usuarios-establecimiento.sql")).not.toMatch(/:=\s*3\b/);
    expect(read("sql/functions/fn-reglas-incidencia-etiqueta.sql")).not.toMatch(/:=\s*10\b/);
    expect(read("sql/functions/fn-reglas-incidencia.sql")).not.toMatch(/\b2000\b/);
  });

  it("keep the archiving days and the purge hours as parameters without a business default", () => {
    expect(read("sql/functions/archivar-incidencias-vencidas.sql")).not.toContain("p_dias");
    expect(read("sql/functions/archivar-incidencias-resueltas.sql")).toMatch(/\(p_dias integer, p_lote integer DEFAULT 1000\)/);
    expect(read("sql/functions/purgar-sesiones-inactivas.sql")).toMatch(/\(p_horas integer, p_lote integer DEFAULT 1000\)/);
  });

  it("sign the catalog seeds with their own actor and never insert people or hospitals", () => {
    for (const file of seeds) {
      const text = read(`seeds/catalogos/${file}`);
      expect(text, file).toContain("set_config('app.actor', 'sistema:semilla', true)");
      expect(text, file).not.toMatch(/usuario_interno|establecimiento_salud/);
    }
  });

  it("keep the migrations to structure only", () => {
    for (const dir of fs.readdirSync(path.join(PRISMA, "migrations")).filter((d) => /^\d{14}_/.test(d))) {
      const sql = read(`migrations/${dir}/migration.sql`);
      expect(sql, dir).not.toMatch(/CREATE (OR REPLACE )?TRIGGER|^INSERT INTO|^UPDATE |COMMENT ON/m);
      const functionsDefined = [...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION\s+([\w.]+)/g)].map((m) => m[1]);
      expect(
        functionsDefined.filter((f) => !["public.f_unaccent"].includes(f)),
        dir,
      ).toEqual([]);
    }
  });
});
