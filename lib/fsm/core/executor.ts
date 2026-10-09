import { resolveDistritoAiDetailed } from "@/lib/fsm/parsing/ai/distrito";
import { resolveFechaAi, type FechaAiOption } from "@/lib/fsm/parsing/ai/fecha";
import { analyzeMainMenuIntent } from "@/lib/fsm/parsing/ai/main-menu-intent";
import { extractSelectionHints } from "@/lib/fsm/parsing/ai/selection-hints";
import { analyzeFotoIntent } from "@/lib/fsm/parsing/ai/incidencia-foto-intent";
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
import type { TipoDocumento } from "@/lib/enums/tipo-documento";
import { listReferences } from "@/lib/integrations/minsa/references";
import { reniecLookup } from "@/lib/integrations/reniec";
import { traceTurn } from "@/lib/observability/tracer";
import type { ExternalService } from "@/lib/observability/types";
import { getSession, saveSession } from "@/lib/fsm/session/session-store";
import { withTurnLock, type TurnLock } from "@/lib/fsm/session/turn-lock";
import { QueryKind } from "@/lib/enums/query-kind";
import type {
  HandleEvent,
  HandlerResult,
  InboundEvent,
  QueryEffect,
  QueryResultEvent,
  SendEffect,
  Session,
} from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

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
const FRESH_SESSION: Session = { state: SessionState.MAIN_MENU, slots: {}, counters: {} };

export function runTurn(from: string, event: InboundEvent): Promise<TurnResult> {
  return withTurnLock(from, () => runTurnUnlocked(from, event));
}

export function createRunTurn(lock: TurnLock) {
  return (from: string, event: InboundEvent): Promise<TurnResult> =>
    lock(from, () => runTurnUnlocked(from, event));
}

/**
 * Ejecuta el turno sin tomar el candado; solo para quien ya lo tiene tomado (el webhook). Con `start` el primer paso ya viene
 * calculado (el primer contacto, que no tiene sesión): sus consultas se resuelven igual que las de cualquier turno.
 */
export async function runTurnUnlocked(
  from: string,
  event: InboundEvent,
  hooks?: TurnHooks,
  start?: HandlerResult,
): Promise<TurnResult> {
  const session = start ? FRESH_SESSION : await getSession(from);

  return traceTurn(from, event, session, async (trace) => {
    const sent: SendEffect[] = [];
    let currentEvent: HandleEvent = event;
    let currentSession = session;

    for (let pass = 1; pass <= MAX_PASSES; pass++) {
      const result = pass === 1 && start ? start : handle(currentSession, currentEvent);
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
    case QueryKind.RENIEC_LOOKUP:
      return "reniec";
    case QueryKind.INCIDENCIA_REGISTER:
    case QueryKind.BUSCAR_ESTABLECIMIENTO:
      return "database";
    case QueryKind.ANALYZE_MAIN_MENU_INTENT:
    case QueryKind.RESOLVE_DISTRITO_AI:
    case QueryKind.RESOLVE_FECHA_AI:
    case QueryKind.EXTRACT_SELECTION_HINTS:
    case QueryKind.ANALYZE_INCIDENCIA_FOTO_INTENT:
      return configuredLlmProvider();
    default:
      return "minsa";
  }
}

async function resolveQuery(effect: QueryEffect, session: Session): Promise<unknown> {
  const bearer = String(session.slots[SlotKey.CITA_BEARER] ?? "");

  switch (effect.kind) {
    case QueryKind.RENIEC_LOOKUP:
      return reniecLookup(String(effect.payload.dni ?? ""));

    case QueryKind.INCIDENCIA_REGISTER: {
      const { registrarIncidencia } = await import("@/lib/recepcion/servicio");
      return registrarIncidencia(effect.payload.submission);
    }

    case QueryKind.VALIDATE_USER:
      return validateUser(String(effect.payload.numeroDocumento ?? ""), effect.payload.tipoDocumento as TipoDocumento);

    case QueryKind.VERIFY_CODE:
      return verifyCode(String(effect.payload.twofaId ?? ""), String(effect.payload.code ?? ""));

    case QueryKind.ANALYZE_MAIN_MENU_INTENT:
      return analyzeMainMenuIntent(String(effect.payload.text ?? ""));

    case QueryKind.RESOLVE_DISTRITO_AI:
      return resolveDistritoAiDetailed(
        String(effect.payload.distritoText ?? ""),
        effect.payload.contextText as string | undefined,
      );

    case QueryKind.RESOLVE_FECHA_AI:
      return resolveFechaAi(
        String(effect.payload.text ?? ""),
        String(effect.payload.today ?? ""),
        (effect.payload.options as FechaAiOption[] | undefined) ?? [],
      );

    case QueryKind.EXTRACT_SELECTION_HINTS:
      return extractSelectionHints(String(effect.payload.step ?? ""), String(effect.payload.text ?? ""));

    case QueryKind.SEARCH_UBIGEO:
      return searchUbigeo(
        String(effect.payload.departamento ?? ""),
        String(effect.payload.provincia ?? ""),
        String(effect.payload.distrito ?? ""),
        bearer,
      );

    case QueryKind.LIST_ESPECIALIDADES:
      return listEspecialidades(String(effect.payload.ubigeo ?? ""), bearer);

    case QueryKind.LIST_ESTABLECIMIENTOS:
      return listEstablecimientos(
        String(effect.payload.especialidadId ?? ""),
        String(effect.payload.ubigeo ?? ""),
        bearer,
        Number(effect.payload.page ?? 1),
      );

    case QueryKind.LIST_FECHAS:
      return listFechas(
        String(effect.payload.codEess ?? ""),
        String(effect.payload.especialidadId ?? ""),
        bearer,
      );

    case QueryKind.LIST_HORAS:
      return listHoras(
        String(effect.payload.codEess ?? ""),
        String(effect.payload.especialidadId ?? ""),
        formatFechaForApi(String(effect.payload.fecha ?? "")),
        bearer,
      );

    case QueryKind.BOOK_APPOINTMENT:
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

    case QueryKind.LIST_REFERENCES:
      return listReferences(String(effect.payload.numeroDocumento ?? ""), String(effect.payload.tipoDocumento ?? ""));

    case QueryKind.ANALYZE_INCIDENCIA_FOTO_INTENT:
      return analyzeFotoIntent(String(effect.payload.text ?? ""));

    case QueryKind.BUSCAR_ESTABLECIMIENTO: {
      const { buscarEstablecimiento } = await import("@/lib/establecimientos/buscar");
      return buscarEstablecimiento(effect.payload);
    }

    default:
      throw new Error(`resolveQuery: unhandled query kind "${effect.kind}"`);
  }
}

export type { InboundEvent };
