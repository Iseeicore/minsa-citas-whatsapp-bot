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
    console.log(`Ya hay ${existentes} incidencias de prueba en ${base}. Usa --reiniciar para volver a sembrar (los usuarios de ejemplo se conservan).`);
    process.exit(0);
  }

  if (reiniciar) {
    sql(
      "-c",
      "TRUNCATE chatbot.archivo_recibido, chatbot.solicitud_carga, chatbot.evidencia, chatbot.incidencia_paciente_auditoria, ia.entrenamiento_categoria, chatbot.incidencia_analisis, chatbot.incidencia_paciente, chatbot.contador_codigo_incidencia, chatbot.mensaje, chatbot.usuario, chatbot.sesion_conversacion",
    );
    console.log(`Incidencias de ${base} borradas.`);
  }

  // Los usuarios de ejemplo no llevan clave en ningún archivo. Si se quiere poder iniciar sesión con ellos, se pasa una huella
  // Argon2id ya calculada (nunca la clave) en SEED_DEV_PASSWORD_HASH; si no, la base les pone una huella al azar que nadie conoce.
  const huella = process.env.SEED_DEV_PASSWORD_HASH;
  if (huella !== undefined && !huella.startsWith("$argon2id$")) {
    console.error("SEED_DEV_PASSWORD_HASH debe ser una huella Argon2id en formato PHC (empieza con $argon2id$), no la clave.");
    process.exit(2);
  }
  const variables = huella ? ["-v", `hash_clave=${huella}`] : [];

  const archivo = join(import.meta.dirname, "..", "prisma", "seeds", "dev", "incidencias_sinteticas.sql");
  console.log(sql(...variables, "-f", archivo).trim());
} catch (error) {
  console.error(String(error.stderr || error.message).split("\n").filter((linea) => linea.trim() !== "").slice(0, 6).join("\n"));
  process.exit(1);
}
