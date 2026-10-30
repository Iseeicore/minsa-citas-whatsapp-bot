import { resolveDistritoAiDetailed } from "@/lib/fsm/parsing/ai/distrito";
import { resolveFechaAi, type FechaAiOption } from "@/lib/fsm/parsing/ai/fecha";
import { analyzeMainMenuIntent } from "@/lib/fsm/parsing/ai/main-menu-intent";
import { extractSelectionHints } from "@/lib/fsm/parsing/ai/selection-hints";
import { analyzeFotoIntent } from "@/lib/fsm/parsing/ai/incidencia-foto-intent";
import { configuredLlmProvider } from "@/lib/fsm/parsing/ai/llm-registry";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { bookAppointment } from "@/lib/integrations/minsa/booking";
import { listEspecialidades, listEstablecimientos, listFechas, listHoras, searchUbigeo } from "@/lib/integrations/minsa/catalog";
import { formatFechaForApi, formatHoraCita } from "@/lib/integrations/minsa/format";
import { validateUser, verifyCode } from "@/lib/integrations/minsa/identity";
import type { TipoDocumento } from "@/lib/enums/tipo-documento";
import { listReferences } from "@/lib/integrations/minsa/references";
import { traceTurn } from "@/lib/observability/tracer";
import type { ExternalService } from "@/lib/observability/types";
import { getSession, saveSession } from "@/lib/fsm/session/session-store";
import { withTurnLock, type TurnLock } from "@/lib/fsm/session/turn-lock";
import { serviceCatalog } from "@/lib/services/service-catalog";
import { QueryKind } from "@/lib/enums/query-kind";
import type {
  HandleEvent,
  HandlerResult,
  InboundEvent,
  QueryEffect,
  QueryResultEvent,
  SendEffect,
  SendOutcome,
  Session,
} from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { SessionChannel } from "@/lib/enums/session-channel";
import { slotText, payloadText } from "@/lib/fsm/core/slot-readers";
import { MAX_PASSES } from "@/lib/constants/limits/engine";
import { MultipleQueryEffectsError } from "@/lib/errors/multiple-query-effects-error";
import { MaxPassesExceededError } from "@/lib/errors/max-passes-exceeded-error";
import { UnhandledQueryKindError } from "@/lib/errors/unhandled-query-kind-error";
import { DisabledServiceQueryError } from "@/lib/errors/disabled-service-query-error";
import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";
import {
  acceptTap,
  consumeOnStateChange,
  isStaleTap,
  isUndelivered,
  readInteractiveTracking,
  trackSent,
  withInteractiveTracking,
} from "@/lib/fsm/core/interactive-reply";

export type TurnResult = {
  sent: SendEffect[];
  session: Session;
};

export type TurnHooks = {
  onSend(effect: SendEffect): Promise<SendOutcome>;
  onWaitingForQuery(): Promise<void>;
  onAccepted?(): Promise<void>;
};

const FRESH_SESSION: Session = { state: SessionState.MAIN_MENU, slots: {}, counters: {} };

export function runTurn(from: string, event: InboundEvent, hooks?: TurnHooks): Promise<TurnResult> {
  return withTurnLock(from, () => runTurnUnlocked(from, event, hooks));
}

export function createRunTurn(lock: TurnLock) {
  return (from: string, event: InboundEvent): Promise<TurnResult> => lock(from, () => runTurnUnlocked(from, event));
}

