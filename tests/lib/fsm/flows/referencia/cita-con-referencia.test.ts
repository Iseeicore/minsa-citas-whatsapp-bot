import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import { AUTHENTICATED_WAITING_STATES } from "@/lib/fsm/session/session-expiry-guard";
import type { HandlerResult, InboundEvent, ListRow, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { ANALYZING_CUENTA_TEXT, VERIFIED_ASK_DISTRITO_TEXT } from "@/lib/constants/textos/cita-identidad";
import { ASK_DISTRITO_TEXT } from "@/lib/constants/textos/cita-ubicacion";
import { EXIT_BUTTONS, EXIT_QUESTION_TEXT } from "@/lib/constants/textos/cita-salida";
import { RESPECT_REMINDER_TEXT } from "@/lib/constants/textos/seguridad";
import {
  REFERENCIA_ELECCION_BUTTONS,
  REFERENCIA_ELECCION_QUESTION_TEXT,
  REFERENCIA_SIN_CUPOS_BUTTONS,
  REFERENCIA_SIN_CUPOS_QUESTION_TEXT,
  REFERENCIA_SIN_OTRAS_TEXT,
  REFERENCIA_SIN_PROGRAMACION_TEXT,
  REFERENCIAS_CITA_LIST_TEXT,
  REFERENCIAS_LIST_TEXT,
} from "@/lib/constants/textos/referencia";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { QueryKind } from "@/lib/enums/query-kind";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { ReferenciaEleccionButtonId } from "@/lib/enums/referencia-eleccion-button-id";
import { ReferenciaSinCuposButtonId } from "@/lib/enums/referencia-sin-cupos-button-id";
import { ReferenciaConfirmButtonId } from "@/lib/enums/referencia-confirm-button-id";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "sandbox-cita-con-referencia";
const DNI = "12345678";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const queryResult = (queryKind: QueryKind, result: unknown): QueryResultEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind,
  result,
});

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const texts = (result: HandlerResult): string[] => sent(result).flatMap((effect) => (effect.kind === "send_text" ? [effect.text] : []));
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);
const buttons = (result: HandlerResult) => sent(result).find((effect) => effect.kind === "send_buttons");
const list = (result: HandlerResult) => {
  const found = sent(result).find((effect) => effect.kind === "send_interactive_list");
  return found?.kind === "send_interactive_list" ? found : undefined;
};
const listIds = (result: HandlerResult): string[] | undefined => list(result)?.rows.map((row: ListRow) => row.id);

const base: ReferenciaItem = {
  idReferencia: "a1",
  numero: "05006",
  fechaInicio: "25/04/2017 12:32",
  ipressOrigen: "CENTRO DE SALUD SAN GENARO DE VILLA",
  ipressDestino: "HOSPITAL MARIA AUXILIADORA",
  upsOrigen: "CONSULTA EXTERNA",
  upsDestino: "CONSULTA EXTERNA",
  codigoIpressDestino: "5987",
  codigoUpsDestino: "220000",
  estado: 7,
  estadoDescripcion: "PACIENTE CITADO",
};

const AGENDABLE_1: ReferenciaItem = { ...base, idReferencia: "a1", fechaInicio: "01/09/2024 09:00" };
const AGENDABLE_2: ReferenciaItem = {
  ...base,
  idReferencia: "a2",
  estado: 3,
  estadoDescripcion: "ACEPTADO",
  fechaInicio: "01/08/2024 09:00",
  ipressDestino: "HOSPITAL NACIONAL DOS DE MAYO",
  codigoIpressDestino: "6206",
};
const BLOQUEADA: ReferenciaItem = {
  ...base,
  idReferencia: "b1",
  estado: 1,
  estadoDescripcion: "REGISTRADO",
  fechaInicio: "01/10/2024 09:00",
  ipressDestino: "HOSPITAL NACIONAL ARZOBISPO LOAYZA",
};

const found = (data: ReferenciaItem[]) =>
  queryResult(QueryKind.LIST_REFERENCES, { statusReference: ReferenceStatus.FOUND, message: "", data });

function verifyPending(slots: Session["slots"] = {}): Session {
  return {
    state: SessionState.CITA_VERIFY_PENDING,
    slots: { [SlotKey.CITA_DNI_PENDING]: DNI, [SlotKey.CITA_TWOFA_ID]: "twofa", ...slots },
    counters: {},
  };
}

const verified = queryResult(QueryKind.VERIFY_CODE, { status: "verified", token: "token-real" });

