import { toDisplayPlace } from "@/lib/fsm/parsing/text/text";
import { truncateForRow, WHATSAPP_ROW_DESCRIPTION_MAX, WHATSAPP_ROW_TITLE_MAX } from "@/lib/fsm/core/handlers-shared";
import { OFFERED_NAMES_SLOT, type OfferedRow } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { Session } from "@/lib/fsm/core/types";

export type CatalogName = { title: string; full: string };

const FULL_NAME_SEPARATOR = " · ";

const ESTABLECIMIENTO_ABBREVIATIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bCentro Materno Infantil\b/i, "C.M.I."],
  [/\bCentro de Salud\b/i, "C.S."],
  [/\bPuesto de Salud\b/i, "P.S."],
  [/\bHospital\b/i, "Hosp."],
];

const collapseSpaces = (value: string): string => value.replace(/\s+/g, " ").trim();

const keepAcronyms = (value: string): string =>
  value
    .replace(/(?<!\p{L})(?:\p{L}\.){2,}/gu, (abbreviation) => abbreviation.toUpperCase())
    .replace(/(?<!\p{L})(?:Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii)(?!\p{L})/gu, (numeral) => numeral.toUpperCase())
    .replace(/(?<!\p{L})[b-df-hj-np-tv-z]{2,3}(?!\p{L})/giu, (acronym) => acronym.toUpperCase());

const toCatalogDisplay = (value: string): string => keepAcronyms(toDisplayPlace(value));

function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = "";
  for (const word of text.split(" ")) {
    const candidate = cut ? `${cut} ${word}` : word;
    if (candidate.length > max) break;
    cut = candidate;
  }
  return cut || truncateForRow(text, max);
}

/** Nombre de especialidad del MINSA legible: sin el prefijo «CONSULTA EXTERNA-», título corto para la fila y nombre completo para la descripción. */
export function formatEspecialidadName(raw: string): CatalogName {
  const cleaned = collapseSpaces(raw)
    .replace(/^CONSULTA\s+EXTERNA\s*-\s*/i, "")
    .replace(/^[\s-]+|[\s-]+$/g, "");
  const full = toCatalogDisplay(cleaned || collapseSpaces(raw));
  const firstSegment = full.split(/\s*\/\s*|-/)[0].trim() || full;
  return { title: cutAtWord(firstSegment, WHATSAPP_ROW_TITLE_MAX), full };
}

export function formatEstablecimientoName(raw: string): CatalogName {
  const full = toCatalogDisplay(collapseSpaces(raw));
  const abbreviated = ESTABLECIMIENTO_ABBREVIATIONS.reduce((name, [pattern, short]) => name.replace(pattern, short), full);
  return { title: cutAtWord(abbreviated, WHATSAPP_ROW_TITLE_MAX), full };
}

export function catalogRowDescription(name: CatalogName, cupos: number): string {
  const quota = cupos === 1 ? "1 cupo" : `${cupos} cupos`;
  if (name.full === name.title) return quota;
  const suffix = `${FULL_NAME_SEPARATOR}${quota}`;
  return `${truncateForRow(name.full, WHATSAPP_ROW_DESCRIPTION_MAX - suffix.length)}${suffix}`;
}

export function fullNameFromRow(row: OfferedRow): string {
  const at = row.description?.lastIndexOf(FULL_NAME_SEPARATOR) ?? -1;
  return row.description && at > 0 ? row.description.slice(0, at) : row.title;
}

export function rememberFullNames(slots: Session["slots"], entries: ReadonlyArray<{ id: string; full: string }>): void {
  slots[OFFERED_NAMES_SLOT] = JSON.stringify(Object.fromEntries(entries.map((entry) => [entry.id, entry.full])));
}

export function offeredFullName(slots: Session["slots"], row: OfferedRow): string {
  const raw = slots[OFFERED_NAMES_SLOT];
  if (typeof raw === "string") {
    try {
      const names = JSON.parse(raw) as Record<string, unknown>;
      const full = names[row.id];
      if (typeof full === "string" && full) return full;
    } catch {
      return fullNameFromRow(row);
    }
  }
  return fullNameFromRow(row);
}
