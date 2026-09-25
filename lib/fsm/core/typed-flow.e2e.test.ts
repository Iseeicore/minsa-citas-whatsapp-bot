import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboundEvent, SendEffect, Session } from "./types";

// End-to-end through the REAL runTurn (handlers + executor + fake adapters).
// Only persistence is replaced by an in-memory map, so no database is needed.
const store = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) =>
    (store.get(from) as Session | undefined) ?? { state: "main_menu", slots: {}, counters: {} },
  saveSession: async (from: string, session: Session) => {
    store.set(from, structuredClone(session));
  },
}));

import { runTurn } from "./executor";

const FROM = "sandbox-e2e";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });

async function say(value: string) {
  const { sent, session } = await runTurn(FROM, text(value));
  return { sent, session, texts: sent.map(describeEffect) };
}

function describeEffect(effect: SendEffect): string {
  if (effect.kind === "send_interactive_list") return `[list] ${effect.text}`;
  if (effect.kind === "send_buttons") return `[buttons] ${effect.text}`;
  if (effect.kind === "send_cta_url") return `[cta] ${effect.text}`;
  return effect.text;
}

describe("typed Cita flow end to end (fake adapters)", () => {
  beforeEach(() => {
    store.clear();
    delete process.env.SANDBOX_USE_REAL_MINSA;
    delete process.env.SANDBOX_USE_REAL_RENIEC;
    delete process.env.SANDBOX_USE_REAL_AI;
    // The fake catalog offers tomorrow and the day after (Lima); pin the clock
    // so the dates are deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T05:00:00-05:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("books a whole appointment using only typed answers", async () => {
    const greeting = await say("Hola");
    expect(greeting.session.state).toBe("main_menu");
    expect(greeting.sent[0].kind).toBe("send_interactive_list");

    // Free text with intent + especialidad: skips the menu (fake AI, no network).
    const intent = await say("quiero una cita de odontología");
    expect(intent.session.state).toBe("cita_awaiting_dni");

    const dni = await say("12345678");
    expect(dni.session.state).toBe("cita_awaiting_otp");

    const otp = await say("1234");
    expect(otp.session.state).toBe("cita_awaiting_distrito_ai");

    // District typed as a phrase; the specialty hint from the opening message
    // is applied and the single fake establishment auto-selected, so the next
    // stop is the list of dates.
    const distrito = await say("en Lurigancho");
    expect(distrito.session.state).toBe("cita_awaiting_fecha_select");
    expect(distrito.texts.some((line) => line.includes("Especialidad detectada"))).toBe(true);

    const fecha = await say("la segunda");
    expect(fecha.session.state).toBe("cita_awaiting_hora_select");

    // 24h from MINSA (09:30), 12h from the citizen: a typed time is CONFIRMED,
    // never booked directly.
    const hora = await say("a las 9 y media");
    expect(hora.session.state).toBe("cita_awaiting_hora_confirm");
    expect(hora.texts[0]).toContain("9:30 AM");
    expect(hora.sent.some((effect) => effect.kind === "send_buttons")).toBe(true);

    const confirmed = await say("sí");
    expect(confirmed.session.state).toBe("cita_booked");
    expect(confirmed.texts.some((line) => line.startsWith("[cta]"))).toBe(true);
  });

  it("garbage typed into every list step never books and never leaves the flow", async () => {
    await say("quiero una cita de odontología");
    await say("12345678");
    await say("1234");
    await say("en Lurigancho");

    const junk = await say("asdf");
    expect(junk.session.state).toBe("cita_awaiting_fecha_select");
    expect(junk.texts[0]).toBe("Selecciona una opción de la lista.");

    const insult = await say("hdp");
    expect(insult.session.state).toBe("cita_awaiting_fecha_select");
    expect(insult.texts[0]).toContain("política de respeto");
  });

  // Regression: with the specialty AND the district already known and a single
  // establishment, the OTP turn auto-resolves verify_code -> ubigeo ->
  // especialidades -> establecimientos -> fechas (6 passes). The executor used to
  // cap a turn at 5 passes, threw, and left the citizen stuck at the OTP step.
  it("an insulting request that names specialty and district reaches the date list in the same OTP turn", async () => {
    const warning = await say("Apúrense cojudos quiero cita de odontología en Lurigancho");
    expect(warning.session.state).toBe("cita_awaiting_dni");
    expect(warning.session.slots.citaEspecialidadHintText).toBe("Odontología");
    expect(warning.session.slots.citaDistritoHintText).toBe("Lurigancho");

    await say("12345678");
    const otp = await say("1234");

    expect(otp.session.state).toBe("cita_awaiting_fecha_select");
    expect(otp.texts.some((line) => line.includes("Especialidad detectada"))).toBe(true);
    expect(otp.texts.some((line) => line.includes("Establecimiento encontrado"))).toBe(true);
  });

  it("routes an angry complaint straight to the Reclamo flow with no AI step", async () => {
    const result = await say("Doctora imbécil no me dio mi medicina");

    expect(result.session.state).toBe("reclamo_identity_choice");
    expect(result.texts.some((line) => line.includes("Libro de Reclamaciones"))).toBe(true);
  });

  it("answers a pure insult with the institutional warning and lets the citizen continue", async () => {
    const warning = await say("hdp");
    expect(warning.session.state).toBe("main_menu");
    expect(warning.texts[0]).toContain("escriba RECLAMO");

    const menu = await runTurn(FROM, { from: FROM, type: "button", listId: "continuar_menu" });
    expect(menu.sent[0].kind).toBe("send_interactive_list");

    const reclamo = await say("RECLAMO");
    expect(reclamo.session.state).toBe("reclamo_identity_choice");
  });
});