function lookupPending(slots: Session["slots"] = {}): Session {
  return {
    state: SessionState.REFERENCIA_LOOKUP_PENDING,
    slots: {
      [SlotKey.CITA_BEARER]: "token-real",
      [SlotKey.CITA_DNI]: DNI,
      [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.CITA,
      [SlotKey.CITA_REFERENCIAS_CONSULTADAS]: true,
      ...slots,
    },
    counters: {},
  };
}

const eleccion = (data: ReferenciaItem[] = [BLOQUEADA, AGENDABLE_1, AGENDABLE_2]) => handle(lookupPending(), found(data)).session;

function fechaPending(selectedId: string, data: ReferenciaItem[], slots: Session["slots"] = {}): Session {
  const selected = data.find((item) => item.idReferencia === selectedId) ?? base;
  return {
    state: SessionState.CITA_FECHA_PENDING,
    slots: {
      [SlotKey.CITA_BEARER]: "token-real",
      [SlotKey.CITA_DNI]: DNI,
      [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.CITA,
      [SlotKey.CITA_REFERENCIAS_CONSULTADAS]: true,
      [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify(data),
      [SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]: selectedId,
      [SlotKey.CITA_COD_EESS]: selected.codigoIpressDestino,
      [SlotKey.CITA_ESPECIALIDAD_ID]: selected.codigoUpsDestino,
      [SlotKey.CITA_ESTABLECIMIENTO_NOMBRE]: selected.ipressDestino,
      [SlotKey.CITA_ESPECIALIDAD_NOMBRE]: selected.upsDestino,
      ...slots,
    },
    counters: {},
  };
}

const sinFechas = queryResult(QueryKind.LIST_FECHAS, { status: "empty" });

const REFERENCIA_SLOTS = [
  SlotKey.CITA_REFERENCIA_SELECCIONADA_ID,
  SlotKey.CITA_REFERENCIAS_DATA,
  SlotKey.CITA_REFERENCIAS_SIN_CUPOS,
  SlotKey.CITA_COD_EESS,
  SlotKey.CITA_ESPECIALIDAD_ID,
  SlotKey.CITA_ESTABLECIMIENTO_NOMBRE,
  SlotKey.CITA_ESPECIALIDAD_NOMBRE,
  SlotKey.POST_LOGIN_FLOW,
];

function expectCitaSinReferencia(result: HandlerResult) {
  expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
  expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("token-real");
  for (const slot of REFERENCIA_SLOTS) expect(result.session.slots[slot]).toBeUndefined();
  expect(queries(result)).toEqual([]);
}

describe("after the OTP in the cita: the referencias are looked up once", () => {
  it("a cita with no purpose looks them up with the cita purpose and the analyzing text", () => {
    const result = handle(verifyPending(), verified);

    expect(result.session.state).toBe(SessionState.REFERENCIA_LOOKUP_PENDING);
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.CITA);
    expect(result.session.slots[SlotKey.CITA_REFERENCIAS_CONSULTADAS]).toBe(true);
    expect(texts(result)).toEqual([ANALYZING_CUENTA_TEXT]);
    expect(queries(result)).toEqual([{ kind: QueryKind.LIST_REFERENCES, payload: { numeroDocumento: DNI, tipoDocumento: "01" } }]);
  });

  it("once looked up in this session, a later verification goes straight to the distrito", () => {
    const result = handle(verifyPending({ [SlotKey.CITA_REFERENCIAS_CONSULTADAS]: true }), verified);

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(texts(result)).toEqual([VERIFIED_ASK_DISTRITO_TEXT]);
    expect(queries(result)).toEqual([]);
  });

  it("a re-verification resumes where it was and never looks them up again", () => {
    const result = handle(
      verifyPending({ [SlotKey.CITA_RESUME_STATE]: SessionState.CITA_ESPECIALIDAD_PENDING, [SlotKey.CITA_UBIGEO]: "150132" }),
      verified,
    );

    expect(result.session.state).toBe(SessionState.CITA_ESPECIALIDAD_PENDING);
    expect(queries(result).map((effect) => effect.kind)).toEqual([QueryKind.LIST_ESPECIALIDADES]);
  });
});

describe("the lookup result in the cita", () => {
  it("with at least one referencia that allows booking: asks con o sin referencia", () => {
    const result = handle(lookupPending(), found([BLOQUEADA, AGENDABLE_1]));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_ELECCION);
    expect(buttons(result)).toEqual({
      kind: "send_buttons",
      text: REFERENCIA_ELECCION_QUESTION_TEXT,
      buttons: REFERENCIA_ELECCION_BUTTONS,
    });
    expect(texts(result)).toEqual([]);
    expect(result.session.slots[SlotKey.CITA_REFERENCIAS_DATA]).toBe(JSON.stringify([BLOQUEADA, AGENDABLE_1]));
  });

  it.each([
    ["only blocked referencias", { statusReference: ReferenceStatus.FOUND, message: "", data: [BLOQUEADA] }],
    ["no referencias", { statusReference: ReferenceStatus.EMPTY, message: "", data: [] }],
    ["a failed lookup", { statusReference: ReferenceStatus.ERROR, message: "", data: [] }],
  ])("with %s: goes on to the distrito without asking", (_caso, payload) => {
    const result = handle(lookupPending(), queryResult(QueryKind.LIST_REFERENCES, payload));

    expect(texts(result)).toEqual([VERIFIED_ASK_DISTRITO_TEXT]);
    expect(buttons(result)).toBeUndefined();
    expectCitaSinReferencia(result);
  });

  it("the consultar path is unchanged: it lists every referencia", () => {
    const result = handle(lookupPending({ [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS }), found([BLOQUEADA, AGENDABLE_1]));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(list(result)?.text).toBe(REFERENCIAS_LIST_TEXT);
    expect(listIds(result)).toEqual(["a1", "b1"]);
  });
});

describe("con o sin referencia", () => {
  it.each([
    ["tapping «Con referencia»", tap(ReferenciaEleccionButtonId.CON)],
    ["typing it", text("con referencia")],
    ["typing its number", text("1")],
  ])("%s lists only the referencias that allow booking", (_caso, event) => {
    const result = handle(eleccion(), event);

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(list(result)?.text).toBe(REFERENCIAS_CITA_LIST_TEXT);
    expect(listIds(result)).toEqual(["a1", "a2"]);
    expect(readOffered(result.session.slots)?.pageSize).toBe(5);
  });

  it.each([
    ["tapping «Sin referencia»", tap(ReferenciaEleccionButtonId.SIN)],
    ["typing it", text("sin referencia")],
  ])("%s goes on with the normal cita, keeping the session", (_caso, event) => {
    const result = handle(eleccion(), event);

    expect(texts(result)).toEqual([ASK_DISTRITO_TEXT]);
    expectCitaSinReferencia(result);
    expect(result.session.slots[SlotKey.CITA_REFERENCIAS_CONSULTADAS]).toBe(true);
  });

  it("an unclear answer asks again with the same buttons", () => {
    const result = handle(eleccion(), text("mmm"));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_ELECCION);
    expect(buttons(result)).toMatchObject({ text: REFERENCIA_ELECCION_QUESTION_TEXT, buttons: REFERENCIA_ELECCION_BUTTONS });
  });

  it("«No, ver otra» in the confirmation still lists only the ones that allow booking", () => {
    const listed = handle(eleccion(), tap(ReferenciaEleccionButtonId.CON)).session;
    const confirm = handle(listed, tap("a1")).session;

    const back = handle(confirm, tap(ReferenciaConfirmButtonId.NO));

    expect(listIds(back)).toEqual(["a1", "a2"]);
  });

  it("confirming books with the referencia's destination and keeps the cita purpose", () => {
    const listed = handle(eleccion(), tap(ReferenciaEleccionButtonId.CON)).session;
    const confirm = handle(listed, tap("a2")).session;

    const result = handle(confirm, tap(ReferenciaConfirmButtonId.YES));

    expect(result.session.state).toBe(SessionState.CITA_FECHA_PENDING);
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe("a2");
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.CITA);
    expect(queries(result)).toEqual([{ kind: QueryKind.LIST_FECHAS, payload: { codEess: "6206", especialidadId: "220000" } }]);
  });
});

