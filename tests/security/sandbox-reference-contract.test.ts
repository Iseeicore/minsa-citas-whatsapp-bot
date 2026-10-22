import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { CITA_REFERENCIA_LOOKUP_ERROR_TEXT, CITA_REFERENCIA_NONE_TEXT } from "@/lib/constants/textos/cita-referencia";
import {
  REFERENCIA_ESPECIALIDAD_NO_INFORMADA_TEXT,
  REFERENCIA_SIN_PROGRAMACION_ETIQUETA,
  REFERENCIA_SIN_PROGRAMACION_TEXT,
} from "@/lib/constants/textos/cita-reserva";
import { REFERENCIA_GOODBYE_TEXT } from "@/lib/constants/textos/referencia";
import { CitaReferenciaButtonId } from "@/lib/enums/cita-referencia-button-id";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import { HoraConfirmButtonId } from "@/lib/enums/hora-confirm-button-id";
import { HoraPageButtonId } from "@/lib/enums/hora-page-button-id";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";
import { OtherReferenciaCitaButtonId } from "@/lib/enums/other-referencia-cita-button-id";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

const mocks = vi.hoisted(() => ({ sessions: new Map<string, Session>() }));

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) => {
    const persisted = structuredClone(mocks.sessions.get(from));
    if (persisted) delete persisted.channel;
    return persisted;
  },
  saveSession: async (from: string, session: Session) => {
    mocks.sessions.set(from, structuredClone(session));
  },
  sessionRowExists: async (from: string) => mocks.sessions.has(from),
  resetSession: async (from: string) => {
    mocks.sessions.delete(from);
  },
  closeSession: async (from: string) => {
    mocks.sessions.delete(from);
  },
  resetAllSandboxTestSessions: async () => mocks.sessions.clear(),
}));

import { POST } from "@/app/api/sandbox/route";

const FROM = "sandbox-reference-http-contract";
const DOCUMENTO = "23456789";
const TOKEN = "synthetic-reference-contract-session-token";
const API_ORIGIN = "https://synthetic-minsa-api.test";
const HOSPITAL = "HOSPITAL SIMULADO";
const fetchMock = vi.fn<typeof fetch>();

const REFERENCE_ROWS = ["opaque-ref-01-z4", "opaque-ref-02-k8", "opaque-ref-03-b6", "opaque-ref-04-q2", "opaque-ref-05-v7"].map(
  (id, index) => ({
    id_referencia: id,
    nro_referencia: `SIM-${index + 1}`,
    fecha_inicio: "01/10/2099 10:00",
    ipress_origen: { codigo: "eess-origen-simulado", descripcion: "CENTRO SIMULADO" },
    ipress_destino: { codigo: index === 4 ? "009999" : "005987", descripcion: index === 4 ? "OTRO HOSPITAL SIMULADO" : HOSPITAL },
    ups_origen: { codigo: "ups-origen-simulado", descripcion: "MEDICINA GENERAL" },
    ups_destino: {
      codigo: index === 4 ? "0223300" : index < 3 ? "0222800" : "0230101",
      descripcion: index === 4 ? "TRAUMATOLOGIA" : index < 3 ? "CARDIOLOGÍA" : "",
    },
    estado: { codigo: "5", descripcion: "PACIENTE RECIBIDO" },
  }),
);

let referencesBody: unknown;
let dateRowsOverride: unknown[] | undefined;
let timeRowsOverride: unknown[] | undefined;
const endpointStatuses = new Map<string, number>();

const DATE_ROWS = [
  { fecha_cupo: "01/01/2099", cantidad_cupos: 17 },
  { fecha_cupo: "02/01/2099", cantidad_cupos: 3 },
];
const OTHER_DATE_ROWS = [
  { fecha_cupo: "03/01/2099", cantidad_cupos: 11 },
  { fecha_cupo: "04/01/2099", cantidad_cupos: 7 },
];
const TIME_ROWS = [
  { hora_inicio: "09:00", hora_fin: "09:30", cantidad_cupos: 2 },
  { hora_inicio: "10:00", hora_fin: "10:30", cantidad_cupos: 6 },
];
const OTHER_TIME_ROWS = [
  { hora_inicio: "14:00", hora_fin: "14:30", cantidad_cupos: 5 },
  { hora_inicio: "15:00", hora_fin: "15:30", cantidad_cupos: 9 },
];

