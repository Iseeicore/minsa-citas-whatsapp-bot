import { z } from "zod";
import type { SlotKey } from "@/lib/enums/slot-key";
import type { Slots } from "@/lib/fsm/core/types";
import { toText } from "@/lib/utils/text-values";
import { isNonEmptyString, isString } from "@/lib/utils/type-guards";
import { SessionChannel } from "@/lib/enums/session-channel";
import { FlujoAceptacion } from "@/lib/enums/consentimiento/flujo-aceptacion";
import { DocumentoAceptacion } from "@/lib/enums/consentimiento/documento-aceptacion";
import type { DocumentoVigente } from "@/lib/types/aceptacion-terminos.types";
import { MissingSlotError } from "@/lib/errors/missing-slot-error";
import { SlotJsonStatus } from "@/lib/enums/slot-json-status";
import { logger } from "@/lib/observability/logger";

export type SlotJson<T> = { status: SlotJsonStatus.OK; value: T } | { status: SlotJsonStatus.ABSENT } | { status: SlotJsonStatus.CORRUPT };

const SESSION_CHANNELS: readonly string[] = Object.values(SessionChannel);
const FLUJOS_ACEPTACION: readonly string[] = Object.values(FlujoAceptacion);
const DOCUMENTOS_VIGENTES = z.array(z.object({ documento: z.enum(DocumentoAceptacion), version: z.string().trim().min(1) })).min(1);

function isSessionChannel(value: unknown): value is SessionChannel {
  return isString(value) && SESSION_CHANNELS.includes(value);
}

function requireText(text: string, field: string, queryKind: string): string {
  if (text.trim() === "") throw new MissingSlotError(field, queryKind);
  return text;
}

function buildCorruptSlotJson(key: SlotKey): SlotJson<never> {
  logger.warn("session.slot_corrupt", { slot: key });
  return { status: SlotJsonStatus.CORRUPT };
}

export function slotText(slots: Slots, key: SlotKey): string {
  return toText(slots[key]);
}

export function payloadText(payload: Record<string, unknown>, key: string): string {
  return toText(payload[key]);
}

export function requireSlotText(slots: Slots, key: SlotKey, queryKind: string): string {
  return requireText(slotText(slots, key), key, queryKind);
}

export function requirePayloadChannel(payload: Record<string, unknown>, queryKind: string): SessionChannel {
  const canal = payload.canal;
  if (!isSessionChannel(canal)) throw new MissingSlotError("canal", queryKind);
  return canal;
}

export function requirePayloadFlujo(payload: Record<string, unknown>, queryKind: string): FlujoAceptacion {
  const flujo = payload.flujo;
  if (!isString(flujo) || !FLUJOS_ACEPTACION.includes(flujo)) throw new MissingSlotError("flujo", queryKind);
  return flujo as FlujoAceptacion;
}

export function requirePayloadDocumentos(payload: Record<string, unknown>, queryKind: string): DocumentoVigente[] {
  const documentos = DOCUMENTOS_VIGENTES.safeParse(payload.documentos);
  if (!documentos.success) throw new MissingSlotError("documentos", queryKind);
  return documentos.data;
}

export function requirePayloadText(payload: Record<string, unknown>, key: string, queryKind: string): string {
  return requireText(payloadText(payload, key), key, queryKind);
}

export function readSlotJson<T>(slots: Slots, key: SlotKey, schema: z.ZodType<T>): SlotJson<T> {
  const raw = slots[key];
  if (!isNonEmptyString(raw)) return { status: SlotJsonStatus.ABSENT };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return buildCorruptSlotJson(key);
  }

  const checked = schema.safeParse(parsed);
  return checked.success ? { status: SlotJsonStatus.OK, value: checked.data } : buildCorruptSlotJson(key);
}

export function getSlotJsonOr<T>(read: SlotJson<T>, fallback: T): T {
  return read.status === SlotJsonStatus.OK ? read.value : fallback;
}
