// Siembra incidencias SINTETICAS (prisma/seeds/dev/incidencias_sinteticas.sql) en una base de desarrollo para poder probar
// las pantallas de gestion con datos que respetan las reglas reales de la base. Necesita `psql` (o PSQL_PATH).
//
// Seguridad: se NIEGA a correr si el nombre de la base no termina en _desechable, _dev o _local, para que nunca toque
// una base real. No es una migracion y nunca debe aplicarse en el entorno de OGTI.
//
//   DATABASE_URL=postgresql://usuario:clave@host:5432/gestion_desechable npm run db:seed:dev
//   ... npm run db:seed:dev -- --reiniciar   (borra TODAS las incidencias de esa base y vuelve a sembrar)
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (por ejemplo postgresql://postgres:clave@127.0.0.1:5432/gestion_desechable).");
  process.exit(2);
}

const parsed = new URL(url);
const base = decodeURIComponent(parsed.pathname.slice(1));
if (!/_(desechable|dev|local)$/.test(base)) {
  console.error(`Me niego a sembrar en "${base}": el nombre de la base debe terminar en _desechable, _dev o _local.`);
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

function sql(...argumentos) {
  return execFileSync(psql, ["-X", "-q", "-v", "ON_ERROR_STOP=1", ...argumentos], {
    env: entorno,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

try {
  const reiniciar = process.argv.includes("--reiniciar");
  const existentes = Number(
    sql("-tA", "-c", "SELECT count(*) FROM chatbot.incidencia_paciente WHERE trace_id LIKE 'seed-dev-%'").trim(),
  );

  if (existentes > 0 && !reiniciar) {
    console.log(`Ya hay ${existentes} incidencias de prueba en ${base}. Usa --reiniciar para volver a sembrar.`);
    process.exit(0);
  }

  if (reiniciar) {
    sql(
      "-c",
      "TRUNCATE chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria, ia.entrenamiento_categoria, chatbot.incidencia_paciente, chatbot.contador_codigo_incidencia, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion",
    );
    console.log(`Incidencias de ${base} borradas.`);
  }

  const archivo = join(import.meta.dirname, "..", "prisma", "seeds", "dev", "incidencias_sinteticas.sql");
  console.log(sql("-f", archivo).trim());
} catch (error) {
  console.error(String(error.stderr || error.message).split("\n").filter((linea) => linea.trim() !== "").slice(0, 6).join("\n"));
  process.exit(1);
}