const responsesByEndpoint = new Map<string, (body: Record<string, unknown>) => unknown>([
  [MinsaEndpoint.VERIFICAR_CODIGO, () => ({ success: true, token: TOKEN })],
  [MinsaEndpoint.REFERENCIAS, () => referencesBody],
  [
    MinsaEndpoint.FECHAS,
    (body) => ({
      data: {
        fechas: dateRowsOverride ?? (body.cod_eess === REFERENCE_ROWS[4].ipress_destino.codigo ? OTHER_DATE_ROWS : DATE_ROWS),
      },
    }),
  ],
  [
    MinsaEndpoint.HORAS,
    (body) => ({
      data: {
        horarios: timeRowsOverride ?? (body.cod_eess === REFERENCE_ROWS[4].ipress_destino.codigo ? OTHER_TIME_ROWS : TIME_ROWS),
      },
    }),
  ],
  [MinsaEndpoint.CITAS, () => ({ data: { url: "https://synthetic-minsa-digital.test/constancia" }, message: "Reserva sintetica" })],
]);

type Reply = { sent: SendEffect[]; session: { state: string }; interactiveId?: string };

async function send(event: Omit<InboundEvent, "from" | "channel">): Promise<Reply> {
  const response = await POST(
    new NextRequest("http://localhost/api/sandbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, ...event }),
    }),
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<Reply>;
}

function tap(reply: Reply, id: string): Promise<Reply> {
  expect(reply.interactiveId).toEqual(expect.any(String));
  return send({ type: InboundEventType.BUTTON, listId: id, replyTo: reply.interactiveId });
}

function textOf(reply: Reply): string {
  return reply.sent.flatMap((effect) => (effect.kind === SendType.TEXT ? [effect.text] : [])).join("\n");
}

function requestedPaths(): string[] {
  return fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname);
}

function requestsFor(path: MinsaEndpoint): Array<RequestInit | undefined> {
  return fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === path).map(([, request]) => request);
}

