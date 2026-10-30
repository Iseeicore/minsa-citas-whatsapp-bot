import { toDisplayPlace } from "@/lib/fsm/parsing/text/text";
import { ALL_WHITESPACE_RUNS } from "@/lib/constants/regex/text";
import { truncateForRow } from "@/lib/fsm/core/handlers-shared";
import { type OfferedRow } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import {
  CONSONANT_ONLY_ACRONYM,
  CONSULTA_EXTERNA_PREFIX,
  DOTTED_ABBREVIATION,
  EDGE_SPACES_AND_HYPHENS,
  ESTABLECIMIENTO_ABBREVIATIONS,
  NAME_SEGMENT_SEPARATOR,
  TITLE_CASED_ROMAN_NUMERAL,
} from "@/lib/constants/regex/catalog";
import { cuposText } from "@/lib/constants/textos/cita-catalogo";
import { readSlotJson, slotJsonOr } from "@/lib/fsm/core/slot-readers";
import { z } from "zod";
import { WHATSAPP_ROW_TITLE_MAX, WHATSAPP_ROW_DESCRIPTION_MAX } from "@/lib/constants/limits/whatsapp";

export type CatalogName = { title: string; full: string };

const FULL_NAME_SEPARATOR = " · ";

const collapseSpaces = (value: string): string => value.replace(ALL_WHITESPACE_RUNS, " ").trim();

const keepAcronyms = (value: string): string =>
  value
    .replace(DOTTED_ABBREVIATION, (abbreviation) => abbreviation.toUpperCase())
    .replace(TITLE_CASED_ROMAN_NUMERAL, (numeral) => numeral.toUpperCase())
    .replace(CONSONANT_ONLY_ACRONYM, (acronym) => acronym.toUpperCase());

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

export function formatEspecialidadName(raw: string): CatalogName {
  const cleaned = collapseSpaces(raw).replace(CONSULTA_EXTERNA_PREFIX, "").replace(EDGE_SPACES_AND_HYPHENS, "");
  const full = toCatalogDisplay(cleaned || collapseSpaces(raw));
  const firstSegment = full.split(NAME_SEGMENT_SEPARATOR)[0].trim() || full;
  return { title: cutAtWord(firstSegment, WHATSAPP_ROW_TITLE_MAX), full };
}

export function formatEstablecimientoName(raw: string): CatalogName {
  const full = toCatalogDisplay(collapseSpaces(raw));
  const abbreviated = ESTABLECIMIENTO_ABBREVIATIONS.reduce((name, [pattern, short]) => name.replace(pattern, short), full);
  return { title: cutAtWord(abbreviated, WHATSAPP_ROW_TITLE_MAX), full };
}

export function catalogRowDescription(name: CatalogName, cupos: number): string {
  const quota = cuposText(cupos);
  if (name.full === name.title) return quota;
  const suffix = `${FULL_NAME_SEPARATOR}${quota}`;
  return `${truncateForRow(name.full, WHATSAPP_ROW_DESCRIPTION_MAX - suffix.length)}${suffix}`;
}

export function fullNameFromRow(row: OfferedRow): string {
  const at = row.description?.lastIndexOf(FULL_NAME_SEPARATOR) ?? -1;
  return row.description && at > 0 ? row.description.slice(0, at) : row.title;
}

export function rememberFullNames(slots: Session["slots"], entries: ReadonlyArray<{ id: string; full: string }>): void {
  slots[SlotKey.CITA_OFFERED_NAMES] = JSON.stringify(Object.fromEntries(entries.map((entry) => [entry.id, entry.full])));
}

const OFFERED_NAMES_SCHEMA = z.record(z.string(), z.string());

export function offeredFullName(slots: Session["slots"], row: OfferedRow): string {
  const names = slotJsonOr<Record<string, string>>(readSlotJson(slots, SlotKey.CITA_OFFERED_NAMES, OFFERED_NAMES_SCHEMA), {});
  const full = names[row.id];
  return full ? full : fullNameFromRow(row);
}
