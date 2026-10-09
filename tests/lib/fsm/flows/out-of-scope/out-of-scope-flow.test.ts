import { describe, expect, it } from "vitest";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { OOS_MESSAGES, type OosCategory } from "@/lib/fsm/flows/out-of-scope/out-of-scope-messages";
import { OosCategory as OosCategoryEnum } from "@/lib/enums/oos-category";
import type { HandlerResult, InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "sandbox-oos";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const menu = (slots: Session["slots"] = {}): Session => ({ state: "main_menu", slots, counters: {} });
const at = (state: Session["state"], slots: Session["slots"] = {}): Session => ({ state, slots, counters: {} });

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);
const oosNote = (result: HandlerResult) => result.notes?.find((note) => note.kind === "out_of_scope");

const SAMPLE: Array<[OosCategory, string]> = [
  [OosCategoryEnum.OOS_01, "Mi mamá no puede respirar"],
  [OosCategoryEnum.OOS_02, "¿Mi SIS está activo?"],
  [OosCategoryEnum.OOS_03, "¿Ya aceptaron mi referencia?"],
  [OosCategoryEnum.OOS_04, "¿Ya salieron mis análisis de sangre?"],
  [OosCategoryEnum.OOS_05, "¿Tienen Paracetamol o Insulina en la posta?"],
  [OosCategoryEnum.OOS_06, "¿Qué días vacunan contra la influenza?"],
  [OosCategoryEnum.OOS_07, "Quiero hablar con un doctor ahorita"],
  [OosCategoryEnum.OOS_08, "Mi reclamo N° 458-2026 sigue sin resolverse"],
  [OosCategoryEnum.OOS_09, "Necesito que me sellen mi descanso médico para mi trabajo"],
];

const STAYING = SAMPLE.filter(([category]) => category !== OosCategoryEnum.OOS_01);

describe("in the main menu: the fixed message, no AI, and the citizen stays in the menu", () => {
  it.each(STAYING)("%s: %j", (category, message) => {
    const result = handle(menu(), text(message));

    expect(sent(result)).toEqual([{ kind: "send_text", text: OOS_MESSAGES[category] }]);
    expect(queries(result)).toHaveLength(0);
    expect(result.session).toEqual({ state: "main_menu", slots: {}, counters: {} });
    expect(oosNote(result)).toMatchObject({ detail: { category } });
  });

  it("the emergency is logged as a warning so it stands out; the others as information", () => {
    expect(oosNote(handle(menu(), text("mi hijo no respira")))?.level).toBe("warn");
    expect(oosNote(handle(menu(), text("¿Mi SIS está activo?")))?.level).toBeUndefined();
  });

  it("keeps what the menu already knew, but never stores the consultation as the opening message", () => {
    const result = handle(menu({ [SlotKey.NOMBRE]: "kept" }), text("¿Tienen vacunas?"));

    expect(result.session.slots).toEqual({ [SlotKey.NOMBRE]: "kept" });
    expect(result.session.slots[SlotKey.INITIAL_MESSAGE_TEXT]).toBeUndefined();
  });
});

describe("the order: emergency, then the lexical guard, then the rest", () => {
  it("a scared citizen who insults still gets the emergency number, not the institutional warning", () => {
    const result = handle(menu(), text("ustedes son unos idiotas, mi mamá no puede respirar"));

    expect(sent(result)).toEqual([{ kind: "send_text", text: OOS_MESSAGES["OOS-01"] }]);
  });

  it("any other consultation that insults is answered by the guard first", () => {
    const result = handle(menu(), text("eres un idiota, ¿hay vacunas?"));

    expect(sent(result)[0]).toMatchObject({ kind: "send_buttons" });
    expect(oosNote(result)).toBeUndefined();
  });

  it("a request for a cita with what the flow needs is not taken for a consultation", () => {
    const result = handle(menu(), text("quiero una cita de odontología en Miraflores"));

    expect(result.session.state).toBe("cita_awaiting_dni");
  });

  it("a real complaint request still opens the complaint flow", () => {
    expect(handle(menu(), text("quiero hacer un reclamo")).session.state).toBe("incidencia_awaiting_ubicacion");
  });
});

