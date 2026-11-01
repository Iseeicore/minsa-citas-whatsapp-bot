import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CARPETA = dirname(fileURLToPath(import.meta.url));
const PSQL = process.env.PSQL_PATH || "psql";
const SEPARADOR_RELACIONES = "\n\nRelaciones:\n";

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL: una base ya migrada y con npm run db:aplicar.");
  process.exit(2);
}
const conexion = new URL(process.env.DATABASE_URL);

function psql(args, entrada) {
  return execFileSync(PSQL, ["-At", "-X", "-v", "ON_ERROR_STOP=1", ...args], {
    input: entrada,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      PGHOST: conexion.hostname,
      PGPORT: conexion.port || "5432",
      PGUSER: decodeURIComponent(conexion.username),
      PGPASSWORD: decodeURIComponent(conexion.password),
      PGDATABASE: conexion.pathname.slice(1),
    },
  }).trim();
}

const estructura = JSON.parse(psql([], readFileSync(join(CARPETA, "estructura.sql"), "utf8")));
const versionPg = psql(["-c", "select split_part(version(), ' ', 2)"]);

const errores = [];
const clave = (esquema, tabla) => `${esquema}.${tabla}`;
const escapar = (s) => String(s).replaceAll("|", "\\|").replaceAll("\n", " ");

for (const e of estructura.esquemas) {
  if (!e.descripcion) errores.push(`Falta el COMMENT ON SCHEMA de ${e.nombre}`);
}

const tablas = new Map();
for (const c of estructura.columnas) {
  const k = clave(c.esquema, c.tabla);
  if (!tablas.has(k)) {
    const [descripcion, relaciones] = (c.descripcion_tabla ?? "").split(SEPARADOR_RELACIONES);
    if (!descripcion) errores.push(`Falta el COMMENT ON TABLE de ${k}`);
    tablas.set(k, { esquema: c.esquema, nombre: c.tabla, descripcion, relaciones: relaciones ? relaciones.split("\n") : [], columnas: [], restricciones: [], indices: [], disparadores: [] });
  }
  if (!c.descripcion) errores.push(`Falta el COMMENT ON COLUMN de ${k}.${c.columna}`);
  tablas.get(k).columnas.push(c);
}
for (const r of estructura.restricciones) tablas.get(clave(r.esquema, r.tabla)).restricciones.push(r);
for (const i of estructura.indices) tablas.get(clave(i.esquema, i.tabla)).indices.push(i);
for (const d of estructura.disparadores) tablas.get(clave(d.esquema, d.tabla)).disparadores.push(d);

function textoFk(t, r) {
  const prefijo = `- ${r.columnas.join(", ")} → ${r.tabla_ref}: `;
  const linea = t.relaciones.find((l) => l.startsWith(prefijo));
  if (!linea) errores.push(`Falta la explicación de la llave foránea ${r.nombre} en el COMMENT ON TABLE de ${clave(t.esquema, t.nombre)}`);
  return linea ? linea.slice(prefijo.length) : "";
}

function descripcionDisparador(d) {
  if (!d.descripcion_funcion) {
    errores.push(`Falta el COMMENT ON FUNCTION de ${d.funcion} (disparador ${d.nombre})`);
    return "";
  }
  if (d.funcion === "fn_bloquear_operacion") {
    return d.definicion.includes("'todo'")
      ? "Tabla de solo inserción: bloquea modificar y borrar."
      : "Bloquea el borrado físico; se debe usar el borrado lógico.";
  }
  return d.descripcion_funcion;
}

function momento(def) {
  const m = def.match(/(BEFORE|AFTER) ((?:INSERT|UPDATE|DELETE)(?: OR (?:INSERT|UPDATE|DELETE))*)/);
  return m ? `${m[1] === "BEFORE" ? "Antes de" : "Después de"} ${m[2].replaceAll("INSERT", "insertar").replaceAll("UPDATE", "modificar").replaceAll("DELETE", "borrar").replaceAll(" OR ", " o ")}` : "";
}

const listaTablas = [...tablas.keys()].sort();

