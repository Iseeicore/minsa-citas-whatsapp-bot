import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { AUTHENTICATED_WAITING_STATES, SESSION_IDLE_TIMEOUT_MS, TOKEN_EXPIRY_MARGIN_MS } from "@/lib/fsm/session/session-expiry-guard";
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { OtherReferenciaButtonId } from "@/lib/enums/other-referencia-button-id";
import { SendType } from "@/lib/enums/send-type";
import { REFERENCIA_GOODBYE_TEXT } from "@/lib/constants/textos/referencia";
import { InboundEventType } from "@/lib/enums/inbound-event-type";

const FROM = "sandbox-referencia-expiry";
const NOW = Date.parse("2026-10-14T15:00:00Z");
const DNI = "12345678";

const text = (value: string): InboundEvent => ({ channel: "whatsapp", from: FROM, type: "text", text: value });
const queryResult = (queryKind: QueryKind, result: unknown): QueryResultEvent => ({
  channel: "whatsapp",
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind,
  result,
});

function jwt(expSeconds: number): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ exp: expSeconds })}.signature`;
}

function waiting(state: Session["state"], options: { idleMs?: number; bearer?: string } = {}): Session {
  return {
    state,
    slots: {
      [SlotKey.CITA_BEARER]: options.bearer ?? "opaque-token",
      [SlotKey.CITA_DNI]: DNI,
      [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS,
    },
    counters: {},
    updatedAt: new Date(NOW - (options.idleMs ?? 0)),
  };
}

const turn = (session: Session, event: HandleEvent): HandlerResult => handle(session, event, NOW);
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);

const REFERENCIA_WAITING_STATES = [
  SessionState.REFERENCIA_AWAITING_CITA_OFFER,
  SessionState.CITA_AWAITING_REFERENCIA_SELECT,
  SessionState.CITA_AWAITING_REFERENCIA_CONFIRM,
];

describe("the referencias waiting states are protected like the rest of the authenticated ones", () => {
  it("are listed as authenticated waiting states", () => {
    for (const state of REFERENCIA_WAITING_STATES) expect(AUTHENTICATED_WAITING_STATES).toContain(state);
  });

  it.each(REFERENCIA_WAITING_STATES)("%s: idle for too long asks to re-verify instead of trapping the person", (state) => {
    const result = turn(waiting(state, { idleMs: SESSION_IDLE_TIMEOUT_MS + 1 }), text("si"));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REAUTH);
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_DNI]).toBe(DNI);
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
    expect(result.session.slots[SlotKey.CITA_RESUME_STATE]).toBeUndefined();
    expect(queries(result)).toEqual([]);
  });

  it.each(REFERENCIA_WAITING_STATES)("%s: an expired token asks to re-verify", (state) => {
    const expired = jwt(Math.floor(NOW / 1000) + Math.floor(TOKEN_EXPIRY_MARGIN_MS / 1000) - 1);

    const result = turn(waiting(state, { bearer: expired }), text("si"));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REAUTH);
  });

  it("a recent session with a valid token is left alone", () => {
    const result = turn(waiting(SessionState.REFERENCIA_AWAITING_CITA_OFFER, { idleMs: 1000 }), text("no"));

    expect(result.session.state).toBe(SessionState.REFERENCIA_CLOSED);
  });

  it("after re-verifying, the referencias are looked up again", () => {
    const reauth = turn(waiting(SessionState.REFERENCIA_AWAITING_CITA_OFFER, { idleMs: SESSION_IDLE_TIMEOUT_MS + 1 }), text("si")).session;

    const accepted = turn(reauth, text("si"));
    expect(accepted.session.state).toBe(SessionState.CITA_VALIDATE_PENDING);
    expect(queries(accepted)).toHaveLength(1);

    const valid = turn(accepted.session, queryResult(QueryKind.VALIDATE_USER, { status: "valid", twofaId: "twofa" }));
    expect(valid.session.state).toBe(SessionState.CITA_AWAITING_OTP);

    const code = turn(valid.session, text("1234"));
    expect(code.session.state).toBe(SessionState.CITA_VERIFY_PENDING);

    const verified = turn(code.session, queryResult(QueryKind.VERIFY_CODE, { status: "verified", token: "new-token" }));
    expect(verified.session.state).toBe(SessionState.REFERENCIA_LOOKUP_PENDING);
    expect(queries(verified)).toEqual([{ kind: QueryKind.LIST_REFERENCES, payload: { numeroDocumento: DNI, tipoDocumento: "01" } }]);
  });

  it("declining to re-verify leaves through the usual exit", () => {
    const reauth = turn(waiting(SessionState.CITA_AWAITING_REFERENCIA_SELECT, { idleMs: SESSION_IDLE_TIMEOUT_MS + 1 }), text("si")).session;

    const result = turn(reauth, text("no"));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_EXIT_CONFIRM);
  });

  it("the closed state is terminal: a long silence does not ask for anything", () => {
    const closed: Session = { ...waiting(SessionState.REFERENCIA_CLOSED, { idleMs: SESSION_IDLE_TIMEOUT_MS * 10 }) };

    const result = turn(closed, text("hola"));

    expect(result.session.state).toBe(SessionState.MAIN_MENU);
    expect(queries(result)).toEqual([]);
  });

  it("the lookup in flight is not interrupted by an expiry check", () => {
    const pending = waiting(SessionState.REFERENCIA_LOOKUP_PENDING, { idleMs: SESSION_IDLE_TIMEOUT_MS * 10 });

    const result = turn(pending, queryResult(QueryKind.LIST_REFERENCES, { statusReference: "empty", message: "", data: [] }));

    expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_CITA_OFFER);
  });

  it.each([text("no"), { from: FROM, type: InboundEventType.BUTTON, listId: OtherReferenciaButtonId.NO, channel: "whatsapp" as const }])(
    "No en la pregunta de otra referencia cierra sin OTP aunque el JWT haya vencido: %j",
    (event) => {
      const session = waiting(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE, { bearer: jwt(Math.floor(NOW / 1000) - 1) });
      const result = turn(session, event);
      expect(result.session).toEqual({ state: SessionState.REFERENCIA_CLOSED, slots: {}, counters: {} });
      expect(result.effects).toEqual([{ kind: SendType.TEXT, text: REFERENCIA_GOODBYE_TEXT }]);
    },
  );

  it("Sí con JWT vencido conserva el propósito de releer referencias y no consulta cupos todavía", () => {
    const session = waiting(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE, { bearer: jwt(Math.floor(NOW / 1000) - 1) });
    session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID] = "synthetic-reference";
    const result = turn(session, { channel: "whatsapp", from: FROM, type: InboundEventType.BUTTON, listId: OtherReferenciaButtonId.YES });
    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REAUTH);
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBeUndefined();
    expect(queries(result)).toEqual([]);
  });
});
