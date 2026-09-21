import type { Session } from "./types";

// Lo que un cliente puede ver de una sesión de la FSM.
//
// Es una ALLOWLIST a propósito, no una lista de exclusiones: un slot que nadie
// agregó acá NO sale al navegador. Así, el día que alguien guarde un dato
// sensible nuevo en la sesión, el default es que no se filtre — al revés de una
// denylist, donde el default es filtrarlo hasta que alguien se acuerde.
//
// Fuera de la lista, deliberadamente:
//   citaBearer    el token real de MINSA que la FSM obtiene al verificar el OTP
//                 (handlers-cita.ts). Con él se actúa COMO el ciudadano contra
//                 la API de citas: reservar, cancelar, leer sus datos.
//   citaDni, citaDniPending, citaTwofaId     identidad y 2FA del ciudadano.
//   dni, nombre, nombreCompleto, queja, mediaDataUri
//                 datos del flujo de reclamo: nombre completo, el texto del
//                 reclamo (puede contener información de salud) y la foto
//                 adjunta en base64.
//
// Lo que sí sale es estado de navegación que el ciudadano ya está viendo en su
// propia conversación (qué distrito eligió, qué fecha, qué opciones se le
// ofrecieron), así que exponerlo a su propio navegador no agrega exposición.
const SLOTS_PUBLICOS = new Set([
  "awaitingContinue",
  "citaCodEess",
  "citaDepartamento",
  "citaDistrito",
  "citaDistritoHintText",
  "citaEspecialidadHintText",
  "citaEspecialidadId",
  "citaEstablecimientoHintText",
  "citaFecha",
  "citaFechasDescartadas",
  "citaHoraChoiceA",
  "citaHoraChoiceB",
  "citaHoraConfirmId",
  "citaHoraConfirmOnly",
  "citaHorasDia",
  "citaOffered",
  "citaProvincia",
  "citaResumeState",
  "citaSelectionStep",
  "citaUbigeo",
  "initialMessageText",
  "menuChoice",
]);

export type PublicSession = {
  state: string;
  slots: Session["slots"];
  counters: Session["counters"];
};

export function toPublicSession(session: Session): PublicSession {
  return {
    state: session.state,
    slots: Object.fromEntries(
      Object.entries(session.slots).filter(([clave]) => SLOTS_PUBLICOS.has(clave)),
    ),
    counters: session.counters,
  };
}
