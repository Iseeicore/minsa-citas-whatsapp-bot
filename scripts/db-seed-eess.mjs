import { execFileSync } from "node:child_process";
import { join } from "node:path";

const NOMBRE_DE_BASE_DESECHABLE = /_(desechable|dev|local)$/;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (por ejemplo postgresql://postgres:clave@127.0.0.1:5432/gestion_desechable).");
  process.exit(2);
}

const parsed = new URL(url);
const base = decodeURIComponent(parsed.pathname.slice(1));
const baseReal = process.argv.find((argumento) => argumento.startsWith("--base-real="))?.slice("--base-real=".length);
if (!NOMBRE_DE_BASE_DESECHABLE.test(base) && baseReal !== base) {
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

const archivo = join(import.meta.dirname, "..", "prisma", "seeds", "eess", "establecimientos.sql");

try {
  const salida = execFileSync(psql, ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-f", archivo], {
    env: entorno,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log(`Padron de establecimientos cargado en ${base}:`);
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
