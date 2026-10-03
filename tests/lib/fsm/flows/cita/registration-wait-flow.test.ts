import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";

const FROM = "sandbox-registration";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const notValid = (): QueryResultEvent => ({ from: FROM, type: "query_result", queryKind: "validate_user", result: { status: "not_valid" } });

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const buttonIds = (result: HandlerResult): string[] | undefined => {
  const buttons = sent(result).find((e) => e.kind === "send_buttons");
  return buttons?.kind === "send_buttons" ? buttons.buttons.map((b) => b.id) : undefined;
};
const texts = (result: HandlerResult): string[] =>
  sent(result).filter((e) => e.kind === "send_text" || e.kind === "send_cta_url").map((e) => (e as { text: string }).text);

function validatePending(checks = 0): Session {
  return { state: "cita_validate_pending", slots: { citaDniPending: "12345678" }, counters: { citaRegistrationChecks: checks } };
}

describe("ciclo de 3 intentos de registro en MINSADIGITAL", () => {
  it("intento 1: mensaje de siempre, con los 2 botones (reintentar / no continuar)", () => {
    const result = handle(validatePending(0), notValid());

    expect(result.session.state).toBe("cita_registration_wait");
    expect(result.session.counters.citaRegistrationChecks).toBe(1);
    expect(texts(result).join(" ")).toContain("Todavía no encontramos tu registro");
    expect(buttonIds(result)).toEqual(["cita_registration_retry", "cita_registration_cancel"]);
  });

  it("intento 2: mensaje distinto (consciente de ser un reintento), con los mismos 2 botones", () => {
    const result = handle(validatePending(1), notValid());

    expect(result.session.state).toBe("cita_registration_wait");
    expect(result.session.counters.citaRegistrationChecks).toBe(2);
    const message = texts(result).join(" ");
    expect(message).not.toContain("Todavía no encontramos tu registro en MINSADIGITAL. Este proceso puede tardar unos minutos.");
    expect(message.toLowerCase()).toContain("segunda vez");
    expect(buttonIds(result)).toEqual(["cita_registration_retry", "cita_registration_cancel"]);
  });

  it("intento 3: cierra igual que hoy, sin botones (terminal)", () => {
    const result = handle(validatePending(2), notValid());

    expect(result.session.state).toBe("cita_registration_rejected");
    expect(texts(result)).toEqual([
      "No pudimos encontrar tu registro después de varios intentos. Intenta de nuevo más tarde en MINSADIGITAL.\n\nSi el problema continúa, puedes revisar el portal de MINSA para encontrar el correo o número de contacto que te pueda ayudar a resolverlo.",
    ]);
    expect(sent(result).some((e) => e.kind === "send_buttons")).toBe(false);
  });
});

function registrationWait(checks = 1): Session {
  return { state: "cita_registration_wait", slots: { citaDniPending: "12345678" }, counters: { citaRegistrationChecks: checks } };
}

describe("botón 'No quiero continuar' en cita_registration_wait", () => {
  it("lleva a la confirmación de salida existente (mismo mecanismo que el texto libre)", () => {
    const result = handle(registrationWait(), tap("cita_registration_cancel"));

    expect(result.session.state).toBe("cita_awaiting_exit_confirm");
    expect(sent(result)[0]).toMatchObject({ kind: "send_buttons", text: expect.stringContaining("¿Deseas salir?") });
  });

  it("confirmar la salida termina la conversación", () => {
    let step = handle(registrationWait(), tap("cita_registration_cancel"));
    step = handle(step.session, tap("cita_salir_si"));

    expect(step.session.state).toBe("cita_abandoned");
  });

  it("declinar la salida vuelve a mostrar los botones de reintento", () => {
    let step = handle(registrationWait(), tap("cita_registration_cancel"));
    step = handle(step.session, tap("cita_salir_no"));

    expect(step.session.state).toBe("cita_registration_wait");
    expect(buttonIds(step)).toEqual(["cita_registration_retry", "cita_registration_cancel"]);
  });

  it("el texto libre de salida (ya existente) sigue funcionando igual", () => {
    const result = handle(registrationWait(), text("ya no quiero seguir"));
    expect(result.session.state).toBe("cita_awaiting_exit_confirm");
  });

  it("'Ya me registré' sigue disparando la validación, sin cambios", () => {
    const result = handle(registrationWait(), tap("cita_registration_retry"));

    expect(result.session.state).toBe("cita_validate_pending");
    expect(result.effects.some((e) => isQueryEffect(e) && e.kind === "validate_user")).toBe(true);
  });
});