describe("a referencia with no programación", () => {
  const DATA = [BLOQUEADA, AGENDABLE_1, AGENDABLE_2];

  it("offers to see another referencia or book without one, keeping the session", () => {
    const result = handle(fechaPending("a1", DATA), sinFechas);

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SIN_CUPOS);
    expect(buttons(result)).toEqual({
      kind: "send_buttons",
      text: REFERENCIA_SIN_CUPOS_QUESTION_TEXT,
      buttons: REFERENCIA_SIN_CUPOS_BUTTONS,
    });
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("token-real");
    expect(result.session.slots[SlotKey.CITA_REFERENCIAS_DATA]).toBe(JSON.stringify(DATA));
    expect(result.session.slots[SlotKey.CITA_REFERENCIAS_SIN_CUPOS]).toBe(JSON.stringify(["a1"]));
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBeUndefined();
  });

  it("«Ver otra referencia» lists them again with no new lookup, the one without days greyed out", () => {
    const sinCupos = handle(fechaPending("a1", DATA), sinFechas).session;

    const result = handle(sinCupos, tap(ReferenciaSinCuposButtonId.VER_OTRA));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(queries(result)).toEqual([]);
    expect(listIds(result)).toEqual(["a2", "a1"]);
    expect(list(result)?.rows.find((row) => row.id === "a1")).toMatchObject({ disabled: true });
    expect(list(result)?.rows.find((row) => row.id === "a1")?.description).toContain("Sin programación");
  });

  it("choosing the one without days again says so and shows the same list", () => {
    const sinCupos = handle(fechaPending("a1", DATA), sinFechas).session;
    const listed = handle(sinCupos, tap(ReferenciaSinCuposButtonId.VER_OTRA)).session;

    const result = handle(listed, tap("a1"));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(texts(result)).toEqual([REFERENCIA_SIN_PROGRAMACION_TEXT]);
    expect(listIds(result)).toEqual(["a2", "a1"]);
  });

  it("«Cita sin referencia» goes on with the normal cita, keeping the session", () => {
    const sinCupos = handle(fechaPending("a1", DATA), sinFechas).session;

    const result = handle(sinCupos, tap(ReferenciaSinCuposButtonId.SIN_REFERENCIA));

    expect(texts(result)).toEqual([ASK_DISTRITO_TEXT]);
    expectCitaSinReferencia(result);
  });

  it("when no other referencia allows booking, goes straight to the cita without referencia", () => {
    const result = handle(fechaPending("a1", [BLOQUEADA, AGENDABLE_1]), sinFechas);

    expect(texts(result)).toEqual([REFERENCIA_SIN_OTRAS_TEXT, ASK_DISTRITO_TEXT]);
    expect(buttons(result)).toBeUndefined();
    expectCitaSinReferencia(result);
  });

  it("in the consultar path it also offers both options and lists every referencia again", () => {
    const consultar = fechaPending("a1", DATA);
    delete consultar.slots[SlotKey.POST_LOGIN_FLOW];

    const sinCupos = handle(consultar, sinFechas);
    expect(sinCupos.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SIN_CUPOS);

    const result = handle(sinCupos.session, tap(ReferenciaSinCuposButtonId.VER_OTRA));
    expect(list(result)?.text).toBe(REFERENCIAS_LIST_TEXT);
    expect(listIds(result)).toEqual(["a2", "b1", "a1"]);
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
  });

  it("an unclear answer asks again with the same buttons", () => {
    const sinCupos = handle(fechaPending("a1", DATA), sinFechas).session;

    const result = handle(sinCupos, text("mmm"));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SIN_CUPOS);
    expect(buttons(result)).toMatchObject({ text: REFERENCIA_SIN_CUPOS_QUESTION_TEXT, buttons: REFERENCIA_SIN_CUPOS_BUTTONS });
  });
});

