import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "@/lib/fsm/core/types";
import { REFERENCIA_GOODBYE_TEXT } from "@/lib/constants/textos/referencia";
import {
  REFERENCIA_SIN_PROGRAMACION_ETIQUETA,
  REFERENCIA_SIN_PROGRAMACION_TEXT,
  referenciaBloqueadaText,
} from "@/lib/constants/textos/cita-reserva";
import { CitaReferenciaButtonId } from "@/lib/enums/cita-referencia-button-id";
import { HoraConfirmButtonId } from "@/lib/enums/hora-confirm-button-id";
import { HoraPageButtonId } from "@/lib/enums/hora-page-button-id";
import { ListPageButtonId } from "@/lib/enums/list-page-button-id";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import { OtherReferenciaCitaButtonId } from "@/lib/enums/other-referencia-cita-button-id";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import {
  WHATSAPP_REFERENCE_API,
  WHATSAPP_REFERENCE_DATES,
  WHATSAPP_REFERENCE_DOCUMENT,
  WHATSAPP_REFERENCE_ROWS,
  WHATSAPP_REFERENCE_SECRET,
  WHATSAPP_REFERENCE_TOKEN,
  WhatsAppReferenceHttp,
} from "@/tests/support/whatsapp-reference-http";

const storage = vi.hoisted(() => ({ sessions: new Map<string, Session>(), after: [] as Promise<unknown>[] }));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<unknown>) => storage.after.push(task()),
}));
vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) => structuredClone(storage.sessions.get(from) ?? { state: "main_menu", slots: {}, counters: {} }),
  findSession: async (from: string) => structuredClone(storage.sessions.get(from)) ?? null,
  sessionRowExists: async (from: string) => storage.sessions.has(from),
  saveSession: async (from: string, session: Session) => storage.sessions.set(from, structuredClone(session)),
}));
vi.mock("@/lib/security/rate-limiter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limiter")>();
  return { ...actual, inboundRateLimiter: actual.createRateLimiter({ enabled: false }) };
});

import { POST } from "@/app/webhook/whatsapp/route";

let upstream: WhatsAppReferenceHttp;
let messageSequence = 0;
let citizenSequence = 0;
let citizen: string;
let lastPayload: string;

async function deliver(payload: string, signature?: string): Promise<Response> {
  const response = await POST(
    new NextRequest("http://localhost/webhook/whatsapp", {
      method: "POST",
      body: payload,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256":
          signature ?? "sha256=" + crypto.createHmac("sha256", WHATSAPP_REFERENCE_SECRET).update(payload).digest("hex"),
      },
    }),
  );
  await vi.runAllTimersAsync();
  await Promise.all(storage.after.splice(0));
  return response;
}

async function send(text?: string, identifier?: string, button = false, replyTo?: string): Promise<void> {
  const message = {
    id: `synthetic-in-${++messageSequence}`,
    from_user_id: citizen,
    timestamp: String(Math.floor(Date.now() / 1_000)),
    type: identifier ? "interactive" : "text",
    ...(identifier
      ? {
          interactive: {
            type: button ? "button_reply" : "list_reply",
            [button ? "button_reply" : "list_reply"]: { id: identifier, title: "Opcion sintetica" },
          },
          context: { id: replyTo ?? upstream.latestInteractive().id },
        }
      : { text: { body: text ?? "" } }),
  };
  lastPayload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [message] } }] }] });
  const response = await deliver(lastPayload);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ received: true });
}

function session(): Session {
  const current = storage.sessions.get(citizen);
  expect(current).toBeDefined();
  if (!current) throw new TypeError("Falta la sesion sintetica de WhatsApp");
  return current;
}

async function identify(): Promise<void> {
  await send("cita");
  expect(session().state).toBe(SessionState.CITA_AWAITING_DNI);
  await send(WHATSAPP_REFERENCE_DOCUMENT);
  expect(session().state).toBe(SessionState.CITA_AWAITING_OTP);
  await send("123456");
}

