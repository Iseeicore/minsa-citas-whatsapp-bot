import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandleEvent, HandlerResult, Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import {
  CITA_REFERENCIA_CHANGE_BUTTON,
  CITA_REFERENCIA_MODE_BUTTONS,
  CITA_REFERENCIA_RETRY_BUTTONS,
} from "@/lib/constants/textos/cita-referencia";
import { AppointmentMode } from "@/lib/enums/appointment-mode";
import { CatalogStatus } from "@/lib/enums/catalog-status";
import { CitaReferenciaButtonId } from "@/lib/enums/cita-referencia-button-id";
import { HoraConfirmButtonId } from "@/lib/enums/hora-confirm-button-id";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { QueryKind } from "@/lib/enums/query-kind";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";
import { SendType } from "@/lib/enums/send-type";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { VerifyCodeStatus } from "@/lib/enums/verify-code-status";

const FROM = "51900000001";
const NOW = Date.parse("2026-10-21T15:00:00Z");
const REFERENCES: ReferenciaItem[] = [3, 5, 7].map((estado, index) => ({
  idReferencia: `synthetic-reference-${index}`,
  numero: `0000${index}`,
  fechaInicio: "20/10/2026 10:00",
  ipressOrigen: "CENTRO SIMULADO",
  ipressDestino: `HOSPITAL SIMULADO ${index}`,
  upsOrigen: "CONSULTA EXTERNA",
  upsDestino: ["CARDIOLOGÍA", "PEDIATRÍA", "ODONTOLOGÍA"][index],
  codigoIpressDestino: `eess-${index}`,
  codigoUpsDestino: `ups-${index}`,
  estado,
}));
const tap = (listId: string): HandleEvent => ({ from: FROM, channel: SessionChannel.WHATSAPP, type: InboundEventType.LIST, listId });
const query = (queryKind: QueryKind, result: unknown): HandleEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind,
  result,
});
const turn = (session: Session, event: HandleEvent) => handle(session, event, NOW);
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);
const buttons = (result: HandlerResult) => result.effects.find((effect) => effect.kind === SendType.BUTTONS);
const list = (result: HandlerResult) => result.effects.find((effect) => effect.kind === SendType.INTERACTIVE_LIST);

function verified(): HandlerResult {
  return turn(
    {
      state: SessionState.CITA_VERIFY_PENDING,
      channel: SessionChannel.WHATSAPP,
      slots: { [SlotKey.CITA_DNI_PENDING]: "12345678" },
      counters: {},
    },
    query(QueryKind.VERIFY_CODE, { status: VerifyCodeStatus.VERIFIED, token: "synthetic-token" }),
  );
}

function mode(): HandlerResult {
  return turn(
    verified().session,
    query(QueryKind.LIST_REFERENCES, { statusReference: ReferenceStatus.FOUND, data: REFERENCES, message: "" }),
  );
}

function selected(index = 0): HandlerResult {
  const offered = turn(mode().session, tap(CitaReferenciaButtonId.REFERENCE));
  return turn(offered.session, tap(REFERENCES[index].idReferencia));
}

function dates(): HandlerResult {
  return turn(
    selected().session,
    query(QueryKind.LIST_FECHAS, {
      status: CatalogStatus.FOUND,
      items: [
        { fechaCupo: "01/01/2099", cantidadCupos: 0 },
        { fechaCupo: "02/01/2099", cantidadCupos: 2 },
        { fechaCupo: "03/01/2099", cantidadCupos: 1 },
      ],
    }),
  );
}

function hours(): HandlerResult {
  const chosen = turn(dates().session, tap("02/01/2099"));
  return turn(
    chosen.session,
    query(QueryKind.LIST_HORAS, {
      status: CatalogStatus.FOUND,
      items: [
        { horaInicio: "08:00", horaFin: "08:30", cantidadCupos: 0 },
        { horaInicio: "09:00", horaFin: "09:30", cantidadCupos: 2 },
        { horaInicio: "10:00", horaFin: "10:30", cantidadCupos: 1 },
      ],
    }),
  );
}

