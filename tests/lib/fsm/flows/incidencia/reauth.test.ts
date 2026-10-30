import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { detectIncidenciaExpiry, SESSION_IDLE_TIMEOUT_MS } from "@/lib/fsm/session/session-expiry-guard";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { InternalEventType } from "@/lib/enums/internal-event-type";

const FROM = "sandbox-incidencia-reauth";
const NOW = Date.parse("2026-10-11T15:00:00Z");
const minutes = (count: number) => count * 60_000;

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });

function waiting(state: Session["state"], options: { idleMs?: number; slots?: Session["slots"] } = {}): Session {
  return {
    state,
    slots: options.slots ?? {},
    counters: {},
    updatedAt: new Date(NOW - (options.idleMs ?? 0)),
  };
}

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);

describe("detectIncidenciaExpiry", () => {
  it("is idle after more than 10 minutes without activity, in a state that waits for the person", () => {
    const session = waiting("incidencia_awaiting_foto", { idleMs: minutes(15) });
    expect(detectIncidenciaExpiry(session, text("hola"), NOW)).toBe("idle");
  });

  it("is not idle at exactly the threshold, nor within it", () => {
    expect(detectIncidenciaExpiry(waiting("incidencia_awaiting_foto", { idleMs: SESSION_IDLE_TIMEOUT_MS }), text("x"), NOW)).toBeNull();
    expect(detectIncidenciaExpiry(waiting("incidencia_awaiting_foto", { idleMs: minutes(3) }), text("x"), NOW)).toBeNull();
  });

  it("never fires on synthetic query results, mid-turn", () => {
    const result: QueryResultEvent = { from: FROM, type: InternalEventType.QUERY_RESULT, queryKind: "buscar_establecimiento", result: {} };
    expect(detectIncidenciaExpiry(waiting("incidencia_ubicacion_pending", { idleMs: minutes(60) }), result, NOW)).toBeNull();
  });

  it("does not apply to a _pending state (it resolves within the same turn, never waits idle)", () => {
    expect(detectIncidenciaExpiry(waiting("incidencia_ubicacion_pending", { idleMs: minutes(60) }), text("x"), NOW)).toBeNull();
  });

  it("does not apply to a terminal state", () => {
    expect(detectIncidenciaExpiry(waiting("incidencia_confirmed", { idleMs: minutes(60) }), text("x"), NOW)).toBeNull();
  });

  it("does not apply to cita or other flows, even idle", () => {
    for (const state of ["cita_awaiting_hora_select", "main_menu", "consulta_awaiting_dni"]) {
      expect(detectIncidenciaExpiry(waiting(state as Session["state"], { idleMs: minutes(60) }), text("x"), NOW)).toBeNull();
    }
  });

  it("does not require a bearer or any auth slot (incidencia never has one)", () => {
    const session = waiting("incidencia_confirm_registro", { idleMs: minutes(20) });
    expect(session.slots[SlotKey.CITA_BEARER]).toBeUndefined();
    expect(detectIncidenciaExpiry(session, text("x"), NOW)).toBe("idle");
  });
});

describe("handle() with an idle incidencia session", () => {
  it("intercepts it, saves the exact step, and asks whether to continue", () => {
    const session = waiting("incidencia_awaiting_foto", { idleMs: minutes(15) });

    const result = handle(session, text("hola"), NOW);

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("incidencia_awaiting_reauth");
    expect(result.session.slots[SlotKey.INCIDENCIA_RESUME_STATE]).toBe("incidencia_awaiting_foto");

    const prompt = sent(result)[0];
    expect(prompt.kind).toBe("send_buttons");
    expect(prompt.kind === "send_buttons" && prompt.text).toContain("¿Deseas continuar donde la dejaste?");
  });

  it("lets an interaction within 10 minutes continue normally", () => {
    const session = waiting("incidencia_awaiting_foto", { idleMs: minutes(3) });

    const result = handle(session, tap("incidencia_foto_omitir"), NOW);

    expect(result.session.state).not.toBe("incidencia_awaiting_reauth");
  });

  it("does not disturb cita's own reauth for an authenticated cita session", () => {
    const session: Session = {
      state: "cita_awaiting_hora_select",
      slots: { [SlotKey.CITA_BEARER]: "opaque-token", [SlotKey.CITA_DNI]: "12345678" },
      counters: {},
      updatedAt: new Date(NOW - minutes(15)),
    };

    const result = handle(session, text("13:00"), NOW);

    expect(result.session.state).toBe("cita_awaiting_reauth");
    expect(result.session.slots[SlotKey.INCIDENCIA_RESUME_STATE]).toBeUndefined();
  });
});

