// Genera el diccionario de datos (Markdown), los diagramas ER (Mermaid) y comentarios.sql a partir de una base REAL ya
// migrada y de diccionario.json. Falla si falta la descripcion de cualquier tabla, columna, llave foranea o funcion de
// disparador. Uso: DATABASE_URL=postgresql://... [PSQL_PATH=...] npm run db:diccionario
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CARPETA = dirname(fileURLToPath(import.meta.url));
const SALIDA = process.env.SALIDA ?? join(CARPETA, "generado");
const PSQL = process.env.PSQL_PATH || "psql";

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL: una base ya migrada (npx prisma migrate deploy).");
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

const diccionario = JSON.parse(readFileSync(join(CARPETA, "diccionario.json"), "utf8"));
const estructura = JSON.parse(psql([], readFileSync(join(CARPETA, "estructura.sql"), "utf8")));
const versionPg = psql(["-c", "select split_part(version(), ' ', 2)"]);

const errores = [];
const clave = (esquema, tabla) => `${esquema}.${tabla}`;
const esCatalogo = (k) => k.startsWith("catalogo.") || k === "gestion.rol";
const escapar = (s) => String(s).replaceAll("|", "\\|").replaceAll("\n", " ");
const sql = (s) => `'${String(s).replaceAll("'", "''")}'`;

const tablas = new Map();
for (const c of estructura.columnas) {
  const k = clave(c.esquema, c.tabla);
  if (!tablas.has(k)) tablas.set(k, { esquema: c.esquema, nombre: c.tabla, columnas: [], restricciones: [], indices: [], disparadores: [] });
  tablas.get(k).columnas.push(c);
}
for (const r of estructura.restricciones) tablas.get(clave(r.esquema, r.tabla)).restricciones.push(r);
for (const i of estructura.indices) tablas.get(clave(i.esquema, i.tabla)).indices.push(i);
for (const d of estructura.disparadores) tablas.get(clave(d.esquema, d.tabla)).disparadores.push(d);

function descripcionColumna(k, columna) {
  const propia = diccionario.tablas[k]?.columnas?.[columna];
  if (propia) return propia;
  if (esCatalogo(k) && diccionario.catalogo_columnas[columna]) return diccionario.catalogo_columnas[columna];
  if (diccionario.comunes[columna]) return diccionario.comunes[columna];
  errores.push(`Falta la descripción de la columna ${k}.${columna}`);
  return "";
}

function descripcionDisparador(d) {
  const base = diccionario.disparadores_por_funcion[d.funcion];
  if (!base) {
    errores.push(`Falta la descripción de la función ${d.funcion} (disparador ${d.nombre})`);
    return "";
  }
  if (d.funcion === "fn_bloquear_operacion") {
    return d.definicion.includes("'todo'")
      ? "Tabla de solo inserción: bloquea modificar y borrar."
      : "Bloquea el borrado físico; se debe usar el borrado lógico.";
  }
  return base;
}

function momento(def) {
  const m = def.match(/(BEFORE|AFTER) ((?:INSERT|UPDATE|DELETE)(?: OR (?:INSERT|UPDATE|DELETE))*)/);
  return m ? `${m[1] === "BEFORE" ? "Antes de" : "Después de"} ${m[2].replaceAll("INSERT", "insertar").replaceAll("UPDATE", "modificar").replaceAll("DELETE", "borrar").replaceAll(" OR ", " o ")}` : "";
}

const listaTablas = [...tablas.keys()].sort();
for (const k of listaTablas) {
  if (!diccionario.tablas[k]?.descripcion) errores.push(`Falta la descripción de la tabla ${k}`);
}
for (const k of Object.keys(diccionario.tablas)) {
  if (!tablas.has(k)) errores.push(`diccionario.json describe una tabla que no existe: ${k}`);
}
for (const t of tablas.values()) {
  for (const col of Object.keys(diccionario.tablas[clave(t.esquema, t.nombre)]?.columnas ?? {})) {
    if (!t.columnas.some((c) => c.columna === col)) errores.push(`diccionario.json describe una columna que no existe: ${t.esquema}.${t.nombre}.${col}`);
  }
}

const textoFk = (r) => {
  const t = diccionario.llaves_foraneas[r.nombre];
  if (!t) errores.push(`Falta la explicación de la llave foránea ${r.nombre}`);
  return t ?? "";
};

const md = [];
md.push("# Diccionario de datos");
md.push("");
md.push(`> **Generado automáticamente** por \`generar-diccionario.mjs\` desde la base real (PostgreSQL ${versionPg}). **No se edita a mano**: se cambia \`diccionario.json\` y se vuelve a generar. El script falla si falta la descripción de una tabla, una columna o una llave foránea.`);
md.push("> Convención: tablas y columnas en español y en singular; lo que viene de Meta en inglés. Fechas en UTC. Detalle del diseño en [[Base De Datos]].");
md.push("");
md.push("## Esquemas");
md.push("");
md.push("| Esquema | Para qué sirve |");
md.push("|---|---|");
for (const [e, d] of Object.entries(diccionario.esquemas)) md.push(`| \`${e}\` | ${escapar(d)} |`);
md.push("");
md.push("## Resumen de tablas");
md.push("");
md.push("| Tabla | Descripción |");
md.push("|---|---|");
for (const k of listaTablas) md.push(`| \`${k}\` | ${escapar(diccionario.tablas[k].descripcion.split(". ")[0].replace(/\.$/, ""))}. |`);
md.push("");

const comentarios = [];
for (const [e, d] of Object.entries(diccionario.esquemas)) comentarios.push(`COMMENT ON SCHEMA ${e} IS ${sql(d)};`);