describe("the new questions behave like the other steps", () => {
  const states = (): Array<[string, Session, string]> => {
    const DATA = [BLOQUEADA, AGENDABLE_1, AGENDABLE_2];
    return [
      ["con o sin referencia", eleccion(), REFERENCIA_ELECCION_QUESTION_TEXT],
      ["sin programación", handle(fechaPending("a1", DATA), sinFechas).session, REFERENCIA_SIN_CUPOS_QUESTION_TEXT],
    ];
  };

  it.each([0, 1])("a wish to leave asks for confirmation and declining asks the question again (%i)", (index) => {
    const [, session, question] = states()[index];

    const leaving = handle(session, text("quiero salir"));
    expect(leaving.session.state).toBe(SessionState.CITA_AWAITING_EXIT_CONFIRM);
    expect(sent(leaving)).toEqual([{ kind: "send_buttons", text: EXIT_QUESTION_TEXT, buttons: EXIT_BUTTONS }]);

    const back = handle(leaving.session, text("no"));
    expect(back.session.state).toBe(session.state);
    expect(buttons(back)).toMatchObject({ text: question });
  });

  it.each([0, 1])("an insult reminds respect and asks the question again (%i)", (index) => {
    const [, session, question] = states()[index];

    const result = handle(session, text("cojudos"));

    expect(result.session.state).toBe(session.state);
    expect(texts(result)[0]).toBe(RESPECT_REMINDER_TEXT);
    expect(buttons(result)).toMatchObject({ text: question });
  });

  it("both questions are guarded by the session expiry", () => {
    expect(AUTHENTICATED_WAITING_STATES).toContain(SessionState.CITA_AWAITING_REFERENCIA_ELECCION);
    expect(AUTHENTICATED_WAITING_STATES).toContain(SessionState.CITA_AWAITING_REFERENCIA_SIN_CUPOS);
  });
});