async function references(): Promise<void> {
  await identify();
  expect(session().state).toBe(SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE);
  await send(undefined, CitaReferenciaButtonId.REFERENCE, true);
  expect(session().state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
}

function authenticated(endpoint: MinsaEndpoint, body: Record<string, string>): void {
  const request = upstream.requestsFor(endpoint).at(-1);
  expect(request?.init.method).toBe("POST");
  expect(request?.init.body).toBe(JSON.stringify(body));
  expect(new Headers(request?.init.headers).get("Authorization")).toBe(`Bearer ${WHATSAPP_REFERENCE_TOKEN}`);
}

function expectChange(): void {
  expect(upstream.rows().map((row) => row.id)).toContain(ReferenciaActionButtonId.CHANGE);
  expect(session().slots[SlotKey.INTERACTIVE_MESSAGE_ID]).toBe(upstream.latestInteractive().id);
}

function numberedFallback(): void {
  upstream.responses.set(
    MinsaEndpoint.REFERENCIAS,
    Array.from({ length: 21 }, (_, index) => ({
      ...WHATSAPP_REFERENCE_ROWS[0],
      id_referencia: `synthetic-fallback-reference-${index}`,
      ipress_destino: { codigo: String(5987 + index).padStart(6, "0"), descripcion: `HOSPITAL SINTETICO ${index}` },
    })),
  );
  upstream.responses.set(MinsaEndpoint.FECHAS, {
    data: {
      fechas: Array.from({ length: 21 }, (_, index) => ({
        fecha_cupo: `${String(index + 1).padStart(2, "0")}/02/2099`,
        cantidad_cupos: 1,
      })),
    },
  });
  upstream.responses.set(MinsaEndpoint.HORAS, {
    data: {
      horarios: Array.from({ length: 21 }, (_, index) => ({
        hora_inicio: `${String(index + 1).padStart(2, "0")}:00`,
        hora_fin: `${String(index + 1).padStart(2, "0")}:30`,
        cantidad_cupos: 1,
      })),
    },
  });
  vi.stubGlobal("fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
    if (new URL(String(input)).hostname === "graph.facebook.com" && JSON.parse(String(init.body)).type === "interactive") {
      return Response.json({ error: { code: 100, message: "Rechazo sintetico de interactivo" } }, { status: 400 });
    }
    return upstream.fetch(input, init);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2098-12-31T15:00:00Z"));
  vi.stubEnv("DATABASE_ENABLED", "false");
  vi.stubEnv("SANDBOX_USE_REAL_MINSA", "true");
  vi.stubEnv("SANDBOX_USE_REAL_AI", "false");
  vi.stubEnv("SANDBOX_USE_REAL_RENIEC", "false");
  vi.stubEnv("MINSA_API_HOST", WHATSAPP_REFERENCE_API);
  vi.stubEnv("MINSA_INTEGRATION_SECRET", "synthetic-integration-secret");
  vi.stubEnv("MINSA_DIGITAL_APP_URL", "https://synthetic-minsa-digital.test");
  vi.stubEnv("META_APP_SECRET", WHATSAPP_REFERENCE_SECRET);
  vi.stubEnv("META_ACCESS_TOKEN", "synthetic-meta-reference-token");
  vi.stubEnv("META_PHONE_NUMBER_ID", "synthetic-phone-id");
  upstream = new WhatsAppReferenceHttp();
  vi.stubGlobal("fetch", upstream.fetch);
  storage.sessions.clear();
  storage.after.length = 0;
  citizen = `synthetic-citizen-${++citizenSequence}`;
});

afterEach(() => {
  upstream.assertLimits();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("WhatsApp: referencia hasta la reserva mediante webhook firmado y servicios simulados", () => {
  it("muestra las referencias bloqueadas al final sin enviar marcas internas a Meta y rechaza su selección", async () => {
    const blocked = {
      ...WHATSAPP_REFERENCE_ROWS[0],
      id_referencia: "synthetic-blocked-reference",
      estado: { codigo: "1", descripcion: "PENDIENTE" },
    };
    upstream.responses.set(MinsaEndpoint.REFERENCIAS, [blocked, ...structuredClone(WHATSAPP_REFERENCE_ROWS)]);
    await references();

    const rows = upstream.rows();
    expect(rows.map((row) => row.id)).toEqual([...WHATSAPP_REFERENCE_ROWS.map((row) => row.id_referencia), blocked.id_referencia]);
    expect(rows.every((row) => Object.keys(row).every((key) => ["id", "title", "description"].includes(key)))).toBe(true);
    expect(rows.at(-1)?.description?.endsWith("PENDIENTE")).toBe(true);

    await send(undefined, blocked.id_referencia);
    expect(session().state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(upstream.requestsFor(MinsaEndpoint.FECHAS)).toHaveLength(0);
    expect(upstream.messages.some((message) => message.text?.body === referenciaBloqueadaText("PENDIENTE"))).toBe(true);
    expect(upstream.rows().map((row) => row.id)).toEqual(rows.map((row) => row.id));

    await send(undefined, WHATSAPP_REFERENCE_ROWS[0].id_referencia);
    expect(session().state).toBe(SessionState.CITA_AWAITING_FECHA_SELECT);
  });

  it("consulta el destino exacto con Bearer y reserva una sola vez tras confirmar el resumen final", async () => {
    await references();
    authenticated(MinsaEndpoint.REFERENCIAS, { numero_documento: WHATSAPP_REFERENCE_DOCUMENT, tipo_documento: "01" });
    const selected = WHATSAPP_REFERENCE_ROWS[0];
    const before = upstream.messages.length;
    await send(undefined, selected.id_referencia);
    expect(session().state).toBe(SessionState.CITA_AWAITING_FECHA_SELECT);
    expect(JSON.stringify(upstream.messages.slice(before))).not.toContain("¿Es esta tu referencia?");
    authenticated(MinsaEndpoint.FECHAS, { cod_eess: "005987", especialidad_id: "0222800" });
    expect(
      upstream
        .rows()
        .filter((row) => row.id !== ReferenciaActionButtonId.CHANGE)
        .map((row) => row.id),
    ).toEqual(WHATSAPP_REFERENCE_DATES.slice(0, 2).map((row) => row.fecha_cupo));
    expectChange();
    await send(undefined, WHATSAPP_REFERENCE_DATES[2].fecha_cupo);
    expect(session().state).toBe(SessionState.CITA_AWAITING_FECHA_SELECT);
    expect(upstream.requestsFor(MinsaEndpoint.HORAS)).toHaveLength(0);
    await send(undefined, WHATSAPP_REFERENCE_DATES[0].fecha_cupo);
    expect(session().state).toBe(SessionState.CITA_AWAITING_HORA_SELECT);
    authenticated(MinsaEndpoint.HORAS, { cod_eess: "005987", especialidad_id: "0222800", fecha: "20990101" });
    expect(
      upstream
        .rows()
        .filter((row) => row.id !== ReferenciaActionButtonId.CHANGE)
        .map((row) => row.id),
    ).toEqual(["09:00|09:30", "10:00|10:30"]);
    expectChange();
    await send(undefined, "11:00|11:30");
    expect(session().state).toBe(SessionState.CITA_AWAITING_HORA_SELECT);
    expect(upstream.requestsFor(MinsaEndpoint.CITAS)).toHaveLength(0);
    await send(undefined, "09:00|09:30");
    expect(session().state).toBe(SessionState.CITA_AWAITING_HORA_CONFIRM);
    expect(upstream.requestsFor(MinsaEndpoint.CITAS)).toHaveLength(0);
    expect(upstream.latestInteractive().interactive?.action.buttons?.map((button) => button.reply.id)).toEqual([
      HoraConfirmButtonId.YES,
      HoraConfirmButtonId.NO,
      ReferenciaActionButtonId.CHANGE,
    ]);
    await send(undefined, HoraConfirmButtonId.YES, true);
    expect(session().state).toBe(SessionState.CITA_BOOKED);
    authenticated(MinsaEndpoint.CITAS, {
      codigo_renipress: "005987",
      codigo_ups: "0222800",
      fecha_cita: "20990101",
      hora_cita: "900",
      numero_documento_paciente: WHATSAPP_REFERENCE_DOCUMENT,
      referencia_id: selected.id_referencia,
    });
    const delivered = upstream.messages.length;
    await deliver(lastPayload);
    expect(upstream.messages).toHaveLength(delivered);
    expect(upstream.requestsFor(MinsaEndpoint.CITAS)).toHaveLength(1);
    expect(session().slots[SlotKey.CITA_BEARER]).toBeUndefined();
  });

  it.each(["fecha", "horario", "resumen"])("permite cambiar referencia desde %s y elimina la seleccion anterior", async (stage) => {
    await references();
    await send(undefined, WHATSAPP_REFERENCE_ROWS[0].id_referencia);
    if (stage !== "fecha") await send(undefined, WHATSAPP_REFERENCE_DATES[0].fecha_cupo);
    if (stage === "resumen") await send(undefined, "09:00|09:30");
    await send(undefined, ReferenciaActionButtonId.CHANGE, stage === "resumen");
    expect(session().state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(session().slots[SlotKey.CITA_DNI]).toBe(WHATSAPP_REFERENCE_DOCUMENT);
    expect(session().slots[SlotKey.CITA_BEARER]).toBe(WHATSAPP_REFERENCE_TOKEN);
    for (const key of [
      SlotKey.CITA_REFERENCIA_SELECCIONADA_ID,
      SlotKey.CITA_COD_EESS,
      SlotKey.CITA_ESPECIALIDAD_ID,
      SlotKey.CITA_FECHA,
      SlotKey.CITA_HORAS_DIA,
      SlotKey.CITA_HORA_CONFIRM_ID,
      SlotKey.CITA_FECHAS_DESCARTADAS,
    ]) {
      expect(session().slots[key]).toBeUndefined();
    }
    await send(undefined, WHATSAPP_REFERENCE_ROWS[2].id_referencia);
    authenticated(MinsaEndpoint.FECHAS, { cod_eess: "009999", especialidad_id: "0223300" });
    await send(undefined, WHATSAPP_REFERENCE_DATES[1].fecha_cupo);
    authenticated(MinsaEndpoint.HORAS, { cod_eess: "009999", especialidad_id: "0223300", fecha: "20990102" });
    expect(upstream.requestsFor(MinsaEndpoint.REFERENCIAS)).toHaveLength(1);
    expect(upstream.requestsFor(MinsaEndpoint.CITAS)).toHaveLength(0);
  });

  it.each([MinsaEndpoint.FECHAS, MinsaEndpoint.HORAS])("pagina 21 cupos de %s sin perder filas ni acciones", async (endpoint) => {
    const dates = Array.from({ length: 21 }, (_, index) => ({
      fecha_cupo: `${String(index + 1).padStart(2, "0")}/02/2099`,
      cantidad_cupos: 1,
    }));
    const times = Array.from({ length: 21 }, (_, index) => ({
      hora_inicio: `${String(index + 1).padStart(2, "0")}:00`,
      hora_fin: `${String(index + 1).padStart(2, "0")}:30`,
      cantidad_cupos: 1,
    }));
    upstream.responses.set(endpoint, { data: endpoint === MinsaEndpoint.FECHAS ? { fechas: dates } : { horarios: times } });
    const expected =
      endpoint === MinsaEndpoint.FECHAS ? dates.map((row) => row.fecha_cupo) : times.map((row) => `${row.hora_inicio}|${row.hora_fin}`);
    const nextId = endpoint === MinsaEndpoint.FECHAS ? ListPageButtonId.NEXT : HoraPageButtonId.NEXT;
    await references();
    await send(undefined, WHATSAPP_REFERENCE_ROWS[0].id_referencia);
    if (endpoint === MinsaEndpoint.HORAS) await send(undefined, WHATSAPP_REFERENCE_DATES[0].fecha_cupo);
    const seen = new Set<string>();
    for (let page = 0; page < 5; page++) {
      expectChange();
      const ids = upstream.rows().map((row) => row.id);
      for (const id of ids) if (expected.includes(id)) seen.add(id);
      if (!ids.includes(nextId)) break;
      await send(undefined, nextId);
    }
    expect(seen).toEqual(new Set(expected));
    expect(upstream.requestsFor(MinsaEndpoint.CITAS)).toHaveLength(0);
  });

  it("rechaza una firma falsa sin ejecutar servicios", async () => {
    const response = await deliver(JSON.stringify({ entry: [] }), "sha256=" + "0".repeat(64));
    expect(response.status).toBe(403);
    expect(upstream.requests).toHaveLength(0);
    expect(upstream.messages).toHaveLength(0);
  });

  it("el texto alternativo permite paginar referencias, fechas y horarios y elegir 1 en la tercera página", async () => {
    numberedFallback();
    await identify();
    await send("2");
    expect(session().state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    await send("Ver más opciones");
    await send("Ver más opciones");
    await send("1");
    authenticated(MinsaEndpoint.FECHAS, { cod_eess: "006001", especialidad_id: "0222800" });
    await send("Ver más opciones");
    await send("Ver más opciones");
    await send("1");
    authenticated(MinsaEndpoint.HORAS, { cod_eess: "006001", especialidad_id: "0222800", fecha: "20990215" });
    await send("Ver más horarios");
    await send("Ver más horarios");
    await send("1");
    expect(session().state).toBe(SessionState.CITA_AWAITING_HORA_CONFIRM);
    expect(session().slots[SlotKey.CITA_HORA_CONFIRM_ID]).toBe("15:00|15:30");
    const fallback = upstream.messages.findLast((message) => message.type === "text")?.text?.body ?? "";
    expect(fallback).toContain("1. Sí");
    expect(fallback).toContain("2. No");
    expect(fallback).toContain("\nCambiar referencia");
    expect(fallback).not.toContain("3. Cambiar referencia");
    await send("Cambiar referencia");
    expect(session().state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(session().slots[SlotKey.CITA_FECHA]).toBeUndefined();
    expect(upstream.requestsFor(MinsaEndpoint.CITAS)).toHaveLength(0);
  });

  it.each(["found", "empty", "error"])("permite nueva cita despues de consultar referencias: %s", async (result) => {
    if (result === "empty") upstream.responses.set(MinsaEndpoint.REFERENCIAS, []);
    if (result === "error") upstream.statuses.set(MinsaEndpoint.REFERENCIAS, 503);
    await identify();
    if (result !== "empty") {
      expect(session().state).toBe(
        result === "error" ? SessionState.REFERENCIA_AWAITING_LOOKUP_RETRY : SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE,
      );
      await send(undefined, CitaReferenciaButtonId.NEW, true);
    }
    expect(session().state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(session().slots[SlotKey.CITA_DNI]).toBe(WHATSAPP_REFERENCE_DOCUMENT);
    expect(session().slots[SlotKey.CITA_BEARER]).toBe(WHATSAPP_REFERENCE_TOKEN);
    expect(session().slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
    expect(upstream.requestsFor(MinsaEndpoint.REFERENCIAS)).toHaveLength(1);
    expect(upstream.requestsFor(MinsaEndpoint.FECHAS)).toHaveLength(0);
    expect(upstream.requestsFor(MinsaEndpoint.CITAS)).toHaveLength(0);
  });

  it.each([
    [MinsaEndpoint.FECHAS, "error"],
    [MinsaEndpoint.HORAS, "empty"],
    [MinsaEndpoint.HORAS, "error"],
  ] as const)("permite recuperar %s/%s sin consultar otro hospital ni reservar", async (endpoint, failure) => {
    upstream.responses.set(endpoint, { data: endpoint === MinsaEndpoint.FECHAS ? { fechas: [] } : { horarios: [] } });
    if (failure === "error") upstream.statuses.set(endpoint, 503);
    await references();
    await send(undefined, WHATSAPP_REFERENCE_ROWS[0].id_referencia);
    if (endpoint === MinsaEndpoint.HORAS) await send(undefined, WHATSAPP_REFERENCE_DATES[0].fecha_cupo);
    expect([SessionState.CITA_AWAITING_REFERENCIA_SELECT, SessionState.CITA_AWAITING_OTHER_FECHA]).toContain(session().state);
    if (session().state === SessionState.CITA_AWAITING_OTHER_FECHA) {
      await send(undefined, ReferenciaActionButtonId.CHANGE, true);
      expect(session().state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    }
    for (const current of [MinsaEndpoint.FECHAS, MinsaEndpoint.HORAS]) {
      for (const request of upstream.requestsFor(current)) {
        expect(JSON.parse(String(request.init.body))).toMatchObject({ cod_eess: "005987", especialidad_id: "0222800" });
      }
    }
    expect(upstream.requestsFor(MinsaEndpoint.ESTABLECIMIENTOS)).toHaveLength(0);
    expect(upstream.requestsFor(MinsaEndpoint.CITAS)).toHaveLength(0);
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
      upstream.responses.set(MinsaEndpoint.FECHAS, {
        data: { fechas: quota === "empty" ? [] : WHATSAPP_REFERENCE_DATES.map((row) => ({ ...row, cantidad_cupos: 0 })) },
      });
      await references();
      const beforeMessages = upstream.messages.length;
      await send(undefined, WHATSAPP_REFERENCE_ROWS[0].id_referencia);
      expect(session().state).toBe(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE);
      expect(upstream.messages.slice(beforeMessages).some((message) => message.interactive?.type === "list")).toBe(false);
      const question = upstream.latestInteractive().interactive;
      expect(question?.type).toBe("button");
      expect(question?.action.buttons?.map((button) => button.reply.id)).toEqual([
        OtherReferenciaCitaButtonId.REFERENCES,
        OtherReferenciaCitaButtonId.NEW_APPOINTMENT,
      ]);
      expect(question?.action.buttons?.map((button) => button.reply.title)).toEqual(["Referencias", "Cita médica"]);
      expect(question?.body.text).toContain("¿Deseas continuar con tus referencias o con una cita médica?");
      const requestsBefore = upstream.requests.length;
      await send("no entiendo");
      expect(session().state).toBe(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE);
      expect(upstream.requests).toHaveLength(requestsBefore);
      expect(upstream.requestsFor(MinsaEndpoint.HORAS)).toHaveLength(0);
      expect(upstream.requestsFor(MinsaEndpoint.CITAS)).toHaveLength(0);
      if (type === "button") await send(undefined, answer, true);
      else await send(answer);
      expect(upstream.requests).toHaveLength(requestsBefore);
      if (outcome === "salir") {
        expect(session().state).toBe(SessionState.REFERENCIA_CLOSED);
        expect(Object.keys(session().slots).sort()).toEqual([SlotKey.INTERACTIVE_MESSAGE_ID, SlotKey.INTERACTIVE_MESSAGE_CONSUMED].sort());
        expect(upstream.messages.at(-1)?.text?.body).toBe(REFERENCIA_GOODBYE_TEXT);
        const beforeStale = upstream.messages.length;
        await send(undefined, OtherReferenciaCitaButtonId.REFERENCES, true, String(session().slots[SlotKey.INTERACTIVE_MESSAGE_ID]));
        expect(session().state).toBe(SessionState.REFERENCIA_CLOSED);
        expect(upstream.messages).toHaveLength(beforeStale);
        expect(upstream.requests).toHaveLength(requestsBefore);
        return;
      }
      if (outcome === "cita") {
        expect(session().state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
        expect(session().slots[SlotKey.CITA_BEARER]).toBe(WHATSAPP_REFERENCE_TOKEN);
        expect(session().slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
        expect(session().slots[SlotKey.CITA_REFERENCIAS_SIN_PROGRAMACION]).toBeUndefined();
        return;
      }
      expect(session().state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
      const rows = upstream.rows();
      expect(rows.map((row) => row.id)).toEqual(
        [WHATSAPP_REFERENCE_ROWS[1], WHATSAPP_REFERENCE_ROWS[2], WHATSAPP_REFERENCE_ROWS[0]].map((row) => row.id_referencia),
      );
      expect(rows.at(-1)?.description?.endsWith(REFERENCIA_SIN_PROGRAMACION_ETIQUETA)).toBe(true);
      expect(rows.every((row) => Object.keys(row).every((key) => ["id", "title", "description"].includes(key)))).toBe(true);
      await send(undefined, WHATSAPP_REFERENCE_ROWS[0].id_referencia);
      expect(session().state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
      expect(upstream.messages.some((message) => message.text?.body === REFERENCIA_SIN_PROGRAMACION_TEXT)).toBe(true);
      expect(upstream.requests).toHaveLength(requestsBefore);
      expect(session().slots[SlotKey.CITA_BEARER]).toBe(WHATSAPP_REFERENCE_TOKEN);
      upstream.responses.set(MinsaEndpoint.FECHAS, { data: { fechas: WHATSAPP_REFERENCE_DATES } });
      await send(undefined, WHATSAPP_REFERENCE_ROWS[2].id_referencia);
      authenticated(MinsaEndpoint.FECHAS, { cod_eess: "009999", especialidad_id: "0223300" });
      await send(undefined, WHATSAPP_REFERENCE_DATES[0].fecha_cupo);
      expect(session().state).toBe(SessionState.CITA_AWAITING_HORA_SELECT);
      authenticated(MinsaEndpoint.HORAS, { cod_eess: "009999", especialidad_id: "0223300", fecha: "20990101" });
      expect(upstream.requestsFor(MinsaEndpoint.REFERENCIAS)).toHaveLength(1);
      expect(upstream.requestsFor(MinsaEndpoint.CITAS)).toHaveLength(0);
    },
  );

  it.each([
    ["referencias", SessionState.CITA_AWAITING_REFERENCIA_SELECT],
    ["1", SessionState.CITA_AWAITING_REFERENCIA_SELECT],
    ["cita médica", SessionState.CITA_AWAITING_DISTRITO_AI],
    ["2", SessionState.CITA_AWAITING_DISTRITO_AI],
  ] as const)("la pregunta sin cupos de agendar acepta %s cuando Meta exige texto alternativo", async (answer, state) => {
    numberedFallback();
    upstream.responses.set(MinsaEndpoint.FECHAS, { data: { fechas: [] } });
    await identify();
    await send("2");
    await send("1");
    expect(session().state).toBe(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE);
    const question = upstream.messages.at(-1)?.text?.body ?? "";
    expect(question).toContain("¿Deseas continuar con tus referencias o con una cita médica?");
    expect(question).toContain("1. Referencias");
    expect(question).toContain("2. Cita médica");
    const requestsBefore = upstream.requests.length;
    await send(answer);
    expect(upstream.requests).toHaveLength(requestsBefore);
    expect(session().state).toBe(state);
    expect(upstream.requestsFor(MinsaEndpoint.HORAS)).toHaveLength(0);
    expect(upstream.requestsFor(MinsaEndpoint.CITAS)).toHaveLength(0);
    expect(session().slots[SlotKey.CITA_BEARER]).toBe(WHATSAPP_REFERENCE_TOKEN);
  });
});