for (const k of listaTablas) {
  const t = tablas.get(k);
  const fks = t.restricciones.filter((r) => r.tipo === "f");
  const pk = new Set(t.restricciones.filter((r) => r.tipo === "p").flatMap((r) => r.columnas));
  const uq = new Set(t.restricciones.filter((r) => r.tipo === "u").flatMap((r) => r.columnas));
  const fk = new Set(fks.flatMap((r) => r.columnas));

  md.push(`### \`${k}\``);
  md.push("");
  md.push(diccionario.tablas[k].descripcion);
  md.push("");
  md.push("**Columnas**");
  md.push("");
  md.push("| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |");
  md.push("|---|---|---|---|---|---|");
  for (const c of t.columnas) {
    const claves = [pk.has(c.columna) ? "PK" : null, fk.has(c.columna) ? "FK" : null, uq.has(c.columna) ? "UQ" : null].filter(Boolean).join(", ");
    const desc = descripcionColumna(k, c.columna);
    md.push(`| \`${c.columna}\` | ${escapar(c.tipo)} | ${c.nulo ? "Sí" : "No"} | ${c.defecto ? "`" + escapar(c.defecto) + "`" : ""} | ${claves} | ${escapar(desc)} |`);
    comentarios.push(`COMMENT ON COLUMN ${k}.${c.columna} IS ${sql(desc)};`);
  }
  md.push("");

  if (fks.length) {
    md.push("**Llaves foráneas** (qué relaciona y para qué)");
    md.push("");
    md.push("| Restricción | Columna | Apunta a | Por qué y para qué |");
    md.push("|---|---|---|---|");
    for (const r of fks) md.push(`| \`${r.nombre}\` | \`${r.columnas.join(", ")}\` | \`${r.tabla_ref}\` | ${escapar(textoFk(r))} |`);
    md.push("");
  }

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

  let comentarioTabla = diccionario.tablas[k].descripcion;
  if (fks.length) comentarioTabla += "\n\nRelaciones:\n" + fks.map((r) => `- ${r.columnas.join(", ")} → ${r.tabla_ref}: ${textoFk(r)}`).join("\n");
  comentarios.push(`COMMENT ON TABLE ${k} IS ${sql(comentarioTabla)};`);
}

const tipoSimple = (t) =>
  t
    .replace(/timestamp(\(\d+\))? with time zone/, "timestamptz")
    .replace(/character varying\(\d+\)/, "varchar")
    .replace(/numeric\(\d+,\d+\)/, "numeric")
    .replace("integer", "int")
    .replace("boolean", "boolean");

function er(incluirCatalogos) {
  const salida = ["erDiagram"];
  const visibles = listaTablas.filter((k) => incluirCatalogos || !k.startsWith("catalogo."));
  for (const k of visibles) {
    for (const r of tablas.get(k).restricciones.filter((x) => x.tipo === "f")) {
      if (!visibles.includes(r.tabla_ref)) continue;
      const nulo = tablas.get(k).columnas.find((c) => c.columna === r.columnas[0]).nulo;
      salida.push(`    ${r.tabla_ref.split(".")[1]} ${nulo ? "|o" : "||"}--o{ ${tablas.get(k).nombre} : "${r.columnas[0]}"`);
    }
  }
  salida.push("");
  for (const k of visibles) {
    const t = tablas.get(k);
    const pk = new Set(t.restricciones.filter((r) => r.tipo === "p").flatMap((r) => r.columnas));
    const fksCol = new Map(t.restricciones.filter((r) => r.tipo === "f").flatMap((r) => r.columnas.map((c) => [c, r.tabla_ref])));
    const uq = new Set(t.restricciones.filter((r) => r.tipo === "u").flatMap((r) => r.columnas));
    salida.push(`    ${t.nombre} {`);
    for (const c of t.columnas) {
      if (["fecha_creacion", "usuario_creacion", "fecha_modificacion", "usuario_modificacion", "version_fila"].includes(c.columna)) continue;
      const claves = [pk.has(c.columna) ? "PK" : null, fksCol.has(c.columna) ? "FK" : null, uq.has(c.columna) ? "UK" : null].filter(Boolean).join(", ");
      const ref = fksCol.get(c.columna);
      const comentario = ref && ref.startsWith("catalogo.") && !visibles.includes(ref) ? ` "catalogo ${ref.split(".")[1]}"` : "";
      salida.push(`        ${tipoSimple(c.tipo)} ${c.columna}${claves ? " " + claves : ""}${comentario}`);
    }
    salida.push("        bloque auditoria");
    salida.push("    }");
  }
  return salida.join("\n");
}

if (errores.length) {
  console.error(`DICCIONARIO INCOMPLETO (${errores.length}):\n- ` + errores.join("\n- "));
  process.exit(1);
}

mkdirSync(SALIDA, { recursive: true });
writeFileSync(join(SALIDA, "Diccionario de datos.md"), md.join("\n") + "\n");
writeFileSync(join(SALIDA, "comentarios.sql"), comentarios.join("\n") + "\n");
writeFileSync(join(SALIDA, "er-nucleo.mmd"), er(false) + "\n");
writeFileSync(join(SALIDA, "er-completo.mmd"), er(true) + "\n");
console.log(`OK: ${listaTablas.length} tablas, ${estructura.columnas.length} columnas, ${estructura.restricciones.filter((r) => r.tipo === "f").length} llaves foráneas, ${estructura.disparadores.length} disparadores (PostgreSQL ${versionPg})`);
