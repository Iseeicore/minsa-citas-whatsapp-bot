import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { serializeOffered, type OfferedList } from "@/lib/fsm/parsing/selection/selection-matchers";
import { resumeStateFor } from "@/lib/fsm/session/session-expiry-guard";
import type { HandlerResult, InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "sandbox-exit-session";
const NOW = Date.parse("2026-09-19T15:00:00Z");
const minutes = (count: number) => count * 60_000;

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const EXIT_QUESTION = "Parece que prefieres no continuar con tu cita. Entiendo que pueda ser frustrante. ¿Deseas salir?";
const GOODBYE = "Entendido. Cuando quieras retomar tu cita, escríbenos. ¡Que tengas un buen día! 👋";
const REAUTH_PROMPT =
  "⏳ Tu sesión ha expirado por inactividad. Por tu seguridad, necesitamos confirmar nuevamente tu identidad para continuar con tu cita. ¿Deseas solicitar un nuevo código de verificación?\n\n[1] Sí, enviar código\n[2] Cancelar";

const fechas: OfferedList = {
  text: "Selecciona la fecha:",
  rows: [
    { id: "22/09/2026", title: "mar 22 sep", description: "3 cupo(s) disponibles" },
    { id: "23/09/2026", title: "mié 23 sep", description: "2 cupo(s) disponibles" },
  ],
};

function askedToLeave(resumeState: string, options: { idleMs: number; bearer?: boolean }): Session {
  return {
    state: "cita_awaiting_exit_confirm",
    slots: {
      ...(options.bearer === false ? {} : { [SlotKey.CITA_BEARER]: "opaque-token" }),
      [SlotKey.CITA_DNI]: "12345678",
      [SlotKey.CITA_EXIT_RESUME_STATE]: resumeState,
      [SlotKey.CITA_OFFERED]: serializeOffered(fechas),
    },
    counters: {},
    updatedAt: new Date(NOW - options.idleMs),
  };
}

const reauthWaiting = (): Session => ({
  state: "cita_awaiting_reauth",
  slots: { [SlotKey.CITA_DNI]: "12345678", [SlotKey.CITA_RESUME_STATE]: "cita_fecha_pending" },
  counters: {},
});

describe("resumeStateFor on the exit question", () => {
  it("resumes the step the citizen was on before being asked to leave", () => {
    expect(resumeStateFor("cita_awaiting_exit_confirm", { [SlotKey.CITA_EXIT_RESUME_STATE]: "cita_awaiting_fecha_select" })).toBe(
      "cita_fecha_pending",
    );
  });

  it("resumes nothing for a step that resumes nothing, and ignores steps before login", () => {
    expect(resumeStateFor("cita_awaiting_exit_confirm", { [SlotKey.CITA_EXIT_RESUME_STATE]: "cita_awaiting_distrito_ai" })).toBeUndefined();
    expect(resumeStateFor("cita_awaiting_exit_confirm", { [SlotKey.CITA_EXIT_RESUME_STATE]: "cita_awaiting_dni" })).toBeUndefined();
    expect(resumeStateFor("cita_awaiting_exit_confirm", {})).toBeUndefined();
  });
});

describe("answering the exit question after the session expired", () => {
  it.each([
    ["No, continuar", tap("cita_salir_no")],
    ["Sí, salir", tap("cita_salir_si")],
    ["typed continuar", text("continuar")],
  ])("«%s» first shows the expired-session alert", (_label, event) => {
    const result = handle(askedToLeave("cita_awaiting_fecha_select", { idleMs: minutes(15) }), event, NOW);

    expect(result.session.state).toBe("cita_awaiting_reauth");
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_RESUME_STATE]).toBe("cita_fecha_pending");
    expect(result.session.slots[SlotKey.CITA_EXIT_RESUME_STATE]).toBeUndefined();
    const prompt = sent(result)[0];
    expect(prompt.kind === "send_buttons" && prompt.text).toBe(REAUTH_PROMPT);
  });

  it("with the session still alive, «No, continuar» goes back to the list as before", () => {
    const result = handle(askedToLeave("cita_awaiting_fecha_select", { idleMs: minutes(3) }), tap("cita_salir_no"), NOW);

    expect(result.session.state).toBe("cita_awaiting_fecha_select");
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("opaque-token");
    expect(sent(result).map((effect) => effect.kind)).toContain("send_interactive_list");
  });

  it("before login there is no session to check: the answer is processed", () => {
    const result = handle(
      askedToLeave("cita_awaiting_dni", { idleMs: minutes(60), bearer: false }),
      tap("cita_salir_no"),
      NOW,
    );

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(sent(result)).toEqual([{ kind: "send_text", text: "Ingresa tu número de documento." }]);
  });
});

describe("cancelling the expired-session alert", () => {
  it.each([
    ["button", tap("cita_reauth_no")],
    ["typed 2", text("2")],
    ["typed cancelar", text("cancelar")],
  ])("%s asks whether the citizen is sure to leave", (_label, event) => {
    const result = handle(reauthWaiting(), event, NOW);

    expect(result.session.state).toBe("cita_awaiting_exit_confirm");
    expect(result.session.slots[SlotKey.CITA_EXIT_RESUME_STATE]).toBe("cita_awaiting_reauth");
    expect(result.session.slots[SlotKey.CITA_DNI]).toBe("12345678");
    const question = sent(result)[0];
    expect(question.kind === "send_buttons" && question.text).toBe(EXIT_QUESTION);
  });

  it("«Sí, salir» closes the cita and ends the session", () => {
    const asking = handle(reauthWaiting(), tap("cita_reauth_no"), NOW).session;
    const result = handle(asking, tap("cita_salir_si"), NOW);

    expect(result.session.state).toBe("cita_abandoned");
    expect(result.session.slots).toEqual({});
    expect(sent(result)).toEqual([{ kind: "send_text", text: GOODBYE }]);
  });

  it("«No, continuar» brings the expired-session alert back, keeping what was on file", () => {
    const asking = handle(reauthWaiting(), tap("cita_reauth_no"), NOW).session;
    const result = handle(asking, tap("cita_salir_no"), NOW);

    expect(result.session.state).toBe("cita_awaiting_reauth");
    expect(result.session.slots[SlotKey.CITA_DNI]).toBe("12345678");
    expect(result.session.slots[SlotKey.CITA_RESUME_STATE]).toBe("cita_fecha_pending");
    expect(result.session.slots[SlotKey.CITA_EXIT_RESUME_STATE]).toBeUndefined();
    const prompt = sent(result)[0];
    expect(prompt.kind === "send_buttons" && prompt.text).toBe(REAUTH_PROMPT);
  });
});
