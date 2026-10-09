import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (por ejemplo postgresql://postgres:clave@127.0.0.1:5432/gestion_desechable).");
  process.exit(2);
}

const parsed = new URL(url);
const base = decodeURIComponent(parsed.pathname.slice(1));
// Misma guardia que db:seed:dev. Para cargar el padron en una base real (OGTI) hay que repetir su nombre exacto a mano:
//   npm run db:seed:eess -- --base-real=<nombre de la base>
const baseReal = process.argv.find((argumento) => argumento.startsWith("--base-real="))?.slice("--base-real=".length);
if (!/_(desechable|dev|local)$/.test(base) && baseReal !== base) {
  console.error(
    `Me niego a sembrar en "${base}": el nombre de la base debe terminar en _desechable, _dev o _local, o repetirse con --base-real=${base}.`,
  );
  process.exit(2);
}

const psql = process.env.PSQL_PATH || "psql";
const entorno = {
  ...process.env,
  PGHOST: parsed.hostname,
  PGPORT: parsed.port || "5432",
  PGUSER: decodeURIComponent(parsed.username),
  PGPASSWORD: decodeURIComponent(parsed.password),
  PGDATABASE: base,
  PGCLIENTENCODING: "UTF8",
};

const carpeta = join(import.meta.dirname, "..", "prisma", "seeds", "eess");
const filas = JSON.parse(readFileSync(join(carpeta, "establecimientos.json"), "utf8"));
if (!Array.isArray(filas) || filas.length === 0) {
  console.error("prisma/seeds/eess/establecimientos.json debe ser una lista con al menos un establecimiento.");
  process.exit(2);
}

const literal = (texto) => `'${texto.replaceAll("'", "''")}'`;
const cargador = join(carpeta, "cargar_establecimientos.sql").replaceAll("\\", "/");

// Todo en una sola transaccion: si algo falla, la base queda como estaba. El JSON viaja como un literal que la base
// convierte en filas (no hay limite de argumentos ni se arma una sentencia por fila).
const guion = `\\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE eess_antes AS
  SELECT (SELECT count(*) FROM catalogo.area) AS areas,
         (SELECT count(*) FROM catalogo.establecimiento_salud) AS establecimientos,
         (SELECT coalesce(sum(version_fila), 0) FROM catalogo.establecimiento_salud) AS versiones;
CREATE TEMP TABLE eess_fuente (codigo_renipress text, nombre text, nivel text, categoria text, diris text, departamento text, provincia text, distrito text);
INSERT INTO eess_fuente
SELECT t.codigo_renipress, t.nombre, t.nivel, t.categoria, t.diris, t.departamento, t.provincia, t.distrito
  FROM jsonb_to_recordset(${literal(JSON.stringify(filas))}::jsonb)
    AS t(codigo_renipress text, nombre text, nivel text, categoria text, diris text, departamento text, provincia text, distrito text);
\\i ${literal(cargador)}
\\pset tuples_only on
\\pset format unaligned
SELECT 'Establecimientos: ' || e.n || ' (nuevos: ' || (e.n - a.establecimientos) || ', actualizados: ' || ((e.v - a.versiones) - (e.n - a.establecimientos)) || ')'
       || E'\\nAreas: ' || ar.n || ' (nuevas: ' || (ar.n - a.areas) || ')'
  FROM eess_antes a,
       (SELECT count(*) AS n, coalesce(sum(version_fila), 0) AS v FROM catalogo.establecimiento_salud) e,
       (SELECT count(*) AS n FROM catalogo.area) ar;
COMMIT;
`;

try {
  const salida = execFileSync(psql, ["-X", "-q", "-v", "ON_ERROR_STOP=1"], {
    env: entorno,
    encoding: "utf8",
    input: guion,
    stdio: ["pipe", "pipe", "pipe"],
  });
  console.log(`Padron de establecimientos cargado en ${base} (${filas.length} filas en el archivo):`);
  console.log(salida.trim());
} catch (error) {
  console.error(String(error.stderr || error.message).split("\n").filter((linea) => linea.trim() !== "").slice(0, 6).join("\n"));
  process.exit(1);
}
