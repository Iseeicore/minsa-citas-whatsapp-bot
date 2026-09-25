import { resolveDistritoAi } from "@/lib/fsm/parsing/ai/distrito";
import { resolveFechaAi, type FechaAiOption } from "@/lib/fsm/parsing/ai/fecha";
import { analyzeMainMenuIntent } from "@/lib/fsm/parsing/ai/main-menu-intent";
import { extractSelectionHints } from "@/lib/fsm/parsing/ai/selection-hints";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
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
} from "@/lib/integrations/minsa";
import { submitQueja, type SubmitQuejaPayload } from "@/lib/integrations/quejas";
import { reniecLookup } from "@/lib/integrations/reniec";
import { traceTurn } from "@/lib/observability/tracer";
import type { ExternalService } from "@/lib/observability/types";
import { getSession, saveSession } from "@/lib/fsm/session/session-store";
import { withTurnLock, type TurnLock } from "@/lib/fsm/session/turn-lock";
import type {
  HandleEvent,
  InboundEvent,
  QueryEffect,
  QueryResultEvent,
  SendEffect,
  Session,
} from "@/lib/fsm/core/types";

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
//
// The longest LEGITIMATE chain is the OTP turn of a citizen whose specialty and
// district are already known and for whom every catalog step has a single
// option: verify_code -> search_ubigeo -> list_especialidades ->
// list_establecimientos -> list_fechas -> list_horas -> book_appointment, plus
// the pass that handles the last result (8). 12 leaves headroom while still
// stopping a genuine loop quickly.
const MAX_PASSES = 12;

// One citizen's turns run one at a time (see lib/fsm/session/turn-lock.ts): a turn is
// read session -> compute -> write session, so overlapping turns would read the
// same stale session and lose an update. Both channels (webhook and Sandbox)
// come through here.
export function runTurn(from: string, event: InboundEvent): Promise<TurnResult> {
  return withTurnLock(from, () => runTurnUnlocked(from, event));
}

// Same, with an explicit lock — for composing several "instances" in tests.
export function createRunTurn(lock: TurnLock) {
  return (from: string, event: InboundEvent): Promise<TurnResult> =>
    lock(from, () => runTurnUnlocked(from, event));
}

// The turn itself, WITHOUT any lock. Not for production callers: it exists so
// the race can still be demonstrated and measured.
export async function runTurnUnlocked(from: string, event: InboundEvent): Promise<TurnResult> {
  const session = await getSession(from);

  // The turn's trace (lib/observability/tracer.ts) lives out here: handle() stays
  // pure and only returns the decisions it wants on record as `notes`.
  return traceTurn(from, event, session, async (trace) => {
    const sent: SendEffect[] = [];
    let currentEvent: HandleEvent = event;
    let currentSession = session;

    for (let pass = 1; pass <= MAX_PASSES; pass++) {
      const result = handle(currentSession, currentEvent);
      currentSession = result.session;
      for (const note of result.notes ?? []) trace.note(note);

      const queries = result.effects.filter(isQueryEffect);
      sent.push(...result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect)));

      if (queries.length === 0) {
        await saveSession(from, currentSession);
        trace.complete({ session: currentSession, sentCount: sent.length });
        return { sent, session: currentSession };
      }
      if (queries.length > 1) {
        throw new Error("runTurn: handle() returned more than one query effect in a single pass");
      }

      const [queryEffect] = queries;
      const queryResult = await trace.external(serviceFor(queryEffect.kind), queryEffect.kind, () =>
        resolveQuery(queryEffect, currentSession),
      );

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
  });
}

// Which outside service a query goes to, for the trace.
function serviceFor(kind: QueryEffect["kind"]): ExternalService {
  switch (kind) {
    case "reniec_lookup":
      return "reniec";
    case "quejas_submit":
      return "quejas";
    case "analyze_main_menu_intent":
    case "resolve_distrito_ai":
    case "resolve_fecha_ai":
    case "extract_selection_hints":
      return "gemini";
    default:
      return "minsa";
  }
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