describe("incidencia_awaiting_reauth", () => {
  it.each([
    ["button", tap("incidencia_reauth_no")],
    ["typed 2", text("2")],
    ["typed cancelar", text("cancelar")],
  ])("%s cancels cleanly, without registering anything", (_label, event) => {
    const session = waiting("incidencia_awaiting_reauth", {
      slots: { [SlotKey.INCIDENCIA_RESUME_STATE]: "incidencia_awaiting_foto" },
    });

    const result = handle(session, event, NOW);

    expect(result.session.state).toBe("incidencia_cancelled");
    expect(sent(result)[0].kind).toBe("send_text");
  });

  it("repeats the question for anything else, changing nothing", () => {
    const session = waiting("incidencia_awaiting_reauth", {
      slots: { [SlotKey.INCIDENCIA_RESUME_STATE]: "incidencia_awaiting_foto" },
    });

    const result = handle(session, text("no entendí"), NOW);

    expect(result.session.state).toBe("incidencia_awaiting_reauth");
    expect(sent(result).at(-1)?.kind).toBe("send_buttons");
  });

  it.each([
    ["button", tap("incidencia_reauth_si")],
    ["typed 1", text("1")],
    ["typed sí", text("Sí")],
  ])("%s resumes exactly at the saved step, with a leading note", (_label, event) => {
    const session = waiting("incidencia_awaiting_reauth", {
      slots: { [SlotKey.INCIDENCIA_RESUME_STATE]: "incidencia_awaiting_foto" },
    });

    const result = handle(session, event, NOW);

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(result.session.slots[SlotKey.INCIDENCIA_RESUME_STATE]).toBeUndefined();
    expect(sent(result)[0].text).toBe("¡Listo! Continuemos donde quedaste.");
    expect(sent(result).at(-1)?.kind).toBe("send_buttons");
  });

  it("resumes at the location confirmation with the establecimiento it had proposed, without searching again", () => {
    const propuesto = JSON.stringify({
      id: 1,
      areaId: 1,
      codigoRenipress: "6206",
      nombre: "HOSPITAL NACIONAL DOS DE MAYO",
      distrito: "Lima",
    });
    const session = waiting("incidencia_awaiting_reauth", {
      slots: {
        [SlotKey.INCIDENCIA_RESUME_STATE]: "incidencia_confirm_ubicacion",
        [SlotKey.INCIDENCIA_ESTABLECIMIENTO_PROPUESTO]: propuesto,
      },
    });

    const result = handle(session, tap("incidencia_reauth_si"), NOW);

    expect(result.session.state).toBe("incidencia_confirm_ubicacion");
    expect(queries(result)).toHaveLength(0);
    expect(sent(result).at(-1)?.kind).toBe("send_buttons");
    const buttons = sent(result).at(-1);
    expect(buttons?.kind === "send_buttons" && buttons.text).toContain("HOSPITAL NACIONAL DOS DE MAYO");
  });

  it("resumes the final checklist rebuilding the summary from the slots already saved", () => {
    const session = waiting("incidencia_awaiting_reauth", {
      slots: {
        [SlotKey.INCIDENCIA_RESUME_STATE]: "incidencia_confirm_registro",
        [SlotKey.DESCRIPCION_INCIDENCIA]: "Me cobraron sin recibo.",
        [SlotKey.INCIDENCIA_ESTABLECIMIENTO_NOMBRE]: "HOSPITAL NACIONAL DOS DE MAYO",
      },
    });

    const result = handle(session, tap("incidencia_reauth_si"), NOW);

    expect(result.session.state).toBe("incidencia_confirm_registro");
    const buttons = sent(result).at(-1);
    expect(buttons?.kind === "send_buttons" && buttons.text).toContain("Me cobraron sin recibo.");
  });

  it("resumes the consent step re-showing the consent, without re-checking the database", () => {
    const session = waiting("incidencia_awaiting_reauth", {
      slots: { [SlotKey.INCIDENCIA_RESUME_STATE]: "incidencia_consent_choice" },
    });

    const result = handle(session, tap("incidencia_reauth_si"), NOW);

    expect(result.session.state).toBe("incidencia_consent_choice");
    expect(queries(result)).toHaveLength(0);
    expect(sent(result).map((effect) => effect.kind)).toEqual(["send_text", "send_consent"]);
    expect(sent(result)[1]).toMatchObject({ text: "Para registrar tu denuncia necesitamos tu autorización." });
  });

  it("resumes the description draft step, choosing between the draft checklist and asking fresh depending on what is saved", () => {
    const withDraft = waiting("incidencia_awaiting_reauth", {
      slots: {
        [SlotKey.INCIDENCIA_RESUME_STATE]: "incidencia_confirm_borrador",
        [SlotKey.INCIDENCIA_BORRADOR]: "Me cobraron sin recibo en la ventanilla de admisión.",
      },
    });
    const withoutDraft = waiting("incidencia_awaiting_reauth", {
      slots: { [SlotKey.INCIDENCIA_RESUME_STATE]: "incidencia_awaiting_descripcion" },
    });

    const resumedWithDraft = handle(withDraft, tap("incidencia_reauth_si"), NOW);
    const resumedWithoutDraft = handle(withoutDraft, tap("incidencia_reauth_si"), NOW);

    expect(resumedWithDraft.session.state).toBe("incidencia_confirm_borrador");
    expect(resumedWithoutDraft.session.state).toBe("incidencia_awaiting_descripcion");
  });

  it("falls back to asking for the location again when there is nothing saved to resume", () => {
    const session = waiting("incidencia_awaiting_reauth", { slots: {} });

    const result = handle(session, tap("incidencia_reauth_si"), NOW);

    expect(result.session.state).toBe("incidencia_awaiting_ubicacion");
  });
});
