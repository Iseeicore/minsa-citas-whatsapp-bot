import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CARPETAS_SQL = ["sql/functions", "sql/triggers"];
const ARCHIVO_COMENTARIOS = "sql/comentarios.sql";
const CARPETA_SEMILLAS = "seeds/catalogos";
const CLAVE_CANDADO = 7421001;
const ESPERA_BLOQUEO = "5s";
const DURACION_MAXIMA = "120s";

const archivosSql = (raiz, carpeta) =>
  readdirSync(join(raiz, carpeta))
    .filter((nombre) => nombre.endsWith(".sql"))
    .sort()
    .map((nombre) => join(raiz, carpeta, nombre));

export function archivosEnOrden(raiz) {
  return [
    ...CARPETAS_SQL.flatMap((carpeta) => archivosSql(raiz, carpeta)),
    join(raiz, ARCHIVO_COMENTARIOS),
    ...archivosSql(raiz, CARPETA_SEMILLAS),
  ];
}

export function armarScript(raiz) {
  const cuerpo = archivosEnOrden(raiz).map((archivo) => readFileSync(archivo, "utf8").replace(/\r\n/g, "\n").trim());
  return (
    [
      "BEGIN;",
      `SET LOCAL lock_timeout = '${ESPERA_BLOQUEO}';`,
      `SET LOCAL statement_timeout = '${DURACION_MAXIMA}';`,
      `SELECT pg_advisory_xact_lock(${CLAVE_CANDADO});`,
      ...cuerpo,
      "COMMIT;",
    ].join("\n\n") + "\n"
  );
}

export function aplicar({ raiz, cli, schema }) {
  execFileSync(process.execPath, [cli, "db", "execute", "--schema", schema, "--stdin"], {
    input: armarScript(raiz),
    stdio: ["pipe", "inherit", "inherit"],
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const raiz = process.env.PRISMA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "prisma");
  const cli = process.env.PRISMA_CLI ?? join(raiz, "..", "node_modules", "prisma", "build", "index.js");
  const schema = process.env.PRISMA_SCHEMA ?? join(raiz, "schema.prisma");
  try {
    aplicar({ raiz, cli, schema });
  } catch {
    console.error("No se pudieron aplicar las funciones, los disparadores, los comentarios y las semillas; no se cambió nada.");
    process.exit(1);
  }
  console.log(`Funciones, disparadores, comentarios y semillas aplicados (${archivosEnOrden(raiz).length} archivos).`);
}