describe("WhatsApp agenda con referencias mediante el mismo recorrido que el chat web", () => {
  it("tras OTP consulta primero las referencias y ofrece ambas modalidades conservando los tres estados MINSA", () => {
    expect(queries(verified())).toEqual([
      { kind: QueryKind.LIST_REFERENCES, payload: { numeroDocumento: "12345678", tipoDocumento: "01" } },
    ]);
    const result = mode();
    expect(result.session.channel).toBe(SessionChannel.WHATSAPP);
    expect(buttons(result)?.buttons).toEqual(CITA_REFERENCIA_MODE_BUTTONS);
    expect(JSON.parse(String(result.session.slots[SlotKey.CITA_REFERENCIAS_DATA]))).toEqual(REFERENCES);
  });

  it("sin referencias inicia cita nueva y ante error permite reintentar sin afirmar que no existen", () => {
    const empty = turn(
      verified().session,
      query(QueryKind.LIST_REFERENCES, { statusReference: ReferenceStatus.EMPTY, data: [], message: "" }),
    );
    expect(empty.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(empty.session.slots[SlotKey.CITA_APPOINTMENT_MODE]).toBe(AppointmentMode.NEW);
    const failed = turn(
      verified().session,
      query(QueryKind.LIST_REFERENCES, { statusReference: ReferenceStatus.ERROR, data: [], message: "" }),
    );
    expect(failed.session.state).toBe(SessionState.REFERENCIA_AWAITING_LOOKUP_RETRY);
    expect(buttons(failed)?.buttons).toEqual(CITA_REFERENCIA_RETRY_BUTTONS);
    expect(queries(turn(failed.session, tap(CitaReferenciaButtonId.RETRY)))[0]?.kind).toBe(QueryKind.LIST_REFERENCES);
  });

  it.each([0, 1, 2])("seleccionar la referencia %s consulta su destino exacto sin confirmación extra ni reservas", (index) => {
    const result = selected(index);
    expect(result.session.state).toBe(SessionState.CITA_FECHA_PENDING);
    expect(queries(result)).toEqual([
      {
        kind: QueryKind.LIST_FECHAS,
        payload: {
          codEess: REFERENCES[index].codigoIpressDestino,
          especialidadId: REFERENCES[index].codigoUpsDestino,
        },
      },
    ]);
    expect(result.effects.some((effect) => effect.kind === SendType.BUTTONS)).toBe(false);
  });

  it("fechas y horarios muestran solo cupos positivos con Cambiar referencia en la misma lista", () => {
    expect(list(dates())?.rows.map((row) => row.id)).toEqual(["02/01/2099", "03/01/2099"]);
    expect(list(hours())?.rows.map((row) => row.id)).toEqual(["09:00|09:30", "10:00|10:30"]);
    expect(list(dates())?.actions).toContainEqual(CITA_REFERENCIA_CHANGE_BUTTON);
    expect(list(hours())?.actions).toContainEqual(CITA_REFERENCIA_CHANGE_BUTTON);
    const result = turn(dates().session, tap("02/01/2099"));
    expect(queries(result)).toEqual([
      { kind: QueryKind.LIST_HORAS, payload: { codEess: "eess-0", especialidadId: "ups-0", fecha: "02/01/2099" } },
    ]);
  });

  it("no permite reservar un horario sin cupo mediante un identificador escrito o antiguo", () => {
    const result = turn(hours().session, tap("08:00|08:30"));
    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe(SessionState.CITA_AWAITING_HORA_SELECT);
  });

  it("exige resumen y confirmación final antes de emitir una única orden de reserva con referenciaId", () => {
    const asked = turn(hours().session, tap("09:00|09:30"));
    expect(asked.session.state).toBe(SessionState.CITA_AWAITING_HORA_CONFIRM);
    expect(queries(asked)).toHaveLength(0);
    const text = asked.effects.flatMap((effect) => (effect.kind === SendType.TEXT ? [effect.text] : [])).join(" ");
    expect(text).toContain("Referencia: 00000");
    expect(text).toContain("Especialidad: CARDIOLOGÍA");
    expect(text).toContain("Establecimiento: HOSPITAL SIMULADO 0");
    expect(buttons(asked)?.buttons).toContainEqual(CITA_REFERENCIA_CHANGE_BUTTON);
    const result = turn(asked.session, tap(HoraConfirmButtonId.YES));
    expect(queries(result)).toEqual([
      {
        kind: QueryKind.BOOK_APPOINTMENT,
        payload: {
          codigoRenipress: "eess-0",
          codigoUps: "ups-0",
          fechaCita: "02/01/2099",
          horaInicio: "09:00",
          numeroDocumentoPaciente: "12345678",
          referenciaId: REFERENCES[0].idReferencia,
        },
      },
    ]);
  });

  it.each([SessionState.CITA_AWAITING_FECHA_SELECT, SessionState.CITA_AWAITING_HORA_SELECT, SessionState.CITA_AWAITING_HORA_CONFIRM])(
    "Cambiar referencia desde %s borra disponibilidad anterior y consulta otra especialidad sin repetir OTP",
    (state) => {
      const asked =
        state === SessionState.CITA_AWAITING_FECHA_SELECT
          ? dates()
          : state === SessionState.CITA_AWAITING_HORA_SELECT
            ? hours()
            : turn(hours().session, tap("09:00|09:30"));
      const before = structuredClone(asked.session);
      const changed = turn(asked.session, tap(ReferenciaActionButtonId.CHANGE));
      expect(changed.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
      expect(changed.session.slots[SlotKey.CITA_FECHA]).toBeUndefined();
      expect(changed.session.slots[SlotKey.CITA_HORA_CONFIRM_ID]).toBeUndefined();
      expect(changed.session.slots[SlotKey.CITA_COD_EESS]).toBeUndefined();
      expect(changed.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.CITA_REFERENCIAS);
      expect(changed.session.slots[SlotKey.CITA_BEARER]).toBe("synthetic-token");
      expect(queries(turn(changed.session, tap(REFERENCES[1].idReferencia)))).toEqual([
        { kind: QueryKind.LIST_FECHAS, payload: { codEess: "eess-1", especialidadId: "ups-1" } },
      ]);
      expect(asked.session).toEqual(before);
    },
  );
});
