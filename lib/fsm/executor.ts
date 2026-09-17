import { handle } from "./handlers";
import { isQueryEffect } from "./handlers-shared";
import {
  bookAppointment,
  formatHoraCita,
  listEspecialidades,
  listEstablecimientos,
  listFechas,
  listHoras,
  searchUbigeo,
  validateUser,
  verifyCode,
} from "./minsa";
import { submitQueja, type SubmitQuejaPayload } from "./quejas";
import { reniecLookup } from "./reniec";
import { getSession, saveSession } from "./session-store";
import type { InboundEvent, QueryEffect, QueryResultEvent, SendEffect, Session } from "./types";

export type TurnResult = {
  sent: SendEffect[];
  session: Session;
};

// Single-turn runner: handle() may return at most one QueryEffect, which is
// resolved here against the real/fake integrations, then fed back into
// handle() for its second (and final) pass — the "bounded re-entry" pattern.
export async function runTurn(from: string, event: InboundEvent): Promise<TurnResult> {
  const session = await getSession(from);
  const firstPass = handle(session, event);

  const firstPassQueries = firstPass.effects.filter(isQueryEffect);
  const sent: SendEffect[] = firstPass.effects.filter(
    (effect): effect is SendEffect => !isQueryEffect(effect),
  );

  let finalSession = firstPass.session;

  if (firstPassQueries.length > 0) {
    if (firstPassQueries.length > 1) {
      throw new Error("runTurn: handle() returned more than one query effect in a single pass");
    }

    const [queryEffect] = firstPassQueries;
    const result = await resolveQuery(queryEffect, firstPass.session);

    const resultEvent: QueryResultEvent = {
      from,
      type: "query_result",
      queryKind: queryEffect.kind,
      result,
    };

    const secondPass = handle(firstPass.session, resultEvent);

    if (secondPass.effects.some(isQueryEffect)) {
      throw new Error(
        "runTurn: handle() requested a second query effect in the same turn — state machine bug",
      );
    }

    sent.push(...(secondPass.effects as SendEffect[]));
    finalSession = secondPass.session;
  }

  await saveSession(from, finalSession);

  return { sent, session: finalSession };
}

async function resolveQuery(effect: QueryEffect, session: Session): Promise<unknown> {
  const bearer = String(session.slots.citaBearer ?? "");

  switch (effect.kind) {
    case "reniec_lookup":
      return reniecLookup(String(effect.payload.dni ?? ""));

    case "quejas_submit":
      return submitQueja(effect.payload.submission as SubmitQuejaPayload);

    case "validate_user":
      return validateUser(String(effect.payload.numeroDocumento ?? ""));

    case "verify_code":
      return verifyCode(String(effect.payload.twofaId ?? ""), String(effect.payload.code ?? ""));

    case "search_ubigeo":
      return searchUbigeo(
        String(effect.payload.departamento ?? ""),
        String(effect.payload.provincia ?? ""),
        String(effect.payload.distrito ?? ""),
        bearer,
      );

    case "list_especialidades":
      return listEspecialidades(String(effect.payload.ubigeo ?? ""), bearer);

    case "list_establecimientos":
      return listEstablecimientos(
        String(effect.payload.especialidadId ?? ""),
        String(effect.payload.ubigeo ?? ""),
        bearer,
      );

    case "list_fechas":
      return listFechas(
        String(effect.payload.codEess ?? ""),
        String(effect.payload.especialidadId ?? ""),
        bearer,
      );

    case "list_horas":
      return listHoras(
        String(effect.payload.codEess ?? ""),
        String(effect.payload.especialidadId ?? ""),
        String(effect.payload.fecha ?? ""),
        bearer,
      );

    case "book_appointment":
      return bookAppointment(
        {
          codigoRenipress: String(effect.payload.codigoRenipress ?? ""),
          codigoUps: String(effect.payload.codigoUps ?? ""),
          fechaCita: String(effect.payload.fechaCita ?? ""),
          horaCita: formatHoraCita(String(effect.payload.horaInicio ?? "")),
          numeroDocumentoPaciente: String(effect.payload.numeroDocumentoPaciente ?? ""),
        },
        bearer,
      );

    default:
      throw new Error(`resolveQuery: unhandled query kind "${effect.kind}"`);
  }
}

// Re-exported for the route handler's request validation.
export type { InboundEvent };
