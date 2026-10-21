import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import type { ListFechasResult, ListReferencesResult, ReferenciaItem } from "@/lib/integrations/minsa/types";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { CatalogStatus } from "@/lib/enums/catalog-status";
import { ReferenciaEleccionButtonId } from "@/lib/enums/referencia-eleccion-button-id";
import { ReferenciaSinCuposButtonId } from "@/lib/enums/referencia-sin-cupos-button-id";

const store = vi.hoisted(() => new Map<string, unknown>());
const bookingCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const referencias = vi.hoisted(() => ({ result: undefined as unknown, calls: 0 }));
const sinFechas = vi.hoisted(() => new Set<string>());

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) => (store.get(from) as Session | undefined) ?? { state: "main_menu", slots: {}, counters: {} },
  saveSession: async (from: string, session: Session) => {
    store.set(from, structuredClone(session));
  },
}));

vi.mock("@/lib/integrations/minsa/booking", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/integrations/minsa/booking")>();
  return {
    ...original,
    bookAppointment: (params: Record<string, unknown>, bearer: string) => {
      bookingCalls.push(params);
      return original.bookAppointment(params as Parameters<typeof original.bookAppointment>[0], bearer);
    },
  };
});

vi.mock("@/lib/integrations/minsa/catalog", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/integrations/minsa/catalog")>();
  return {
    ...original,
    listFechas: async (codEess: string, especialidadId: string, bearer: string): Promise<ListFechasResult> =>
      sinFechas.has(codEess) ? { status: CatalogStatus.EMPTY } : original.listFechas(codEess, especialidadId, bearer),
  };
});

vi.mock("@/lib/integrations/minsa/references", () => ({
  listReferences: async (): Promise<ListReferencesResult> => {
    referencias.calls += 1;
    return referencias.result as ListReferencesResult;
  },
}));

import { runTurn } from "@/lib/fsm/core/executor";

const FROM = "sandbox-cita-con-referencia-e2e";
const DOCUMENTO = "12345678";

const REFERENCIA: ReferenciaItem = {
  idReferencia: "ksbLbKT9MVfb",
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
const OTRA: ReferenciaItem = {
  ...REFERENCIA,
  idReferencia: "Qp7xLm2RtV9a",
  numero: "02442",
  fechaInicio: "03/03/2016 09:45",
  ipressDestino: "HOSPITAL NACIONAL DOS DE MAYO",
  codigoIpressDestino: "6206",
  estado: 3,
  estadoDescripcion: "ACEPTADO",
};
const REGISTRADA: ReferenciaItem = { ...REFERENCIA, idReferencia: "Kd3nWs8YbH1c", estado: 1, estadoDescripcion: "REGISTRADO" };

const found = (data: ReferenciaItem[]): ListReferencesResult => ({ statusReference: ReferenceStatus.FOUND, message: "", data });

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });

const transcript: string[] = [];

function describeEffect(effect: SendEffect): string {
  if (effect.kind === "send_interactive_list")
    return `[list] ${effect.text} ${effect.rows.map((row) => `{${row.title} | ${row.description}}`).join(" ")}`;
  if (effect.kind === "send_buttons") return `[buttons] ${effect.text} ${effect.buttons.map((button) => `[${button.title}]`).join(" ")}`;
  if (effect.kind === "send_cta_url") return `[cta] ${effect.text}`;
  return effect.text;
}

async function say(event: InboundEvent) {
  const { sent, session } = await runTurn(FROM, event);
  const lines = sent.map(describeEffect);
  transcript.push(`> ${event.type === "text" ? event.text : `(tap ${event.listId})`}`, ...lines);
  return { sent, session, texts: lines };
}

async function login() {
  await say(text("Hola"));
  await say(text("quiero una cita de odontología"));
  await say(text(DOCUMENTO));
  return say(text("1234"));
}

