import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INSTITUTIONAL_WARNING_TEXT, RESPECT_REMINDER_TEXT } from "@/lib/security/lexical-guard";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "sandbox-test";

beforeEach(() => {
  vi.stubEnv("MEDIA_STORAGE_BASE_URL", "https://media.example.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function text(value: string): InboundEvent {
  return { from: FROM, type: "text", text: value };
}

function tap(kind: "button" | "list", id: string): InboundEvent {
  return { from: FROM, type: kind, listId: id };
}

function sessionAt(state: Session["state"], slots: Session["slots"] = {}): Session {
  return { state, slots, counters: {} };
}

function sentEffects(result: ReturnType<typeof handle>): SendEffect[] {
  return result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
}

function hasQuery(result: ReturnType<typeof handle>): boolean {
  return result.effects.some(isQueryEffect);
}

describe("main_menu — lexical guard routing", () => {
  it("pure aggression: warns with a Continuar button, no AI query, does not store the insult", () => {
    const result = handle(sessionAt("main_menu"), text("hdp"));

    expect(result.session.state).toBe("main_menu");
    expect(result.session.slots[SlotKey.INITIAL_MESSAGE_TEXT]).toBeUndefined();
    expect(hasQuery(result)).toBe(false);

    const [effect] = sentEffects(result);
    expect(effect).toMatchObject({
      kind: "send_buttons",
      text: INSTITUTIONAL_WARNING_TEXT,
      buttons: [{ id: "continuar_menu", title: "Continuar" }],
    });
  });

  it("aggression with cita intent: warns and continues into the Cita flow without AI", () => {
    const result = handle(sessionAt("main_menu"), text("cojudos denme una cita"));

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(hasQuery(result)).toBe(false);
    const [effect] = sentEffects(result);
    expect(effect.kind).toBe("send_text");
    expect((effect as { text: string }).text).toContain(RESPECT_REMINDER_TEXT);
    expect((effect as { text: string }).text).toContain("documento");
  });

  it("aggression with a service complaint: goes straight to the incidencia flow without AI", () => {
    const result = handle(sessionAt("main_menu"), text("Doctora imbécil no me dio mi medicina"));

    expect(result.session.state).toBe("incidencia_awaiting_ubicacion");
    expect(hasQuery(result)).toBe(false);
    const [effect] = sentEffects(result);
    expect(effect.kind).toBe("send_text");
    expect((effect as { text: string }).text).toContain("¿En qué establecimiento de salud ocurrió?");
  });

  it("the Continuar button returns to the menu", () => {
    const result = handle(sessionAt("main_menu"), tap("button", "continuar_menu"));

    expect(result.session.state).toBe("main_menu");
    expect(sentEffects(result)[0].kind).toBe("send_interactive_list");
    expect(hasQuery(result)).toBe(false);
  });
});

describe("main_menu — incidencia keywords", () => {
  it.each(["RECLAMO", "reclamo", "Quiero hacer un reclamo", "registrar una queja", "INCIDENCIA", "quiero presentar una incidencia", "denuncia", "quiero hacer una denuncia"])(
    "%s starts the incidencia flow without AI",
    (message) => {
      const result = handle(sessionAt("main_menu"), text(message));

      expect(result.session.state).toBe("incidencia_awaiting_ubicacion");
      expect(hasQuery(result)).toBe(false);
    },
  );
});

describe("main_menu — deterministic greeting shortcut", () => {
  it.each(["hola", "Buenos días", "buenas tardes", "Hola!!"])(
    "%s shows the static menu with zero AI and without storing it as the opening message",
    (message) => {
      const result = handle(sessionAt("main_menu"), text(message));

      expect(result.session.state).toBe("main_menu");
      expect(result.session.slots[SlotKey.INITIAL_MESSAGE_TEXT]).toBeUndefined();
      expect(hasQuery(result)).toBe(false);
      expect(sentEffects(result)[0].kind).toBe("send_interactive_list");
    },
  );

  it("a clear cita word skips the AI entirely, even mixed with a greeting", () => {
    const result = handle(sessionAt("main_menu"), text("Buenas tarde, quiero agendar"));

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(hasQuery(result)).toBe(false);
  });

  it("still sends real content to the AI intent step when nothing deterministic matches", () => {
    const result = handle(sessionAt("main_menu"), text("Buenas tarde, no sé qué hacer"));

    expect(result.session.state).toBe("main_menu_intent_pending");
    expect(result.effects.some((effect) => isQueryEffect(effect) && effect.kind === "analyze_main_menu_intent")).toBe(true);
    expect(result.session.slots[SlotKey.INITIAL_MESSAGE_TEXT]).toBe("Buenas tarde, no sé qué hacer");
  });
});

describe("terminal re-entry", () => {
  it("a clean message after a finished cita gets the welcome alone, not the menu on top of it", () => {
    const result = handle(sessionAt("cita_booked"), text("Hola"));

    expect(result.session.state).toBe("main_menu");
    expect(sentEffects(result).map((effect) => effect.kind)).toEqual(["send_cta_url"]);
  });

  it("any other clean message after a finished cita gets the menu, not the welcome", () => {
    const result = handle(sessionAt("cita_booked"), text("quee ?"));

    expect(result.session.state).toBe("main_menu");
    expect(sentEffects(result).map((effect) => effect.kind)).toEqual(["send_interactive_list"]);
  });

  it("an abusive message after a finished cita is routed by the guard instead", () => {
    const result = handle(sessionAt("cita_booked"), text("hdp"));

    expect(result.session.state).toBe("main_menu");
    expect(sentEffects(result)[0]).toMatchObject({ kind: "send_buttons", text: INSTITUTIONAL_WARNING_TEXT });
  });
});

describe("mid-flow free-text district states", () => {
  it("an insult answers with a respect reminder, repeats the question and never queries", () => {
    const before = sessionAt("cita_awaiting_distrito_ai", { [SlotKey.CITA_BEARER]: "token" });
    const result = handle(before, text("hdp"));

    expect(result.session.state).toBe("cita_awaiting_distrito_ai");
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("token");
    expect(hasQuery(result)).toBe(false);

    const texts = sentEffects(result).map((effect) => (effect as { text: string }).text);
    expect(texts[0]).toBe(RESPECT_REMINDER_TEXT);
    expect(texts[1]).toContain("distrito");
  });

  it("does not promise the RECLAMO shortcut where it does not exist", () => {
    const result = handle(sessionAt("cita_awaiting_departamento"), text("cojudo"));
    const texts = sentEffects(result).map((effect) => (effect as { text: string }).text);
    expect(texts.join(" ")).not.toContain("RECLAMO");
  });

  it("a normal district still resolves through the existing chain", () => {
    const result = handle(sessionAt("cita_awaiting_distrito_ai"), text("Lurigancho"));

    expect(result.session.state).toBe("cita_ubigeo_pending");
    expect(result.effects.some((effect) => isQueryEffect(effect) && effect.kind === "search_ubigeo")).toBe(true);
  });
});

describe("bypass — states where the guard must never run", () => {
  it("an insult inside the complaint description is kept as evidence", () => {
    const result = handle(
      sessionAt("incidencia_awaiting_descripcion"),
      text("El doctor fue un idiota y me trató pésimo"),
    );

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(result.session.slots[SlotKey.DESCRIPCION_INCIDENCIA]).toBe("El doctor fue un idiota y me trató pésimo");
  });

  it("a name that looks like an abbreviation is accepted in the name step", () => {
    const result = handle(sessionAt("incidencia_awaiting_nombre_libre", { dni: "12345678" }), text("Isaac S. Mendoza"));
    expect(result.session.state).toBe("incidencia_awaiting_descripcion");
  });

  it("abusive text in the DNI step is just an invalid DNI", () => {
    const result = handle(sessionAt("cita_awaiting_dni"), text("hdp"));

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect((sentEffects(result)[0] as { text: string }).text).toContain("Documento inválido");
  });
});

describe("main_menu — numeric shortcut", () => {
  it.each(["1", " 1 ", "1\n"])("%j goes straight to the Cita flow without reprinting the menu", (message) => {
    const result = handle(sessionAt("main_menu"), text(message));

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(hasQuery(result)).toBe(false);
    expect(sentEffects(result).map((effect) => effect.kind)).toEqual(["send_text"]);
    expect((sentEffects(result)[0] as { text: string }).text).toContain("documento");
    expect(result.session.slots[SlotKey.MENU_CHOICE]).toBe("agendar_cita");
    expect(result.session.slots[SlotKey.INITIAL_MESSAGE_TEXT]).toBeUndefined();
  });

  it.each(["2", " 2 "])("%j goes straight to the incidencia flow without reprinting the menu", (message) => {
    const result = handle(sessionAt("main_menu"), text(message));

    expect(result.session.state).toBe("incidencia_awaiting_ubicacion");
    expect(hasQuery(result)).toBe(false);
    expect(sentEffects(result).map((effect) => effect.kind)).toEqual(["send_text"]);
    expect(result.session.slots[SlotKey.MENU_CHOICE]).toBe("registrar_incidencia");
  });

  it.each(["3", "0", "11", "12", "1 2", "uno"])("%j is not a menu shortcut and follows the normal path", (message) => {
    const result = handle(sessionAt("main_menu"), text(message));

    expect(["cita_awaiting_dni", "incidencia_identity_choice"]).not.toContain(result.session.state);
  });

  it("the numbers only mean a menu option in main_menu (a 1 inside another step is just input)", () => {
    const inDni = handle(sessionAt("cita_awaiting_dni"), text("1"));
    expect((sentEffects(inDni)[0] as { text: string }).text).toContain("Documento inválido");
  });
});
