import { readConfirmation, withRejectionNotice } from "@/lib/fsm/flows/incidencia/confirmation";
import { buildResult, cloneSession, query, sendButtons, sendText } from "@/lib/fsm/core/handlers-shared";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { Confirmation } from "@/lib/enums/confirmation";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

export const FOTO_REQUEST_TEXT =
  "¿Quieres enviar una imagen o un archivo como evidencia? Es opcional: envíalo ahora, o toca Omitir (o escribe OMITIR) para continuar sin él.";
export const FOTO_BUTTONS = [{ id: IncidenciaButtonId.FOTO_OMITIR, title: "Omitir" }];
export const EVIDENCIA_ACK_TEXT = "Ok, se registró tu evidencia.";
export const UNREADABLE_TEXT_RETRY = "No pudimos leer eso — ¿podrías escribirlo de nuevo?";

/** Pide la evidencia con un botón Omitir; escribir OMITIR sigue valiendo. */
export function askFoto() {
  return sendButtons(FOTO_REQUEST_TEXT, FOTO_BUTTONS);
}

export function askDescripcion(): string {
  return "Cuéntanos tu incidencia (hasta 1000 caracteres).";
}

export function submitIncidencia(session: Session, from: string): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_SUBMIT_PENDING;

  const submission = {
    waId: from,
    dni: next.slots[SlotKey.DNI] ?? null,
    nombreCompleto: next.slots[SlotKey.NOMBRE_COMPLETO] ?? null,
    descripcion: next.slots[SlotKey.DESCRIPCION_INCIDENCIA],
    establecimientoId: next.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID] ?? null,
  };

  return buildResult(next, [sendText("Enviando tu incidencia…"), query(QueryKind.INCIDENCIA_REGISTER, { submission })]);
}

/** Con el relato ya guardado en el slot: ofrece enviar una evidencia. Ningún archivo se guarda en esta instancia. */
export function afterDescripcion(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_AWAITING_FOTO;
  return buildResult(next, [askFoto()]);
}

const CONFIRM_REGISTRO_SI = IncidenciaButtonId.CONFIRM_REGISTRO_SI;
const CONFIRM_REGISTRO_NO = IncidenciaButtonId.CONFIRM_REGISTRO_NO;

export const CONFIRM_REGISTRO_BUTTONS = [
  { id: CONFIRM_REGISTRO_SI, title: "Registrar" },
  { id: CONFIRM_REGISTRO_NO, title: "Cancelar" },
];

export const REGISTRO_CANCELADO_TEXT =
  "Entendido, no se registró tu incidencia. Cuando quieras registrar una, escríbenos nuevamente. ¡Que tengas un buen día! 👋";

function resumenRegistro(session: Session): string {
  const descripcion = String(session.slots[SlotKey.DESCRIPCION_INCIDENCIA] ?? "");
  const establecimiento = session.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_NOMBRE];
  const nombre = session.slots[SlotKey.NOMBRE_COMPLETO];

  const lineas = [
    "La información está lista para ser registrada.",
    establecimiento ? `Establecimiento: ${establecimiento}` : undefined,
    `Relato: «${descripcion}»`,
    nombre ? `A nombre de: ${nombre}` : "De forma anónima",
    "",
    "Al continuar, confirmas que la información es verdadera según tu conocimiento y que podrá ser revisada por el personal autorizado para gestionar tu incidencia.",
  ];
  return lineas.filter((linea) => linea !== undefined).join("\n");
}

/** Punto entre la evidencia y el registro: muestra un resumen y exige confirmación explícita antes de enviar algo que ya no tiene vuelta atrás. */
export function askConfirmRegistro(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_CONFIRM_REGISTRO;
  return buildResult(next, [sendButtons(resumenRegistro(next), CONFIRM_REGISTRO_BUTTONS)]);
}

export function handleConfirmRegistro(session: Session, event: InboundEvent): HandlerResult {
  const answer = readConfirmation(event, CONFIRM_REGISTRO_SI, CONFIRM_REGISTRO_NO);

  if (answer === Confirmation.YES) return submitIncidencia(session, event.from);

  if (answer === Confirmation.NO) {
    return buildResult({ state: SessionState.INCIDENCIA_CANCELLED, slots: {}, counters: {} }, [sendText(REGISTRO_CANCELADO_TEXT)]);
  }

  return withRejectionNotice(buildResult(session, [sendButtons(resumenRegistro(session), CONFIRM_REGISTRO_BUTTONS)]));
}
