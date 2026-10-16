import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { CounterKey } from "@/lib/enums/counter-key";
import { SlotKey } from "@/lib/enums/slot-key";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { OTP_LOCKED_TEXT } from "@/lib/constants/textos/cita-identidad";
import { ASK_OTP_TEXT, codigoIncorrectoText } from "@/lib/constants/textos/identidad";
import { MAX_OTP_ATTEMPTS } from "@/lib/constants/limits/cita";

const FROM = "sandbox-otp";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const invalidCode = (): QueryResultEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind: "verify_code",
  result: { status: "invalid" },
});

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const texts = (result: HandlerResult): string[] => sent(result).map((effect) => ("text" in effect ? effect.text : ""));
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);

const awaitingOtp = (attempts = 0): Session => ({
  state: "cita_awaiting_otp",
  slots: { [SlotKey.CITA_TWOFA_ID]: "tw-1", [SlotKey.CITA_DNI_PENDING]: "12345678" },
  counters: attempts ? { [CounterKey.CITA_OTP_ATTEMPTS]: attempts } : {},
});

describe("el aviso del código de verificación", () => {
  it("no menciona la cantidad de dígitos y nombra teléfono o correo", () => {
    expect(ASK_OTP_TEXT).toBe("Te enviamos un código a tu teléfono o correo registrado. Escríbelo en el siguiente mensaje.");
    expect(ASK_OTP_TEXT).not.toMatch(/dígito|\d/);
  });
});

describe("un mensaje con formato inválido en el código cuenta como intento fallido", () => {
  it.each(["{ds", "abc", "12", "123456789", "12 34", "!!!!"])("«%s» descuenta un intento y no consulta a MINSA", (typed) => {
    const result = handle(awaitingOtp(), text(typed));

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("cita_awaiting_otp");
    expect(result.session.counters[CounterKey.CITA_OTP_ATTEMPTS]).toBe(1);
    expect(texts(result)).toEqual([codigoIncorrectoText(MAX_OTP_ATTEMPTS - 1)]);
  });

  it("un toque de botón también descuenta un intento y no consulta a MINSA", () => {
    const result = handle(awaitingOtp(), tap("cualquiera"));

    expect(queries(result)).toHaveLength(0);
    expect(result.session.counters[CounterKey.CITA_OTP_ATTEMPTS]).toBe(1);
    expect(texts(result)).toEqual([codigoIncorrectoText(MAX_OTP_ATTEMPTS - 1)]);
  });

  it("tres mensajes basura seguidos bloquean con el texto de agotamiento", () => {
    let step = handle(awaitingOtp(), text("{ds"));
    step = handle(step.session, text("hola"));
    expect(texts(step)).toEqual([codigoIncorrectoText(1)]);

    step = handle(step.session, text("???"));

    expect(step.session.state).toBe("cita_otp_locked");
    expect(texts(step)).toEqual([OTP_LOCKED_TEXT]);
    expect(queries(step)).toHaveLength(0);
  });

  it("el formato inválido y el código incorrecto comparten el mismo contador", () => {
    let step = handle(awaitingOtp(), text("{ds"));
    step = handle(step.session, text("123456"));
    expect(queries(step)).toMatchObject([{ kind: "verify_code" }]);

    step = handle(step.session, invalidCode());
    expect(step.session.counters[CounterKey.CITA_OTP_ATTEMPTS]).toBe(2);
    expect(texts(step)).toEqual([codigoIncorrectoText(1)]);

    step = handle(step.session, text("zzz"));
    expect(step.session.state).toBe("cita_otp_locked");
    expect(texts(step)).toEqual([OTP_LOCKED_TEXT]);
  });
});

describe("un código con formato válido pero incorrecto sigue descontando", () => {
  it("consulta a MINSA y, si responde inválido, descuenta un intento", () => {
    const sentCode = handle(awaitingOtp(), text("000000"));
    expect(queries(sentCode)).toMatchObject([{ kind: "verify_code", payload: { twofaId: "tw-1", code: "000000" } }]);

    const result = handle(sentCode.session, invalidCode());

    expect(result.session.state).toBe("cita_awaiting_otp");
    expect(result.session.counters[CounterKey.CITA_OTP_ATTEMPTS]).toBe(1);
    expect(texts(result)).toEqual([codigoIncorrectoText(MAX_OTP_ATTEMPTS - 1)]);
  });

  it("al agotar los intentos bloquea con el texto de agotamiento", () => {
    const sentCode = handle(awaitingOtp(MAX_OTP_ATTEMPTS - 1), text("000000"));
    const result = handle(sentCode.session, invalidCode());

    expect(result.session.state).toBe("cita_otp_locked");
    expect(texts(result)).toEqual([OTP_LOCKED_TEXT]);
  });
});