function expectAuthenticatedRequest(path: MinsaEndpoint, body: Record<string, unknown>): void {
  const requests = requestsFor(path);
  const request = requests[requests.length - 1];
  expect(request?.body).toBe(JSON.stringify(body));
  expect(new Headers(request?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
}

function listEffect(reply: Reply) {
  const effect = reply.sent.find((item) => item.kind === SendType.INTERACTIVE_LIST);
  expect(effect?.kind).toBe(SendType.INTERACTIVE_LIST);
  if (effect?.kind !== SendType.INTERACTIVE_LIST) throw new TypeError("La respuesta sintetica no contiene una lista");
  return effect;
}

function expectChangeWithCurrentList(reply: Reply): void {
  const effect = listEffect(reply);
  expect(effect.actions?.map((action) => action.id)).toContain(ReferenciaActionButtonId.CHANGE);
  expect(reply.sent.filter((item) => item.kind === SendType.INTERACTIVE_LIST || item.kind === SendType.BUTTONS)).toHaveLength(1);
  expect(reply.interactiveId).toBe(mocks.sessions.get(FROM)?.slots[SlotKey.INTERACTIVE_MESSAGE_ID]);
}

async function offerReferences(): Promise<Reply> {
  const mode = await send({ type: InboundEventType.TEXT, text: "123456" });
  expect(mode.session.state).toBe(SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE);
  return tap(mode, CitaReferenciaButtonId.REFERENCE);
}

beforeEach(() => {
  vi.stubEnv("SANDBOX_ENABLED", "true");
  vi.stubEnv("SANDBOX_USE_REAL_MINSA", "true");
  vi.stubEnv("SANDBOX_USE_REAL_AI", "false");
  vi.stubEnv("SANDBOX_USE_REAL_RENIEC", "false");
  vi.stubEnv("MINSA_API_HOST", API_ORIGIN);
  vi.stubEnv("MINSA_DIGITAL_APP_URL", "https://synthetic-minsa-digital.test");
  vi.stubEnv("MINSA_INTEGRATION_SECRET", "synthetic-reference-contract-signing-secret");
  vi.stubEnv("MINSA_CONVERSATION_ID_PLACEHOLDER", "synthetic-reference-contract-conversation");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("DATABASE_ENABLED", "false");
  mocks.sessions.clear();
  mocks.sessions.set(FROM, {
    state: SessionState.CITA_AWAITING_OTP,
    slots: {
      [SlotKey.CITA_DNI_PENDING]: DOCUMENTO,
      [SlotKey.CITA_TWOFA_ID]: "synthetic-reference-contract-twofa",
      [SlotKey.MENU_CHOICE]: MenuChoice.AGENDAR_CITA,
    },
    counters: {},
  });
  referencesBody = REFERENCE_ROWS;
  dateRowsOverride = undefined;
  timeRowsOverride = undefined;
  endpointStatuses.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input, request) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(API_ORIGIN);
    const response = responsesByEndpoint.get(url.pathname);
    if (!response) throw new TypeError(`Petición externa inesperada: ${url.pathname}`);
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify(response(body)), {
      status: endpointStatuses.get(url.pathname) ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("referencias: contrato HTTP real a traves del chat, la FSM y los adaptadores", () => {
  it("consulta fechas y horarios del destino elegido directamente y reserva solo tras la confirmacion final", async () => {
    const mode = await send({ type: InboundEventType.TEXT, text: "123456" });
    expect(mode.session.state).toBe(SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE);
    expect(requestedPaths()).toEqual([MinsaEndpoint.VERIFICAR_CODIGO, MinsaEndpoint.REFERENCIAS]);
    const referenceRequest = fetchMock.mock.calls.find(([input]) => new URL(String(input)).pathname === MinsaEndpoint.REFERENCIAS)?.[1];
    expect(referenceRequest?.method).toBe("POST");
    expect(new Headers(referenceRequest?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(referenceRequest?.body).toBe(JSON.stringify({ numero_documento: DOCUMENTO, tipo_documento: "01" }));
    expect(referenceRequest?.body).not.toContain(TOKEN);

    const list = await tap(mode, CitaReferenciaButtonId.REFERENCE);
    expect(list.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    const effect = list.sent.find((item) => item.kind === SendType.INTERACTIVE_LIST);
    expect(effect?.kind === SendType.INTERACTIVE_LIST && effect.rows.map((row) => row.id)).toEqual(
      REFERENCE_ROWS.map((row) => row.id_referencia),
    );
    expect(effect?.kind === SendType.INTERACTIVE_LIST && effect.rows.map((row) => row.referencia?.especialidad)).toEqual([
      "CARDIOLOGÍA",
      "CARDIOLOGÍA",
      "CARDIOLOGÍA",
      REFERENCIA_ESPECIALIDAD_NO_INFORMADA_TEXT,
      "TRAUMATOLOGIA",
    ]);

    const selected = REFERENCE_ROWS[2];
    const dates = await tap(list, selected.id_referencia);
    expect(dates.session.state).toBe(SessionState.CITA_AWAITING_FECHA_SELECT);
    const session = mocks.sessions.get(FROM);
    expect(session?.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe(selected.id_referencia);
    expect(session?.slots[SlotKey.CITA_COD_EESS]).toBe(selected.ipress_destino.codigo);
    expect(session?.slots[SlotKey.CITA_ESPECIALIDAD_ID]).toBe(selected.ups_destino.codigo);
    expectAuthenticatedRequest(MinsaEndpoint.FECHAS, {
      cod_eess: selected.ipress_destino.codigo,
      especialidad_id: selected.ups_destino.codigo,
    });
    expect(listEffect(dates).rows.map((row) => row.id)).toEqual(DATE_ROWS.map((row) => row.fecha_cupo));
    expect(listEffect(dates).rows.map((row) => row.description)).toEqual(["17 cupo(s) disponibles", "3 cupo(s) disponibles"]);
    expectChangeWithCurrentList(dates);
    expect(requestedPaths()).toEqual([MinsaEndpoint.VERIFICAR_CODIGO, MinsaEndpoint.REFERENCIAS, MinsaEndpoint.FECHAS]);
    expect(requestedPaths()).not.toContain(MinsaEndpoint.CITAS);

    const times = await tap(dates, DATE_ROWS[0].fecha_cupo);
    expect(times.session.state).toBe(SessionState.CITA_AWAITING_HORA_SELECT);
    expectAuthenticatedRequest(MinsaEndpoint.HORAS, {
      cod_eess: selected.ipress_destino.codigo,
      especialidad_id: selected.ups_destino.codigo,
      fecha: "20990101",
    });
    expect(listEffect(times).rows.map((row) => row.id)).toEqual(TIME_ROWS.map((row) => `${row.hora_inicio}|${row.hora_fin}`));
    expect(listEffect(times).rows.map((row) => row.description)).toEqual(["2 cupo(s) disponibles", "6 cupo(s) disponibles"]);
    expectChangeWithCurrentList(times);
    const confirmation = await tap(times, "09:00|09:30");
    expect(confirmation.session.state).toBe(SessionState.CITA_AWAITING_HORA_CONFIRM);
    expect(requestedPaths()).not.toContain(MinsaEndpoint.CITAS);
    const buttons = confirmation.sent.find((item) => item.kind === SendType.BUTTONS);
    expect(buttons?.kind === SendType.BUTTONS && buttons.buttons.map((button) => button.id)).toEqual([
      HoraConfirmButtonId.YES,
      HoraConfirmButtonId.NO,
      ReferenciaActionButtonId.CHANGE,
    ]);

    const booked = await tap(confirmation, HoraConfirmButtonId.YES);
    expect(booked.session.state).toBe(SessionState.CITA_BOOKED);
    expectAuthenticatedRequest(MinsaEndpoint.CITAS, {
      codigo_renipress: selected.ipress_destino.codigo,
      codigo_ups: selected.ups_destino.codigo,
      fecha_cita: "20990101",
      hora_cita: "900",
      numero_documento_paciente: DOCUMENTO,
      referencia_id: selected.id_referencia,
    });
    expect(requestsFor(MinsaEndpoint.CITAS)).toHaveLength(1);
  });

  it.each(["fecha", "horario", "resumen"])(
    "cambiar referencia desde %s limpia la seleccion anterior y usa el nuevo destino y UPS",
    async (stage) => {
      const list = await offerReferences();
      let current = await tap(list, REFERENCE_ROWS[0].id_referencia);
      if (stage !== "fecha") current = await tap(current, DATE_ROWS[0].fecha_cupo);
      if (stage === "resumen") current = await tap(current, "09:00|09:30");
      const previous = current;
      const persisted = mocks.sessions.get(FROM);
      expect(persisted).toBeDefined();
      if (!persisted) return;
      persisted.slots[SlotKey.CITA_HORA_CHOICE_A] = "05:00|05:30";
      persisted.slots[SlotKey.CITA_HORA_CHOICE_B] = "06:00|06:30|1";

      const changed = await tap(current, ReferenciaActionButtonId.CHANGE);
      expect(changed.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
      expect(listEffect(changed).rows.map((row) => row.id)).toEqual(REFERENCE_ROWS.map((row) => row.id_referencia));
      for (const slot of [
        SlotKey.CITA_REFERENCIA_SELECCIONADA_ID,
        SlotKey.CITA_COD_EESS,
        SlotKey.CITA_ESPECIALIDAD_ID,
        SlotKey.CITA_ESTABLECIMIENTO_NOMBRE,
        SlotKey.CITA_ESPECIALIDAD_NOMBRE,
        SlotKey.CITA_FECHA,
        SlotKey.CITA_HORA_CONFIRM_ID,
        SlotKey.CITA_HORA_CHOICE_A,
        SlotKey.CITA_HORA_CHOICE_B,
      ]) {
        expect(mocks.sessions.get(FROM)?.slots[slot]).toBeUndefined();
      }
      expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_DNI]).toBe(DOCUMENTO);
      expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_BEARER]).toBe(TOKEN);
      const requestCount = fetchMock.mock.calls.length;
      const oldSelection = stage === "fecha" ? DATE_ROWS[0].fecha_cupo : stage === "horario" ? "09:00|09:30" : HoraConfirmButtonId.YES;
      const stale = await tap(previous, oldSelection);
      expect(stale.sent).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(requestCount);

      const selected = REFERENCE_ROWS[4];
      const dates = await tap(changed, selected.id_referencia);
      expect(dates.session.state).toBe(SessionState.CITA_AWAITING_FECHA_SELECT);
      expectAuthenticatedRequest(MinsaEndpoint.FECHAS, {
        cod_eess: selected.ipress_destino.codigo,
        especialidad_id: selected.ups_destino.codigo,
      });
      expect(listEffect(dates).rows.map((row) => row.id)).toEqual(OTHER_DATE_ROWS.map((row) => row.fecha_cupo));
      expect(listEffect(dates).rows.map((row) => row.description)).toEqual(["11 cupo(s) disponibles", "7 cupo(s) disponibles"]);
      const times = await tap(dates, OTHER_DATE_ROWS[0].fecha_cupo);
      expectAuthenticatedRequest(MinsaEndpoint.HORAS, {
        cod_eess: selected.ipress_destino.codigo,
        especialidad_id: selected.ups_destino.codigo,
        fecha: "20990103",
      });
      expect(listEffect(times).rows.map((row) => row.id)).toEqual(OTHER_TIME_ROWS.map((row) => `${row.hora_inicio}|${row.hora_fin}`));
      const confirmation = await tap(times, "14:00|14:30");
      expect(textOf(confirmation)).toContain(selected.ipress_destino.descripcion);
      expect(textOf(confirmation)).toContain(selected.ups_destino.descripcion);
      expect(textOf(confirmation)).not.toContain(REFERENCE_ROWS[0].ups_destino.descripcion);
      expect(requestsFor(MinsaEndpoint.CITAS)).toHaveLength(0);
      await tap(confirmation, HoraConfirmButtonId.YES);
      expectAuthenticatedRequest(MinsaEndpoint.CITAS, {
        codigo_renipress: selected.ipress_destino.codigo,
        codigo_ups: selected.ups_destino.codigo,
        fecha_cita: "20990103",
        hora_cita: "1400",
        numero_documento_paciente: DOCUMENTO,
        referencia_id: selected.id_referencia,
      });
      expect(requestsFor(MinsaEndpoint.REFERENCIAS)).toHaveLength(1);
      expect(requestsFor(MinsaEndpoint.CITAS)).toHaveLength(1);
    },
  );

  it("la paginacion de horarios y Cambiar referencia pertenecen a la misma interaccion vigente", async () => {
    timeRowsOverride = Array.from({ length: 11 }, (_, index) => ({
      hora_inicio: `${String(index + 7).padStart(2, "0")}:00`,
      hora_fin: `${String(index + 7).padStart(2, "0")}:30`,
      cantidad_cupos: index + 1,
    }));
    const list = await offerReferences();
    const dates = await tap(list, REFERENCE_ROWS[0].id_referencia);
    const times = await tap(dates, DATE_ROWS[0].fecha_cupo);

    expectChangeWithCurrentList(times);
    expect(listEffect(times).rows).toHaveLength(10);
    expect(listEffect(times).actions?.map((action) => action.id)).toContain(HoraPageButtonId.NEXT);
    const next = await tap(times, HoraPageButtonId.NEXT);
    expect(next.sent.length).toBeGreaterThan(0);
    expect(requestsFor(MinsaEndpoint.HORAS)).toHaveLength(2);
    const changed = await tap(next, ReferenciaActionButtonId.CHANGE);
    expect(changed.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(requestsFor(MinsaEndpoint.CITAS)).toHaveLength(0);
  });

  it("un horario con cero cupos no se ofrece ni se reserva aunque intenten seleccionarlo", async () => {
    timeRowsOverride = [{ ...TIME_ROWS[0], cantidad_cupos: 0 }, TIME_ROWS[1]];
    const list = await offerReferences();
    const dates = await tap(list, REFERENCE_ROWS[0].id_referencia);
    const confirmation = await tap(dates, DATE_ROWS[0].fecha_cupo);

    expect(confirmation.session.state).toBe(SessionState.CITA_AWAITING_HORA_CONFIRM);
    expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_HORA_CONFIRM_ID]).toBe("10:00|10:30");
    expect(textOf(confirmation)).not.toContain("9:00");
    const invalid = await tap(confirmation, "09:00|09:30");
    expect(invalid.session.state).toBe(SessionState.CITA_AWAITING_HORA_CONFIRM);
    expect(requestsFor(MinsaEndpoint.CITAS)).toHaveLength(0);
    await tap(invalid, HoraConfirmButtonId.YES);
    expectAuthenticatedRequest(MinsaEndpoint.CITAS, {
      codigo_renipress: REFERENCE_ROWS[0].ipress_destino.codigo,
      codigo_ups: REFERENCE_ROWS[0].ups_destino.codigo,
      fecha_cita: "20990101",
      hora_cita: "1000",
      numero_documento_paciente: DOCUMENTO,
      referencia_id: REFERENCE_ROWS[0].id_referencia,
    });
  });

  it.each([
    ["fechas vacias", MinsaEndpoint.FECHAS, 200],
    ["error de fechas", MinsaEndpoint.FECHAS, 503],
    ["horarios vacios", MinsaEndpoint.HORAS, 200],
    ["error de horarios", MinsaEndpoint.HORAS, 503],
  ])("%s no consulta otros establecimientos ni reserva una cita", async (_label, endpoint, status) => {
    endpointStatuses.set(endpoint, status);
    if (endpoint === MinsaEndpoint.FECHAS) dateRowsOverride = [];
    else timeRowsOverride = [];
    const list = await offerReferences();
    const dates = await tap(list, REFERENCE_ROWS[0].id_referencia);
    if (endpoint === MinsaEndpoint.HORAS) await tap(dates, DATE_ROWS[0].fecha_cupo);

    expect(requestedPaths()).not.toContain(MinsaEndpoint.UBIGEO);
    expect(requestedPaths()).not.toContain(MinsaEndpoint.ESPECIALIDADES);
    expect(requestedPaths()).not.toContain(MinsaEndpoint.ESTABLECIMIENTOS);
    expect(requestedPaths()).not.toContain(MinsaEndpoint.CITAS);
  });

  it.each([
    ["empty", "button", OtherReferenciaCitaButtonId.REFERENCES, "lista"],
    ["zero", "text", "referencias", "lista"],
    ["empty", "text", "1", "lista"],
    ["zero", "button", OtherReferenciaCitaButtonId.NEW_APPOINTMENT, "cita"],
    ["empty", "text", "cita médica", "cita"],
    ["zero", "text", "salir", "salir"],
  ] as const)(
    "agendar sin fechas %s espera decidir mediante %s/%s entre referencias y cita médica",
    async (quota, type, answer, outcome) => {
      dateRowsOverride = quota === "empty" ? [] : DATE_ROWS.map((row) => ({ ...row, cantidad_cupos: 0 }));
      const list = await offerReferences();
      let question = await tap(list, REFERENCE_ROWS[0].id_referencia);
      expect(question.session.state).toBe(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE);
      expect(question.sent.some((effect) => effect.kind === SendType.INTERACTIVE_LIST)).toBe(false);
      const choices = question.sent.find((effect) => effect.kind === SendType.BUTTONS);
      expect(choices?.kind === SendType.BUTTONS && choices.buttons.map((button) => button.id)).toEqual([
        OtherReferenciaCitaButtonId.REFERENCES,
        OtherReferenciaCitaButtonId.NEW_APPOINTMENT,
      ]);
      expect(choices?.text).toContain("¿Deseas continuar con tus referencias o con una cita médica?");
      const requestsBefore = fetchMock.mock.calls.length;
      question = await send({ type: InboundEventType.TEXT, text: "no entiendo" });
      expect(question.session.state).toBe(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE);
      expect(question.sent.some((effect) => effect.kind === SendType.INTERACTIVE_LIST)).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(requestsBefore);
      expect(requestsFor(MinsaEndpoint.HORAS)).toHaveLength(0);
      expect(requestsFor(MinsaEndpoint.CITAS)).toHaveLength(0);
      const reply = type === "button" ? await tap(question, answer) : await send({ type: InboundEventType.TEXT, text: answer });
      expect(fetchMock).toHaveBeenCalledTimes(requestsBefore);
      if (outcome === "salir") {
        expect(reply.session.state).toBe(SessionState.REFERENCIA_CLOSED);
        expect(textOf(reply)).toBe(REFERENCIA_GOODBYE_TEXT);
        expect(Object.keys(mocks.sessions.get(FROM)?.slots ?? {}).sort()).toEqual(
          [SlotKey.INTERACTIVE_MESSAGE_ID, SlotKey.INTERACTIVE_MESSAGE_CONSUMED].sort(),
        );
        const stale = await tap(question, OtherReferenciaCitaButtonId.REFERENCES);
        expect(stale.session.state).toBe(SessionState.REFERENCIA_CLOSED);
        expect(stale.sent).toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(requestsBefore);
        return;
      }
      if (outcome === "cita") {
        expect(reply.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
        expect(reply.sent.some((effect) => effect.kind === SendType.INTERACTIVE_LIST)).toBe(false);
        const saved = mocks.sessions.get(FROM)?.slots ?? {};
        expect(saved[SlotKey.CITA_BEARER]).toBe(TOKEN);
        expect(saved[SlotKey.CITA_DNI]).toBe(DOCUMENTO);
        expect(saved[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
        expect(saved[SlotKey.CITA_REFERENCIAS_SIN_PROGRAMACION]).toBeUndefined();
        expect(saved[SlotKey.CITA_COD_EESS]).toBeUndefined();
        return;
      }
      expect(reply.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
      const rows = listEffect(reply).rows;
      expect(rows.map((row) => row.id)).toEqual([...REFERENCE_ROWS.slice(1), REFERENCE_ROWS[0]].map((row) => row.id_referencia));
      expect(rows.at(-1)).toMatchObject({ disabled: true, referencia: { estado: REFERENCIA_SIN_PROGRAMACION_ETIQUETA } });
      const blocked = await tap(reply, REFERENCE_ROWS[0].id_referencia);
      expect(textOf(blocked)).toContain(REFERENCIA_SIN_PROGRAMACION_TEXT);
      expect(blocked.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
      expect(fetchMock).toHaveBeenCalledTimes(requestsBefore);
      expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_BEARER]).toBe(TOKEN);
      dateRowsOverride = undefined;
      const dates = await tap(blocked, REFERENCE_ROWS[4].id_referencia);
      expect(dates.session.state).toBe(SessionState.CITA_AWAITING_FECHA_SELECT);
      expectAuthenticatedRequest(MinsaEndpoint.FECHAS, { cod_eess: "009999", especialidad_id: "0223300" });
      const times = await tap(dates, OTHER_DATE_ROWS[0].fecha_cupo);
      expect(times.session.state).toBe(SessionState.CITA_AWAITING_HORA_SELECT);
      expectAuthenticatedRequest(MinsaEndpoint.HORAS, { cod_eess: "009999", especialidad_id: "0223300", fecha: "20990103" });
      expect(requestsFor(MinsaEndpoint.REFERENCIAS)).toHaveLength(1);
      expect(requestsFor(MinsaEndpoint.CITAS)).toHaveLength(0);
    },
  );

  it("el arreglo vacio confirma ausencia y continua una nueva cita sin repetir OTP", async () => {
    referencesBody = [];
    const reply = await send({ type: InboundEventType.TEXT, text: "123456" });
    expect(reply.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(textOf(reply)).toContain(CITA_REFERENCIA_NONE_TEXT);
    expect(textOf(reply)).not.toContain(CITA_REFERENCIA_LOOKUP_ERROR_TEXT);
    expect(requestedPaths()).toEqual([MinsaEndpoint.VERIFICAR_CODIGO, MinsaEndpoint.REFERENCIAS]);
    expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_DNI]).toBe(DOCUMENTO);
    expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_BEARER]).toBe(TOKEN);
  });

  it("una respuesta incompatible informa error sin afirmar que no existen referencias", async () => {
    referencesBody = { resultado: "respuesta incompatible" };
    const reply = await send({ type: InboundEventType.TEXT, text: "123456" });
    expect(reply.session.state).toBe(SessionState.REFERENCIA_AWAITING_LOOKUP_RETRY);
    expect(textOf(reply)).toContain(CITA_REFERENCIA_LOOKUP_ERROR_TEXT);
    expect(textOf(reply)).not.toContain(CITA_REFERENCIA_NONE_TEXT);
    const choices = reply.sent.find((effect) => effect.kind === SendType.BUTTONS);
    expect(choices?.kind === SendType.BUTTONS && choices.buttons.map((button) => button.id)).toEqual([
      CitaReferenciaButtonId.RETRY,
      CitaReferenciaButtonId.NEW,
    ]);
    expect(requestedPaths()).toEqual([MinsaEndpoint.VERIFICAR_CODIGO, MinsaEndpoint.REFERENCIAS]);
  });
});
