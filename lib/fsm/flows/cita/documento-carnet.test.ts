import { describe, expect, it } from "vitest";
import { INVALID_DOCUMENT_TEXT } from "@/lib/fsm/core/failure-texts";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryEffect, SendEffect, Session } from "@/lib/fsm/core/types";

const FROM = "sandbox-documento";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });

const queries = (result: HandlerResult): QueryEffect[] => result.effects.filter(isQueryEffect);
const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const at = (state: Session["state"], slots: Session["slots"] = {}): Session => ({ state, slots, counters: {} });

describe("cita_awaiting_dni: el largo del documento decide el tipo", () => {
  it.each([
    ["12345678", "01"],
    ["123456789", "03"],
  ])("%s valida el usuario con tipo %s", (documento, tipo) => {
    const result = handle(at("cita_awaiting_dni"), text(documento));

    expect(result.session.state).toBe("cita_validate_pending");
    expect(result.session.slots.citaDniPending).toBe(documento);
    expect(queries(result)).toEqual([{ kind: "validate_user", payload: { numeroDocumento: documento, tipoDocumento: tipo } }]);
  });

  it("recorta los espacios alrededor del carnet de extranjería", () => {
    const result = handle(at("cita_awaiting_dni"), text(" 123456789 "));

    expect(result.session.slots.citaDniPending).toBe("123456789");
    expect(queries(result)).toEqual([{ kind: "validate_user", payload: { numeroDocumento: "123456789", tipoDocumento: "03" } }]);
  });

  it.each(["1234567", "1234567890", "0", "abcdefgh", "1234 5678", "12345678a"])("%j sigue pidiendo el documento, sin consultar", (invalido) => {
    const result = handle(at("cita_awaiting_dni"), text(invalido));

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(queries(result)).toEqual([]);
    expect(sent(result)).toEqual([{ kind: "send_text", text: INVALID_DOCUMENT_TEXT }]);
  });
});

describe("«Ya me registré» conserva el tipo del documento", () => {
  it.each([
    ["12345678", "01"],
    ["123456789", "03"],
  ])("%s vuelve a validar con tipo %s", (documento, tipo) => {
    const result = handle(at("cita_registration_wait", { citaDniPending: documento }), tap("cita_registration_retry"));

    expect(result.session.state).toBe("cita_validate_pending");
    expect(queries(result)).toEqual([{ kind: "validate_user", payload: { numeroDocumento: documento, tipoDocumento: tipo } }]);
  });
});
