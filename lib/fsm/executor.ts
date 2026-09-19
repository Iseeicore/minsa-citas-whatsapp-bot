import {
  analyzeMainMenuIntent,
  extractSelectionHints,
  resolveDistritoAi,
  resolveFechaAi,
  type FechaAiOption,
} from "./ai";
import { handle } from "./handlers";
import { isQueryEffect } from "./handlers-shared";
import {
  bookAppointment,
  formatFechaForApi,
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
import type {
  HandleEvent,
  InboundEvent,
  QueryEffect,
  QueryResultEvent,
  SendEffect,
  Session,
} from "./types";

export type TurnResult = {
  sent: SendEffect[];
  session: Session;
};

// handle() may return at most one QueryEffect per pass; each one resolved
// here is fed back in as a synthetic query-result event for the next pass —
// the "bounded re-entry" pattern. Every existing state chain only ever needs
// one such round trip (2 passes total) and keeps behaving exactly as before;
// cita_distrito_ai_pending's single-candidate case is the first state that
// chains a second query (resolve_distrito_ai -> search_ubigeo) within the
// same citizen turn, which is why this loops instead of hardcoding 2 passes.
// MAX_PASSES is a defensive cap against a genuine state-machine bug (e.g. two
// states that keep firing queries at each other), not an expected code path.
const MAX_PASSES = 5;

export async function runTurn(from: string, event: InboundEvent): Promise<TurnResult> {
  const session = await getSession(from);

  const sent: SendEffect[] = [];
  let currentEvent: HandleEvent = event;
  let currentSession = session;

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const result = handle(currentSession, currentEvent);
    currentSession = result.session;

    const queries = result.effects.filter(isQueryEffect);
    sent.push(...result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect)));

    if (queries.length === 0) {
      await saveSession(from, currentSession);
      return { sent, session: currentSession };
    }
    if (queries.length > 1) {
      throw new Error("runTurn: handle() returned more than one query effect in a single pass");
    }

    const [queryEffect] = queries;
    const queryResult = await resolveQuery(queryEffect, currentSession);

    const resultEvent: QueryResultEvent = {
      from,
      type: "query_result",
      queryKind: queryEffect.kind,
      result: queryResult,
    };
    currentEvent = resultEvent;
  }

  throw new Error(
    `runTurn: exceeded ${MAX_PASSES} query-resolution passes in a single turn — state machine bug`,
  );
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

    case "analyze_main_menu_intent":
      return analyzeMainMenuIntent(String(effect.payload.text ?? ""));

    case "resolve_distrito_ai":
      return resolveDistritoAi(
        String(effect.payload.distritoText ?? ""),
        effect.payload.contextText as string | undefined,
      );

    case "resolve_fecha_ai":
      return resolveFechaAi(
        String(effect.payload.text ?? ""),
        String(effect.payload.today ?? ""),
        (effect.payload.options as FechaAiOption[] | undefined) ?? [],
      );

    case "extract_selection_hints":
      return extractSelectionHints(String(effect.payload.step ?? ""), String(effect.payload.text ?? ""));

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
        formatFechaForApi(String(effect.payload.fecha ?? "")),
        bearer,
      );

    case "book_appointment":
      return bookAppointment(
        {
          codigoRenipress: String(effect.payload.codigoRenipress ?? ""),
          codigoUps: String(effect.payload.codigoUps ?? ""),
          fechaCita: formatFechaForApi(String(effect.payload.fechaCita ?? "")),
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