describe("after a finished flow, the first message is read the same way", () => {
  it.each(["cita_booked", "cita_booking_rejected", "incidencia_confirmed"])("%s + a consultation gets the message, not the welcome", (state) => {
    const result = handle(at(state as Session["state"], { [SlotKey.CITA_DNI]: "12345678" }), text("¿Tienen vacunas para mi bebé?"));

    expect(sent(result)).toEqual([{ kind: "send_text", text: OOS_MESSAGES["OOS-06"] }]);
    expect(result.session).toEqual({ state: "main_menu", slots: {}, counters: {} });
  });

  it("an emergency is answered before the guard here too", () => {
    const result = handle(at("cita_booked"), text("idiotas, mi hijo no respira"));

    expect(sent(result)).toEqual([{ kind: "send_text", text: OOS_MESSAGES["OOS-01"] }]);
  });
});

describe("never inside a flow: each step reads what it asked for", () => {
  it("the DNI step keeps asking for a DNI", () => {
    const result = handle(at("cita_awaiting_dni"), text("vacunas"));

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(sent(result)[0]).toMatchObject({ text: expect.stringContaining("Documento inválido") });
  });

  it("the description of a complaint is evidence, whatever words it holds", () => {
    const result = handle(at("incidencia_awaiting_descripcion", { [SlotKey.DNI]: "12345678" }), text("No me entregaron mis medicamentos y nadie me explicó por qué"));

    expect(JSON.stringify(result.effects)).not.toContain(OOS_MESSAGES["OOS-05"]);
    expect(oosNote(result)).toBeUndefined();
  });

  it("the one exception is an emergency: it ends the conversation instead of being read as a wrong answer", () => {
    const result = handle(at("cita_awaiting_dni"), text("ambulancia"));

    expect(sent(result)).toEqual([{ kind: "send_text", text: OOS_MESSAGES["OOS-01"] }]);
    expect(result.session).toEqual({ state: "emergency_closed", slots: {}, counters: {} });
  });
});

describe("the words the messages ask the citizen to type", () => {
  it.each(["CITAS", "citas", "Cita"])("%j opens the Cita flow, with no AI", (word) => {
    const result = handle(menu(), text(word));

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(queries(result)).toHaveLength(0);
    expect(sent(result)[0]).toMatchObject({ text: expect.stringContaining("documento") });
  });

  it("«CONTINUAR» goes back to the menu, with no AI", () => {
    const result = handle(menu(), text("CONTINUAR"));

    expect(sent(result).map((effect) => effect.kind)).toEqual(["send_interactive_list"]);
    expect(queries(result)).toHaveLength(0);
  });

  it("«RECLAMO» still opens the complaint flow", () => {
    expect(handle(menu(), text("RECLAMO")).session.state).toBe("incidencia_awaiting_ubicacion");
  });

  it("the whole conversation: an out-of-scope question, then CITAS", () => {
    const first = handle(menu(), text("¿Ya salieron mis análisis de sangre?"));
    const second = handle(first.session, text("CITAS"));

    expect(sent(first)[0]).toMatchObject({ text: expect.stringContaining("escriba CITAS") });
    expect(second.session.state).toBe("cita_awaiting_dni");
  });

  it("a bare cita request now resolves deterministically, no AI needed", () => {
    const result = handle(menu(), text("quiero una cita"));

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("cita_awaiting_dni");
  });
});

describe("first contact", () => {
  it.each(STAYING)("%s as the very first message: the message, and the session waits in the menu", (category, message) => {
    const result = handleFirstContact(message, "whatsapp");

    expect(sent(result)).toEqual([{ kind: "send_text", text: OOS_MESSAGES[category] }]);
    expect(result.session).toEqual({ state: "main_menu", slots: {}, counters: {} });
    expect(oosNote(result)).toMatchObject({ detail: { category } });
  });

  it("«CITAS» as the first message opens the Cita flow", () => {
    expect(handleFirstContact("CITAS", "whatsapp").session.state).toBe("cita_awaiting_dni");
  });

  it("a greeting still gets the welcome, and a plain request its flow", () => {
    expect(sent(handleFirstContact("Hola", "whatsapp"))[0]).toMatchObject({ kind: "send_cta_url" });
    expect(handleFirstContact("quiero una cita de odontología en Miraflores", "whatsapp").session.state).toBe("cita_awaiting_dni");
  });
});