export async function runTurnUnlocked(from: string, event: InboundEvent, hooks?: TurnHooks, start?: HandlerResult): Promise<TurnResult> {
  const session = start ? FRESH_SESSION : await getSession(from);

  if (isStaleTap(session, event)) {
    logger.info("inbound.stale_tap", { waId: tail(from), type: event.type, state: session.state, channel: event.channel });
    return { sent: [], session };
  }
  if (hooks?.onAccepted) await hooks.onAccepted();

  return traceTurn(from, event, session, async (trace) => {
    const sent: SendEffect[] = [];
    let currentEvent: HandleEvent = event;
    let currentSession = session;
    const startTracking = readInteractiveTracking(session.slots);
    let tracking = acceptTap(startTracking, event);

    for (let pass = 1; pass <= MAX_PASSES; pass++) {
      const result = pass === 1 && start ? start : handle(currentSession, currentEvent);
      currentSession = result.session;
      for (const note of result.notes ?? []) trace.note(note);

      const queries = result.effects.filter(isQueryEffect);
      const sends = result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
      sent.push(...sends);
      if (hooks) {
        for (const effect of sends) {
          const outcome = await hooks.onSend(effect);
          if (isUndelivered(outcome))
            trace.note({ kind: "send_failed", level: "warn", detail: { effect: effect.kind, outcome: outcome.kind } });
          tracking = trackSent(tracking, effect, outcome);
        }
      }

      if (queries.length === 0) {
        const settled = consumeOnStateChange(startTracking, tracking, currentSession.state !== session.state);
        currentSession = withInteractiveTracking(currentSession, settled);
        await saveSession(from, currentSession);
        trace.complete({ session: currentSession, sentCount: sent.length });
        return { sent, session: currentSession };
      }
      if (queries.length > 1) {
        throw new MultipleQueryEffectsError(queries.length);
      }

      const [queryEffect] = queries;
      if (hooks) await hooks.onWaitingForQuery();
      const queryResult = await trace.external(serviceFor(queryEffect.kind), queryEffect.kind, () =>
        resolveQuery(queryEffect, currentSession, from),
      );

      const resultEvent: QueryResultEvent = {
        from,
        type: InternalEventType.QUERY_RESULT,
        queryKind: queryEffect.kind,
        result: queryResult,
        channel: event.channel,
      };
      currentEvent = resultEvent;
    }

    throw new MaxPassesExceededError(MAX_PASSES);
  });
}

