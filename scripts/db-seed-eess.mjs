import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { join, resolve } from "node:path";

const NOMBRE_DE_BASE_DESECHABLE = /_(desechable|dev|local)$/;
const MARCA_BOM_UTF8 = Buffer.from([0xef, 0xbb, 0xbf]);
const COLUMNAS_PADRON =
  "codigo_renipress text, nombre text, nivel text, categoria text, autoridad_sanitaria text, departamento text, provincia text, distrito text, estado text";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (por ejemplo postgresql://postgres:clave@127.0.0.1:5432/gestion_desechable).");
  process.exit(2);
}

const opcion = (nombre) => process.argv.find((argumento) => argumento.startsWith(`--${nombre}=`))?.slice(`--${nombre}=`.length);

const parsed = new URL(url);
const base = decodeURIComponent(parsed.pathname.slice(1));
const baseReal = opcion("base-real");
if (!NOMBRE_DE_BASE_DESECHABLE.test(base) && baseReal !== base) {
  console.error(
    `Me niego a sembrar en "${base}": el nombre de la base debe terminar en _desechable, _dev o _local, o repetirse con --base-real=${base}.`,
  );
  process.exit(2);
}

function empiezaConBom(ruta) {
  const descriptor = openSync(ruta, "r");
  const inicio = Buffer.alloc(MARCA_BOM_UTF8.length);
  readSync(descriptor, inicio, 0, inicio.length, 0);
  closeSync(descriptor);
  return inicio.equals(MARCA_BOM_UTF8);
}

function argumentosDelPadron(ruta) {
  const absoluta = resolve(ruta);
  if (!existsSync(absoluta)) {
    console.error(`No existe el archivo del padrón: ${absoluta}`);
    process.exit(2);
  }
  if (empiezaConBom(absoluta)) {
    console.error(`El archivo ${absoluta} empieza con la marca BOM: guárdelo como CSV UTF-8 sin BOM.`);
    process.exit(2);
  }
  const rutaParaPsql = absoluta.replaceAll("\\", "/").replaceAll("'", "''");
  return [
    "-c",
    "SET client_min_messages = warning",
    "-c",
    `CREATE TEMP TABLE eess_fuente (${COLUMNAS_PADRON})`,
    "-c",
    `\\copy eess_fuente FROM '${rutaParaPsql}' WITH (FORMAT csv, HEADER match, ENCODING 'UTF8')`,
    "-c",
    "CREATE TEMP TABLE eess_modo (padron_completo boolean NOT NULL)",
    "-c",
    "INSERT INTO eess_modo VALUES (true)",
  ];
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

const archivoCsv = opcion("archivo");
const padron = archivoCsv ? argumentosDelPadron(archivoCsv) : [];
const archivo = join(import.meta.dirname, "..", "prisma", "seeds", "eess", "establecimientos.sql");

try {
  const salida = execFileSync(psql, ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", ...padron, "-f", archivo], {
    env: entorno,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log(`Padron de establecimientos cargado en ${base}${archivoCsv ? ` desde ${resolve(archivoCsv)} (padrón completo)` : ""}:`);
  console.log(salida.trim());
} catch (error) {
  console.error(
    String(error.stderr || error.message)
      .split("\n")
      .filter((linea) => linea.trim() !== "")
      .slice(0, 6)
      .join("\n"),
  );
  process.exit(1);
}
