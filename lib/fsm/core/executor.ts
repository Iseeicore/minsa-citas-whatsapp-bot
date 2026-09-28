import { resolveDistritoAiDetailed } from "@/lib/fsm/parsing/ai/distrito";
import { resolveFechaAi, type FechaAiOption } from "@/lib/fsm/parsing/ai/fecha";
import { analyzeMainMenuIntent } from "@/lib/fsm/parsing/ai/main-menu-intent";
import { extractSelectionHints } from "@/lib/fsm/parsing/ai/selection-hints";
import { configuredLlmProvider } from "@/lib/fsm/parsing/ai/llm-registry";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { bookAppointment } from "@/lib/integrations/minsa/booking";
import {
  listEspecialidades,
  listEstablecimientos,
  listFechas,
  listHoras,
  searchUbigeo,
} from "@/lib/integrations/minsa/catalog";
import { formatFechaForApi, formatHoraCita } from "@/lib/integrations/minsa/format";
import { validateUser, verifyCode } from "@/lib/integrations/minsa/identity";
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

/** Entrega cada mensaje apenas se produce y avisa antes de cada consulta externa, para que el ciudadano no espere en silencio. */
export type TurnHooks = {
  onSend(effect: SendEffect): Promise<void>;
  onWaitingForQuery(): Promise<void>;
};

const MAX_PASSES = 12;

export function runTurn(from: string, event: InboundEvent): Promise<TurnResult> {
  return withTurnLock(from, () => runTurnUnlocked(from, event));
}

export function createRunTurn(lock: TurnLock) {
  return (from: string, event: InboundEvent): Promise<TurnResult> =>
    lock(from, () => runTurnUnlocked(from, event));
}

/** Ejecuta el turno sin tomar el candado; solo para quien ya lo tiene tomado (el webhook). */
export async function runTurnUnlocked(from: string, event: InboundEvent, hooks?: TurnHooks): Promise<TurnResult> {
  const session = await getSession(from);

  return traceTurn(from, event, session, async (trace) => {
    const sent: SendEffect[] = [];
    let currentEvent: HandleEvent = event;
    let currentSession = session;

    for (let pass = 1; pass <= MAX_PASSES; pass++) {
      const result = handle(currentSession, currentEvent);
      currentSession = result.session;
      for (const note of result.notes ?? []) trace.note(note);

      const queries = result.effects.filter(isQueryEffect);
      const sends = result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
      sent.push(...sends);
      if (hooks) {
        for (const effect of sends) await hooks.onSend(effect);
      }

      if (queries.length === 0) {
        await saveSession(from, currentSession);
        trace.complete({ session: currentSession, sentCount: sent.length });
        return { sent, session: currentSession };
      }
      if (queries.length > 1) {
        throw new Error("runTurn: handle() returned more than one query effect in a single pass");
      }

      const [queryEffect] = queries;
      if (hooks) await hooks.onWaitingForQuery();
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
      return configuredLlmProvider();
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
      return resolveDistritoAiDetailed(
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

export type { InboundEvent };