function serviceFor(kind: QueryEffect["kind"]): ExternalService {
  switch (kind) {
    case QueryKind.INCIDENCIA_REGISTER:
    case QueryKind.CONSULTAR_INCIDENCIA:
    case QueryKind.LISTAR_INCIDENCIAS:
    case QueryKind.BUSCAR_ESTABLECIMIENTO:
    case QueryKind.VERIFICAR_CONSENTIMIENTO:
    case QueryKind.REGISTRAR_CONSENTIMIENTO:
    case QueryKind.REGISTRAR_ACEPTACION_TERMINOS:
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

async function resolveQuery(effect: QueryEffect, session: Session, from: string): Promise<unknown> {
  const bearer = slotText(session.slots, SlotKey.CITA_BEARER);

  const owner = serviceCatalog.forQuery(effect.kind);
  if (owner && !owner.isEnabled()) throw new DisabledServiceQueryError(effect.kind, owner.id);

  switch (effect.kind) {
    case QueryKind.INCIDENCIA_REGISTER: {
      const [{ registrarIncidencia }, { crearAlmacenEvidencias }] = await Promise.all([
        import("@/lib/recepcion/servicio"),
        import("@/lib/recepcion/imagenes/almacen"),
      ]);
      return registrarIncidencia(effect.payload.submission, crearAlmacenEvidencias());
    }

    case QueryKind.CONSULTAR_INCIDENCIA: {
      const { consultarIncidencia } = await import("@/lib/recepcion/consulta");
      const codigo = payloadText(effect.payload, "codigo");
      return consultarIncidencia(
        codigo,
        effect.payload.canal === SessionChannel.WEB
          ? { canal: SessionChannel.WEB, dni: payloadText(effect.payload, "dni") }
          : { canal: SessionChannel.WHATSAPP, waId: from },
      );
    }

    case QueryKind.LISTAR_INCIDENCIAS: {
      const { listarIncidencias } = await import("@/lib/recepcion/consulta");
      return listarIncidencias(
        effect.payload.canal === SessionChannel.WEB
          ? { canal: SessionChannel.WEB, dni: payloadText(effect.payload, "dni") }
          : { canal: SessionChannel.WHATSAPP, waId: from },
      );
    }

    case QueryKind.VERIFICAR_CONSENTIMIENTO: {
      const [{ tieneConsentimientoAceptado }, { getConsentimientoStore }] = await Promise.all([
        import("@/lib/recepcion/repositorio"),
        import("@/lib/composition/stores"),
      ]);
      return { aceptado: await tieneConsentimientoAceptado(from, getConsentimientoStore()) };
    }

    case QueryKind.REGISTRAR_CONSENTIMIENTO: {
      const [{ marcarConsentimientoAceptado }, { getConsentimientoStore }] = await Promise.all([
        import("@/lib/recepcion/repositorio"),
        import("@/lib/composition/stores"),
      ]);
      await marcarConsentimientoAceptado(from, getConsentimientoStore());
      return { ok: true };
    }

    case QueryKind.REGISTRAR_ACEPTACION_TERMINOS: {
      const [{ saveAceptacionTerminos }, { getAceptacionTerminosStore }] = await Promise.all([
        import("@/lib/terminos/aceptacion-terminos"),
        import("@/lib/composition/stores"),
      ]);
      return saveAceptacionTerminos(
        {
          waId: from,
          canal: effect.payload.canal === SessionChannel.WEB ? SessionChannel.WEB : SessionChannel.WHATSAPP,
          version: payloadText(effect.payload, "version"),
        },
        getAceptacionTerminosStore(),
      );
    }

    case QueryKind.VALIDATE_USER:
      return validateUser(payloadText(effect.payload, "numeroDocumento"), effect.payload.tipoDocumento as TipoDocumento);

    case QueryKind.VERIFY_CODE:
      return verifyCode(payloadText(effect.payload, "twofaId"), payloadText(effect.payload, "code"));

    case QueryKind.ANALYZE_MAIN_MENU_INTENT:
      return analyzeMainMenuIntent(payloadText(effect.payload, "text"));

    case QueryKind.RESOLVE_DISTRITO_AI:
      return resolveDistritoAiDetailed(payloadText(effect.payload, "distritoText"), effect.payload.contextText as string | undefined);

    case QueryKind.RESOLVE_FECHA_AI:
      return resolveFechaAi(
        payloadText(effect.payload, "text"),
        payloadText(effect.payload, "today"),
        (effect.payload.options as FechaAiOption[] | undefined) ?? [],
      );

    case QueryKind.EXTRACT_SELECTION_HINTS:
      return extractSelectionHints(payloadText(effect.payload, "step"), payloadText(effect.payload, "text"));

    case QueryKind.SEARCH_UBIGEO:
      return searchUbigeo(
        payloadText(effect.payload, "departamento"),
        payloadText(effect.payload, "provincia"),
        payloadText(effect.payload, "distrito"),
        bearer,
      );

    case QueryKind.LIST_ESPECIALIDADES:
      return listEspecialidades(payloadText(effect.payload, "ubigeo"), bearer);

    case QueryKind.LIST_ESTABLECIMIENTOS:
      return listEstablecimientos(
        payloadText(effect.payload, "especialidadId"),
        payloadText(effect.payload, "ubigeo"),
        bearer,
        Number(effect.payload.page ?? 1),
      );

    case QueryKind.LIST_FECHAS:
      return listFechas(payloadText(effect.payload, "codEess"), payloadText(effect.payload, "especialidadId"), bearer);

    case QueryKind.LIST_HORAS:
      return listHoras(
        payloadText(effect.payload, "codEess"),
        payloadText(effect.payload, "especialidadId"),
        formatFechaForApi(payloadText(effect.payload, "fecha")),
        bearer,
      );

    case QueryKind.BOOK_APPOINTMENT:
      return bookAppointment(
        {
          codigoRenipress: payloadText(effect.payload, "codigoRenipress"),
          codigoUps: payloadText(effect.payload, "codigoUps"),
          fechaCita: formatFechaForApi(payloadText(effect.payload, "fechaCita")),
          horaCita: formatHoraCita(payloadText(effect.payload, "horaInicio")),
          numeroDocumentoPaciente: payloadText(effect.payload, "numeroDocumentoPaciente"),
          ...(effect.payload.referenciaId ? { referenciaId: String(effect.payload.referenciaId) } : {}),
        },
        bearer,
      );

    case QueryKind.LIST_REFERENCES:
      return listReferences(payloadText(effect.payload, "numeroDocumento"), payloadText(effect.payload, "tipoDocumento"), bearer);

    case QueryKind.ANALYZE_INCIDENCIA_FOTO_INTENT:
      return analyzeFotoIntent(payloadText(effect.payload, "text"));

    case QueryKind.BUSCAR_ESTABLECIMIENTO: {
      const { buscarEstablecimiento } = await import("@/lib/establecimientos/buscar");
      return buscarEstablecimiento(effect.payload);
    }

    default:
      throw new UnhandledQueryKindError(effect.kind);
  }
}

export type { InboundEvent };