const md = [];
md.push("# Diccionario de datos");
md.push("");
md.push(`> **Generado automáticamente** por \`generar-diccionario.mjs\` leyendo la base real (PostgreSQL ${versionPg}). **No se edita a mano**: las descripciones son los \`COMMENT ON\` de \`prisma/sql/comentarios.sql\` y de cada función en \`prisma/sql/functions/\`; se cambian allí, se aplican con \`npm run db:aplicar\` y se vuelve a generar. El script falla si falta la descripción de un esquema, una tabla, una columna, una llave foránea o la función de un disparador.`);
md.push("> Convención: tablas y columnas en español y en singular; lo que viene de Meta en inglés. Fechas en UTC. Detalle del diseño en [[Base De Datos]].");
md.push("");
md.push("## Esquemas");
md.push("");
md.push("| Esquema | Para qué sirve |");
md.push("|---|---|");
for (const e of estructura.esquemas) md.push(`| \`${e.nombre}\` | ${escapar(e.descripcion ?? "")} |`);
md.push("");
md.push("## Resumen de tablas");
md.push("");
md.push("| Tabla | Descripción |");
md.push("|---|---|");
for (const k of listaTablas) md.push(`| \`${k}\` | ${escapar((tablas.get(k).descripcion ?? "").split(". ")[0].replace(/\.$/, ""))}. |`);
md.push("");

for (const k of listaTablas) {
  const t = tablas.get(k);
  const fks = t.restricciones.filter((r) => r.tipo === "f");
  const pk = new Set(t.restricciones.filter((r) => r.tipo === "p").flatMap((r) => r.columnas));
  const uq = new Set(t.restricciones.filter((r) => r.tipo === "u").flatMap((r) => r.columnas));
  const fk = new Set(fks.flatMap((r) => r.columnas));

  md.push(`### \`${k}\``);
  md.push("");
  md.push(t.descripcion ?? "");
  md.push("");
  md.push("**Columnas**");
  md.push("");
  md.push("| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |");
  md.push("|---|---|---|---|---|---|");
  for (const c of t.columnas) {
    const claves = [pk.has(c.columna) ? "PK" : null, fk.has(c.columna) ? "FK" : null, uq.has(c.columna) ? "UQ" : null].filter(Boolean).join(", ");
    md.push(`| \`${c.columna}\` | ${escapar(c.tipo)} | ${c.nulo ? "Sí" : "No"} | ${c.defecto ? "`" + escapar(c.defecto) + "`" : ""} | ${claves} | ${escapar(c.descripcion ?? "")} |`);
  }
  md.push("");

  if (fks.length) {
    md.push("**Llaves foráneas** (qué relaciona y para qué)");
    md.push("");
    md.push("| Restricción | Columna | Apunta a | Por qué y para qué |");
    md.push("|---|---|---|---|");
    for (const r of fks) md.push(`| \`${r.nombre}\` | \`${r.columnas.join(", ")}\` | \`${r.tabla_ref}\` | ${escapar(textoFk(t, r))} |`);
    md.push("");
  }
  if (t.relaciones.length !== fks.length) errores.push(`El COMMENT ON TABLE de ${k} explica ${t.relaciones.length} relaciones y la tabla tiene ${fks.length} llaves foráneas`);

  const checks = t.restricciones.filter((r) => r.tipo === "c");
  const unicas = t.restricciones.filter((r) => r.tipo === "u");
  if (checks.length || unicas.length) {
    md.push("**Restricciones**");
    md.push("");
    for (const r of unicas) md.push(`- \`${r.nombre}\`: única en \`${r.columnas.join(", ")}\`.`);
    for (const r of checks) md.push(`- \`${r.nombre}\`: \`${r.definicion}\`.`);
    md.push("");
  }

  const indices = t.indices.filter((i) => !/_pkey$|^pk_/.test(i.nombre) && !i.nombre.startsWith("uq_"));
  if (indices.length) {
    md.push("**Índices**");
    md.push("");
    for (const i of indices) md.push(`- \`${i.nombre}\`: \`${i.definicion.replace(/^CREATE (UNIQUE )?INDEX \S+ ON \S+ /, "")}\`.`);
    md.push("");
  }

  if (t.disparadores.length) {
    md.push("**Reglas que aplica la base (disparadores)**");
    md.push("");
    for (const d of t.disparadores) md.push(`- \`${d.nombre}\` (${momento(d.definicion)}): ${descripcionDisparador(d)}`);
    md.push("");
  }
}

if (errores.length) {
  console.error(`DICCIONARIO INCOMPLETO (${errores.length}):\n- ` + errores.join("\n- "));
  process.exit(1);
}

writeFileSync(join(CARPETA, "diccionario-de-datos.md"), md.join("\n") + "\n");
console.log(`OK: ${listaTablas.length} tablas, ${estructura.columnas.length} columnas, ${estructura.restricciones.filter((r) => r.tipo === "f").length} llaves foráneas, ${estructura.disparadores.length} disparadores (PostgreSQL ${versionPg})`);
