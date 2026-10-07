import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (por ejemplo postgresql://postgres:clave@127.0.0.1:5432/postgres).");
  process.exit(2);
}

const psql = process.env.PSQL_PATH || "psql";
const parsed = new URL(url);
const nombre = `chatbot_test_${randomBytes(4).toString("hex")}`;

const entorno = (base) => ({
  ...process.env,
  PGHOST: parsed.hostname,
  PGPORT: parsed.port || "5432",
  PGUSER: decodeURIComponent(parsed.username),
  PGPASSWORD: decodeURIComponent(parsed.password),
  PGDATABASE: base,
});

function sql(base, ...argumentos) {
  return execFileSync(psql, ["-X", "-q", "-v", "ON_ERROR_STOP=1", ...argumentos], {
    env: entorno(base),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const targetUrl = new URL(url);
targetUrl.pathname = `/${nombre}`;
let falló = false;

try {
  sql("postgres", "-c", `CREATE DATABASE ${nombre}`);
  console.log(`Base desechable: ${nombre}`);

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: targetUrl.href },
    stdio: ["ignore", "ignore", "inherit"],
    shell: process.platform === "win32",
  });
  console.log("Migraciones aplicadas.");

  const carpeta = join(import.meta.dirname, "..", "prisma", "tests");
  const archivos = readdirSync(carpeta).filter((n) => n.endsWith(".sql")).sort();
  for (const archivo of archivos) {
    try {
      const salida = sql(nombre, "-f", join(carpeta, archivo));
      const resumen = salida.split("\n").filter((l) => l.includes("PASARON")).join(" ");
      console.log(`  OK    ${archivo}${resumen ? ` — ${resumen}` : ""}`);
    } catch (error) {
      falló = true;
      const detalle = String(error.stderr || error.message).split("\n").filter((l) => /ERROR|PRUEBA/.test(l)).slice(0, 3).join("\n          ");
      console.error(`  FALLO ${archivo}\n          ${detalle}`);
    }
  }
} catch (error) {
  falló = true;
  console.error(String(error.stderr || error.message));
} finally {
  try {
    sql("postgres", "-c", `DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
  } catch (error) {
    console.error(`No se pudo borrar la base ${nombre}: ${error.message}`);
  }
}

process.exit(falló ? 1 : 0);
