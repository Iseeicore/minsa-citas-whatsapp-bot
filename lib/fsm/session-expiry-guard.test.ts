import { describe, expect, it } from "vitest";
import { handle } from "./handlers";
import { isQueryEffect } from "./handlers-shared";
import {
  AUTHENTICATED_WAITING_STATES,
  decodeJwtExp,
  detectSessionExpiry,
  SESSION_IDLE_TIMEOUT_MS,
  TOKEN_EXPIRY_MARGIN_MS,
} from "./session-expiry-guard";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "./types";

const FROM = "sandbox-expiry";
const NOW = Date.parse("2026-09-19T15:00:00Z");
const minutes = (count: number) => count * 60_000;

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });

function jwt(expSeconds: number | undefined): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(expSeconds === undefined ? {} : { exp: expSeconds })}.signature`;
}

function authenticated(
  state: string,
  options: { idleMs?: number; bearer?: string; slots?: Session["slots"]; counters?: Session["counters"] } = {},
): Session {
  return {
    state,
    slots: {
      citaBearer: options.bearer ?? "opaque-token",
      citaDni: "12345678",
      citaUbigeo: "150101",
      citaEspecialidadId: "02",
      citaCodEess: "0000123",
      citaFecha: "31/12/2099",
      ...options.slots,
    },
    counters: options.counters ?? {},
    updatedAt: new Date(NOW - (options.idleMs ?? 0)),
  };
}

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);

describe("decodeJwtExp", () => {
  it("reads the exp claim of a JWT", () => {
    expect(decodeJwtExp(jwt(1_800_000_000))).toBe(1_800_000_000);
  });

  it.each(["", "opaque-token", "a.b.c", "a.b", `${"x".repeat(10)}.${Buffer.from("not json").toString("base64url")}.sig`])(
    "returns null for something that is not a JWT with an exp: %j",
    (token) => {
      expect(decodeJwtExp(token)).toBeNull();
    },
  );

  it("returns null when the payload has no numeric exp", () => {
    expect(decodeJwtExp(jwt(undefined))).toBeNull();
  });
});

describe("detectSessionExpiry", () => {
  it("is idle after more than 10 minutes without activity", () => {
    const session = authenticated("cita_awaiting_hora_select", { idleMs: minutes(15) });
    expect(detectSessionExpiry(session, text("13:00"), NOW)).toBe("idle");
  });

  it("is not idle at exactly 10 minutes, nor within it", () => {
    expect(detectSessionExpiry(authenticated("cita_awaiting_hora_select", { idleMs: SESSION_IDLE_TIMEOUT_MS }), text("x"), NOW)).toBeNull();
    expect(detectSessionExpiry(authenticated("cita_awaiting_hora_select", { idleMs: minutes(3) }), text("x"), NOW)).toBeNull();
  });

  it("expires a JWT whose exp is in the past", () => {
    const session = authenticated("cita_awaiting_fecha_select", { bearer: jwt(NOW / 1000 - 60) });
    expect(detectSessionExpiry(session, text("x"), NOW)).toBe("token_expired");
  });

  it("expires a JWT with less than 30 seconds left, keeps one with more", () => {
    const soon = authenticated("cita_awaiting_fecha_select", { bearer: jwt(NOW / 1000 + TOKEN_EXPIRY_MARGIN_MS / 1000 - 1) });
    const fine = authenticated("cita_awaiting_fecha_select", { bearer: jwt(NOW / 1000 + 600) });
    expect(detectSessionExpiry(soon, text("x"), NOW)).toBe("token_expired");
    expect(detectSessionExpiry(fine, text("x"), NOW)).toBeNull();
  });

  it("ignores an opaque token and a session without updatedAt (nothing to judge by)", () => {
    const session = authenticated("cita_awaiting_hora_select");
    delete session.updatedAt;
    expect(detectSessionExpiry(session, text("x"), NOW)).toBeNull();
  });

  it("never fires on synthetic query results, mid-turn", () => {
    const result: QueryResultEvent = { from: FROM, type: "query_result", queryKind: "list_horas", result: {} };
    const session = authenticated("cita_hora_pending", { idleMs: minutes(60) });
    expect(detectSessionExpiry(session, result, NOW)).toBeNull();
  });

  it("only applies to the authenticated waiting states", () => {
    for (const state of ["main_menu", "cita_awaiting_dni", "cita_awaiting_otp", "cita_awaiting_reauth", "reclamo_awaiting_descripcion"]) {
      expect(detectSessionExpiry(authenticated(state, { idleMs: minutes(60) }), text("x"), NOW)).toBeNull();
    }
    expect(AUTHENTICATED_WAITING_STATES).toContain("cita_awaiting_hora_confirm");
  });

  it("does nothing when there is no bearer to protect", () => {
    const session = authenticated("cita_awaiting_hora_select", { idleMs: minutes(60) });
    delete session.slots.citaBearer;
    expect(detectSessionExpiry(session, text("x"), NOW)).toBeNull();
  });
});

describe("handle() with an expired session", () => {
  it("intercepts a typed hora after 15 idle minutes: purges the bearer, keeps the DNI, asks to re-verify", () => {
    const session = authenticated("cita_awaiting_hora_select", {
      idleMs: minutes(15),
      slots: { citaHorasDia: "0800-0830", citaHoraConfirmId: "08:00|08:30", citaOffered: "{}" },
      counters: { citaHoraPage: 2 },
    });

    const result = handle(session, text("a las 8"), NOW);

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("cita_awaiting_reauth");
    expect(result.session.slots.citaBearer).toBeUndefined();
    expect(result.session.slots.citaDni).toBe("12345678");
    expect(result.session.slots.citaHorasDia).toBeUndefined();
    expect(result.session.slots.citaHoraConfirmId).toBeUndefined();
    expect(result.session.slots.citaOffered).toBeUndefined();
    expect(result.session.counters.citaHoraPage).toBeUndefined();
    expect(result.session.slots.citaResumeState).toBe("cita_hora_pending");

    const prompt = sent(result)[0];
    expect(prompt.kind).toBe("send_buttons");
    expect(prompt.kind === "send_buttons" && prompt.text).toContain("Tu sesión ha expirado por inactividad");
    expect(prompt.kind === "send_buttons" && prompt.text).toContain("[1] Sí, enviar código");
    expect(prompt.kind === "send_buttons" && prompt.text).toContain("[2] Cancelar y volver al menú");
  });

  it("cuts an already-expired JWT before any MINSA query, even when the citizen was active a second ago", () => {
    const session = authenticated("cita_awaiting_fecha_select", { bearer: jwt(NOW / 1000 - 5), idleMs: 1_000 });

    const result = handle(session, tap("31/12/2099"), NOW);

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("cita_awaiting_reauth");
    expect(result.session.slots.citaBearer).toBeUndefined();
    expect(result.session.slots.citaResumeState).toBe("cita_fecha_pending");
  });

  it("lets an interaction within 10 minutes continue normally", () => {
    const session = authenticated("cita_awaiting_fecha_select", { idleMs: minutes(3) });

    const result = handle(session, text("hola??"), NOW);

    expect(result.session.state).not.toBe("cita_awaiting_reauth");
    expect(result.session.slots.citaBearer).toBe("opaque-token");
  });

  it("does not resume anything for the district-gathering states", () => {
    const result = handle(authenticated("cita_awaiting_distrito_ai", { idleMs: minutes(20) }), text("Miraflores"), NOW);

    expect(result.session.state).toBe("cita_awaiting_reauth");
    expect(result.session.slots.citaResumeState).toBeUndefined();
  });
});

describe("cita_awaiting_reauth", () => {
  const waiting = (): Session => ({
    state: "cita_awaiting_reauth",
    slots: { citaDni: "12345678", citaResumeState: "cita_hora_pending", citaCodEess: "0000123" },
    counters: {},
  });

  it.each([
    ["button", tap("cita_reauth_si")],
    ["typed 1", text("1")],
    ["typed sí", text("Sí")],
  ])("%s requests a new code with the DNI already on file", (_label, event) => {
    const result = handle(waiting(), event, NOW);

    expect(result.session.state).toBe("cita_validate_pending");
    expect(result.session.slots.citaDniPending).toBe("12345678");
    expect(result.session.slots.citaResumeState).toBe("cita_hora_pending");
    expect(queries(result)).toEqual([{ kind: "validate_user", payload: { numeroDocumento: "12345678" } }]);
  });

  it.each([
    ["button", tap("cita_reauth_no")],
    ["typed 2", text("2")],
    ["typed cancelar", text("cancelar")],
  ])("%s goes back to the menu and forgets the session", (_label, event) => {
    const result = handle(waiting(), event, NOW);

    expect(result.session.state).toBe("main_menu");
    expect(result.session.slots).toEqual({});
    expect(sent(result)[0].kind).toBe("send_interactive_list");
  });

  it("repeats the question for anything else, changing nothing", () => {
    const result = handle(waiting(), text("quiero mi cita"), NOW);

    expect(result.session.state).toBe("cita_awaiting_reauth");
    expect(queries(result)).toHaveLength(0);
    expect(sent(result)[0].kind).toBe("send_buttons");
  });

  it("asks for the DNI when there is none on file", () => {
    const session = waiting();
    delete session.slots.citaDni;

    const result = handle(session, tap("cita_reauth_si"), NOW);

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(queries(result)).toHaveLength(0);
  });
});

describe("after the citizen agrees to verify again", () => {
  const result = (queryKind: QueryResultEvent["queryKind"], body: unknown): QueryResultEvent => ({
    from: FROM,
    type: "query_result",
    queryKind,
    result: body,
  });

  it("goes through OTP and resumes at the hora step, with a fresh token and the same choices", () => {
    let step = handle(
      authenticated("cita_awaiting_hora_confirm", { idleMs: minutes(30), slots: { citaHoraConfirmId: "08:00|08:30" } }),
      text("si"),
      NOW,
    );
    expect(step.session.state).toBe("cita_awaiting_reauth");

    step = handle(step.session, tap("cita_reauth_si"), NOW);
    step = handle(step.session, result("validate_user", { status: "valid", twofaId: "tf-1" }), NOW);
    expect(step.session.state).toBe("cita_awaiting_otp");

    step = handle(step.session, text("123456"), NOW);
    step = handle(step.session, result("verify_code", { status: "verified", token: "new-token" }), NOW);

    expect(step.session.slots.citaBearer).toBe("new-token");
    expect(step.session.slots.citaDni).toBe("12345678");
    expect(step.session.slots.citaResumeState).toBeUndefined();
    expect(step.session.state).toBe("cita_hora_pending");
    expect(queries(step)).toEqual([
      { kind: "list_horas", payload: { codEess: "0000123", especialidadId: "02", fecha: "31/12/2099" } },
    ]);
  });

  it("still recovers reactively when MINSA answers 401 despite the proactive checks", () => {
    const pending = authenticated("cita_hora_pending");
    const step = handle(pending, result("list_horas", { status: "unauthorized" }), NOW);

    expect(step.session.state).toBe("cita_awaiting_dni");
    expect(step.session.slots.citaBearer).toBeUndefined();
    expect(step.session.slots.citaResumeState).toBe("cita_hora_pending");
  });
});
