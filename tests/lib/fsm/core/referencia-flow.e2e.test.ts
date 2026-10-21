import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import type { ListReferencesResult } from "@/lib/integrations/minsa/types";
import { ReferenceStatus } from "@/lib/enums/reference-status";

const store = vi.hoisted(() => new Map<string, unknown>());
const bookingCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const referencias = vi.hoisted(() => ({ result: { statusReference: "empty", message: "", data: [] } as ListReferencesResult, calls: 0 }));

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

vi.mock("@/lib/integrations/minsa/references", () => ({
  listReferences: async (): Promise<ListReferencesResult> => {
    referencias.calls += 1;
    return referencias.result;
  },
}));

import { runTurn } from "@/lib/fsm/core/executor";

const FROM = "sandbox-referencia-e2e";
const DOCUMENTO = "12345678";

const SIN_REFERENCIAS: ListReferencesResult = { statusReference: ReferenceStatus.EMPTY, message: "", data: [] };
const UNA_REFERENCIA: ListReferencesResult = {
  statusReference: ReferenceStatus.FOUND,
  message: "",
  data: [
    {
      idReferencia: "1364486",
      numero: "00123",
      fechaInicio: "24/07/2024 23:03",
      ipressOrigen: "SAN FERNANDO",
      ipressDestino: "HOSPITAL MARIA AUXILIADORA",
      upsOrigen: "MEDICINA GENERAL",
      upsDestino: "GASTROENTEROLOGÍA",
      codigoIpressDestino: "5987",
      codigoUpsDestino: "222800",
      estado: 7,
    },
  ],
};

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "list", listId: id });

async function say(event: InboundEvent) {
  const { sent, session } = await runTurn(FROM, event);
  return { sent, session, texts: sent.map(describeEffect) };
}

function describeEffect(effect: SendEffect): string {
  if (effect.kind === "send_interactive_list") return `[list] ${effect.text}`;
  if (effect.kind === "send_buttons") return `[buttons] ${effect.text}`;
  if (effect.kind === "send_cta_url") return `[cta] ${effect.text}`;
  return effect.text;
}

async function login(entry: string = "quiero una cita de odontología") {
  await say(text("Hola"));
  const intent = await say(text(entry));
  expect(intent.session.state).toBe("cita_awaiting_dni");
  const withDni = await say(text(DOCUMENTO));
  expect(withDni.session.state).toBe("cita_awaiting_otp");
  return say(text("1234"));
}

const loginForReferencias = () => login("quiero consultar mi referencia");

describe("servicio Consultar referencia de punta a punta (adaptadores simulados, referencias inyectadas)", () => {
  beforeEach(() => {
    store.clear();
    bookingCalls.length = 0;
    referencias.result = SIN_REFERENCIAS;
    referencias.calls = 0;
    delete process.env.SANDBOX_USE_REAL_MINSA;
    delete process.env.SANDBOX_USE_REAL_RENIEC;
    delete process.env.SANDBOX_USE_REAL_AI;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T05:00:00-05:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("con una referencia, la elige, salta distrito/establecimiento/especialidad y agenda enviando referencia_id", async () => {
    referencias.result = UNA_REFERENCIA;
    const otp = await loginForReferencias();
    expect(otp.session.state).toBe("cita_awaiting_referencia_select");
    expect(otp.texts.some((line) => line.startsWith("[list]"))).toBe(true);
    expect(referencias.calls).toBe(1);

    const selected = await say(tap("1364486"));
    expect(selected.session.state).toBe("cita_awaiting_fecha_select");
    expect(selected.texts.some((line) => line.includes("distrito"))).toBe(false);
    expect(selected.texts.join(" ")).not.toContain("¿Es esta tu referencia?");

    const fecha = await say(text("la segunda"));
    expect(fecha.session.state).toBe("cita_awaiting_hora_select");

    const hora = await say(text("a las 9 y media"));
    expect(hora.session.state).toBe("cita_awaiting_hora_confirm");

    const booked = await say(text("sí"));
    expect(booked.session.state).toBe("cita_booked");

    expect(bookingCalls).toHaveLength(1);
    expect(bookingCalls[0]).toMatchObject({
      codigoRenipress: "5987",
      codigoUps: "222800",
      numeroDocumentoPaciente: DOCUMENTO,
      referenciaId: "1364486",
    });
  });

  it("sin referencias, acepta una cita: sigue sin pedir documento ni código y se agenda sin referenciaId", async () => {
    const otp = await loginForReferencias();
    expect(otp.session.state).toBe("referencia_awaiting_cita_offer");
    expect(otp.texts.join(" ")).toContain("No cuentas con referencias registradas.");
    expect(otp.texts.join(" ")).toContain("¿Deseas agendar una cita?");

    const accepted = await say(text("sí"));
    expect(accepted.session.state).toBe("cita_awaiting_distrito_ai");
    expect(accepted.texts.join(" ")).not.toContain("documento");

    await say(text("en Lurigancho"));
    await say(text("odontología"));
    await say(text("la segunda"));
    await say(text("a las 9 y media"));
    const booked = await say(text("sí"));

    expect(booked.session.state).toBe("cita_booked");
    expect(bookingCalls).toHaveLength(1);
    expect(bookingCalls[0]).not.toHaveProperty("referenciaId");
  });

  it("sin referencias, rechaza la cita: se despide y la siguiente conversación empieza de cero", async () => {
    await loginForReferencias();

    const declined = await say(text("no"));
    expect(declined.session.state).toBe("referencia_closed");
    expect(declined.session.slots).toEqual({});
    expect(declined.texts).toEqual([
      "Entendido. Cuando necesites consultar una referencia o agendar una cita, escríbenos. ¡Que tengas un buen día!",
    ]);

    const next = await say(text("hola"));
    expect(next.session.state).toBe("main_menu");
  });

  it("la cita normal consulta referencias y avanza directamente cuando no hay ninguna", async () => {
    const otp = await login();

    expect(otp.session.state).toBe("cita_awaiting_distrito_ai");
    expect(referencias.calls).toBe(1);
  });

  it("la cita con referencias disponibles ofrece ambas modalidades antes de continuar", async () => {
    referencias.result = UNA_REFERENCIA;

    const otp = await login();

    expect(otp.session.state).toBe("referencia_awaiting_appointment_mode");
    expect(referencias.calls).toBe(1);
  });
});