describe("Agendar una cita con referencia, de punta a punta", () => {
  beforeEach(() => {
    store.clear();
    bookingCalls.length = 0;
    referencias.calls = 0;
    referencias.result = found([REGISTRADA, REFERENCIA, OTRA]);
    sinFechas.clear();
    transcript.length = 0;
    delete process.env.SANDBOX_USE_REAL_MINSA;
    delete process.env.SANDBOX_USE_REAL_RENIEC;
    delete process.env.SANDBOX_USE_REAL_AI;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T05:00:00-05:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("con referencia: elige, confirma, salta al día y agenda con referencia_id", async () => {
    const otp = await login();
    expect(otp.session.state).toBe("cita_awaiting_referencia_eleccion");
    expect(otp.texts).toContain("Un momento, estamos analizando tu cuenta…");
    expect(referencias.calls).toBe(1);

    const listed = await say(tap(ReferenciaEleccionButtonId.CON));
    expect(listed.session.state).toBe("cita_awaiting_referencia_select");
    expect(listed.texts.join(" ")).not.toContain("Registrado");

    const selected = await say(tap(REFERENCIA.idReferencia));
    expect(selected.session.state).toBe("cita_awaiting_referencia_confirm");

    const confirmed = await say(text("sí"));
    expect(confirmed.session.state).toBe("cita_awaiting_fecha_select");
    expect(confirmed.texts.join(" ")).not.toContain("distrito");

    await say(text("la segunda"));
    await say(text("a las 9 y media"));
    const booked = await say(text("sí"));

    expect(booked.session.state).toBe("cita_booked");
    expect(bookingCalls).toHaveLength(1);
    expect(bookingCalls[0]).toMatchObject({ codigoRenipress: "5987", codigoUps: "220000", referenciaId: REFERENCIA.idReferencia });
    expect(referencias.calls).toBe(1);
  });

  it("sin programación: ofrece ver otra, la otra sí tiene días y se agenda con ella", async () => {
    sinFechas.add(REFERENCIA.codigoIpressDestino);
    await login();
    await say(tap(ReferenciaEleccionButtonId.CON));
    await say(tap(REFERENCIA.idReferencia));

    const sinCupos = await say(text("sí"));
    expect(sinCupos.session.state).toBe("cita_awaiting_referencia_sin_cupos");

    const otra = await say(tap(ReferenciaSinCuposButtonId.VER_OTRA));
    expect(otra.session.state).toBe("cita_awaiting_referencia_select");
    expect(otra.texts.join(" ")).toContain("Sin programación");

    await say(tap(OTRA.idReferencia));
    const confirmed = await say(text("sí"));
    expect(confirmed.session.state).toBe("cita_awaiting_fecha_select");

    await say(text("la segunda"));
    await say(text("a las 9 y media"));
    const booked = await say(text("sí"));

    expect(booked.session.state).toBe("cita_booked");
    expect(bookingCalls[0]).toMatchObject({ codigoRenipress: "6206", referenciaId: OTRA.idReferencia });
    expect(referencias.calls).toBe(1);
  });

  it("sin programación: la cita sin referencia sigue al distrito y se agenda sin referencia_id", async () => {
    sinFechas.add(REFERENCIA.codigoIpressDestino);
    await login();
    await say(tap(ReferenciaEleccionButtonId.CON));
    await say(tap(REFERENCIA.idReferencia));
    await say(text("sí"));

    const sinReferencia = await say(tap(ReferenciaSinCuposButtonId.SIN_REFERENCIA));
    expect(sinReferencia.session.state).toBe("cita_awaiting_distrito_ai");

    await say(text("en Lurigancho"));
    await say(text("odontología"));
    await say(text("la segunda"));
    await say(text("a las 9 y media"));
    const booked = await say(text("sí"));

    expect(booked.session.state).toBe("cita_booked");
    expect(bookingCalls[0]).not.toHaveProperty("referenciaId");
  });

  it("sin referencias que permitan agendar: sigue al distrito sin preguntar", async () => {
    referencias.result = found([REGISTRADA]);

    const otp = await login();

    expect(otp.session.state).toBe("cita_awaiting_distrito_ai");
    expect(otp.texts.join(" ")).not.toContain("¿Cómo deseas agendar tu cita?");
  });

  it("si la consulta de referencias falla: sigue al distrito sin preguntar y sin gastar otro código", async () => {
    referencias.result = { statusReference: ReferenceStatus.ERROR, message: "", data: [] };

    const otp = await login();

    expect(otp.session.state).toBe("cita_awaiting_distrito_ai");
    expect(otp.session.slots.citaBearer).toBeTruthy();
  });
});
