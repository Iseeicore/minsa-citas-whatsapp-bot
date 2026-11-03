import fs from "node:fs";
import path from "node:path";

export interface FilaPadronEess {
  codigo_renipress: string;
  nombre: string;
  nivel: string;
  categoria: string | null;
  autoridad_sanitaria: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
}

const ARCHIVO_PADRON = path.join(process.cwd(), "prisma", "seeds", "eess", "establecimientos.sql");
const FILA = /^\s*\((.*)\),?$/;
const VALOR = /'((?:[^']|'')*)'|NULL/g;

export function leerPadronEess(): FilaPadronEess[] {
  const texto = fs.readFileSync(ARCHIVO_PADRON, "utf8").replace(/\r\n/g, "\n");
  const inicio = texto.indexOf("FROM (VALUES\n");
  const fin = texto.indexOf("\n) AS padron (");
  return texto
    .slice(inicio, fin)
    .split("\n")
    .slice(1)
    .map((linea) => {
      const contenido = FILA.exec(linea)?.[1] ?? "";
      const [codigo_renipress, nombre, nivel, categoria, autoridad_sanitaria, departamento, provincia, distrito] = [
        ...contenido.matchAll(VALOR),
      ].map((m) => (m[0] === "NULL" ? null : m[1].replaceAll("''", "'")));
      return {
        codigo_renipress: codigo_renipress ?? "",
        nombre: nombre ?? "",
        nivel: nivel ?? "",
        categoria,
        autoridad_sanitaria: autoridad_sanitaria ?? "",
        departamento,
        provincia,
        distrito,
      };
    });
}
