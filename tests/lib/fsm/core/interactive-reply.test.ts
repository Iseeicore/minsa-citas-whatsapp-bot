import { describe, expect, expectTypeOf, it } from "vitest";
import { SendOutcomeKind } from "@/lib/enums/send-outcome-kind";
import {
  acceptTap,
  consumeOnStateChange,
  currentInteractiveId,
  isStaleTap,
  readInteractiveTracking,
  trackSent,
  withInteractiveTracking,
} from "@/lib/fsm/core/interactive-reply";
import { isInteractiveEffect } from "@/lib/utils/interactive-effect";
import { buildTerminosEffect } from "@/lib/fsm/flows/cita/steps/terminos/terminos-gate";
import type {
  InboundEvent,
  SendButtonsEffect,
  SendEffect,
  SendInteractiveListEffect,
  SendConsentEffect,
  Session,
} from "@/lib/fsm/core/types";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "51999000333";

const tap = (fields: Partial<InboundEvent> = {}): InboundEvent => ({
  from: FROM,
  type: InboundEventType.BUTTON,
  listId: "registrar",
  ...fields,
});

const session = (slots: Session["slots"] = {}): Session => ({ state: SessionState.INCIDENCIA_CONFIRM_REGISTRO, slots, counters: {} });

const remembered = (messageId: string, consumed = false): Session["slots"] => ({
  [SlotKey.INTERACTIVE_MESSAGE_ID]: messageId,
  ...(consumed ? { [SlotKey.INTERACTIVE_MESSAGE_CONSUMED]: true } : {}),
});

const BUTTONS: SendEffect = { kind: SendType.BUTTONS, text: "¿Registrar?", buttons: [{ id: "registrar", title: "Registrar" }] };
const LIST: SendEffect = { kind: SendType.INTERACTIVE_LIST, text: "Elige", rows: [{ id: "1", title: "Uno" }] };
const TEXT: SendEffect = { kind: SendType.TEXT, text: "hola" };
const CTA: SendEffect = { kind: SendType.CTA_URL, text: "Entra", buttonText: "Abrir", url: "https://example.test" };

describe("isInteractiveEffect", () => {
  it("solo los botones, las listas y los términos esperan un toque de vuelta", () => {
    expect(isInteractiveEffect(BUTTONS)).toBe(true);
    expect(isInteractiveEffect(LIST)).toBe(true);
    expect(isInteractiveEffect(buildTerminosEffect())).toBe(true);
    expect(isInteractiveEffect(TEXT)).toBe(false);
    expect(isInteractiveEffect(CTA)).toBe(false);
  });

  it("estrecha el tipo a botones, lista o términos para quien filtra con ella", () => {
    const effects: SendEffect[] = [BUTTONS, TEXT, LIST, CTA];
    const interactive = effects.filter(isInteractiveEffect);

    expectTypeOf(interactive).toEqualTypeOf<(SendButtonsEffect | SendInteractiveListEffect | SendConsentEffect)[]>();
    expect(interactive.map((effect) => effect.kind)).toEqual([SendType.BUTTONS, SendType.INTERACTIVE_LIST]);
  });
});

describe("isStaleTap", () => {
  it("un toque sobre el último mensaje interactivo sin consumir es válido", () => {
    expect(isStaleTap(session(remembered("wamid.actual")), tap({ replyTo: "wamid.actual" }))).toBe(false);
  });

  it("un toque sobre un mensaje anterior es viejo", () => {
    expect(isStaleTap(session(remembered("wamid.actual")), tap({ replyTo: "wamid.anterior" }))).toBe(true);
  });

  it("un segundo toque sobre un mensaje ya consumido es viejo", () => {
    expect(isStaleTap(session(remembered("wamid.actual", true)), tap({ replyTo: "wamid.actual" }))).toBe(true);
  });

  it("deja pasar el toque cuando no hay mensaje recordado o el toque no dice a qué mensaje responde", () => {
    expect(isStaleTap(session(), tap({ replyTo: "wamid.cualquiera" }))).toBe(false);
    expect(isStaleTap(session(remembered("wamid.actual", true)), tap())).toBe(false);
  });

  it("un texto nunca es un toque viejo, aunque traiga un identificador de respuesta", () => {
    const typed: InboundEvent = { from: FROM, type: InboundEventType.TEXT, text: "registrar", replyTo: "wamid.anterior" };

    expect(isStaleTap(session(remembered("wamid.actual")), typed)).toBe(false);
  });
});

describe("el seguimiento del último mensaje interactivo", () => {
  it("un toque aceptado consume el mensaje recordado", () => {
    const tracking = acceptTap(readInteractiveTracking(remembered("wamid.actual")), tap({ replyTo: "wamid.actual" }));

    expect(tracking).toEqual({ messageId: "wamid.actual", consumed: true });
  });

  it("un texto no consume el mensaje recordado", () => {
    const typed: InboundEvent = { from: FROM, type: InboundEventType.TEXT, text: "hola" };

    expect(acceptTap(readInteractiveTracking(remembered("wamid.actual")), typed)).toEqual({ messageId: "wamid.actual", consumed: false });
  });

  it("un nuevo mensaje interactivo enviado pasa a ser el recordado, sin consumir", () => {
    const tracking = trackSent({ messageId: "wamid.viejo", consumed: true }, BUTTONS, {
      kind: SendOutcomeKind.SENT,
      messageId: "wamid.nuevo",
    });

    expect(tracking).toEqual({ messageId: "wamid.nuevo", consumed: false });
  });

  it("un texto o un enlace enviados no cambian lo recordado", () => {
    const before = { messageId: "wamid.viejo", consumed: true };

    expect(trackSent(before, TEXT, { kind: SendOutcomeKind.SENT, messageId: "wamid.texto" })).toEqual(before);
    expect(trackSent(before, CTA, { kind: SendOutcomeKind.SENT, messageId: "wamid.cta" })).toEqual(before);
  });

  it("un interactivo entregado sin identificador olvida el anterior, para que su toque no se tome por viejo", () => {
    expect(trackSent({ messageId: "wamid.viejo", consumed: false }, LIST, { kind: SendOutcomeKind.SENT_NO_ID })).toEqual({
      consumed: false,
    });
  });

  it.each([
    ["rechazado por Meta", { kind: SendOutcomeKind.REJECTED, status: 400 } as const],
    ["caído en la red", { kind: SendOutcomeKind.FAILED } as const],
  ])("un interactivo %s no deja la sesión esperando un toque: el anterior queda consumido", (_case, outcome) => {
    expect(trackSent({ messageId: "wamid.viejo", consumed: false }, LIST, outcome)).toEqual({ messageId: "wamid.viejo", consumed: true });
  });

  it("escribe lo recordado en la sesión y no agrega nada cuando no hay nada que recordar", () => {
    const written = withInteractiveTracking(session({ [SlotKey.DNI]: "x" }), { messageId: "wamid.nuevo", consumed: false });

    expect(written.slots).toEqual({ [SlotKey.DNI]: "x", [SlotKey.INTERACTIVE_MESSAGE_ID]: "wamid.nuevo" });
    expect(withInteractiveTracking(session(), { consumed: false }).slots).toEqual({});
    expect(withInteractiveTracking(session(), { messageId: "wamid.a", consumed: true }).slots).toEqual(remembered("wamid.a", true));
  });

  it("un cambio de estado consume el mensaje recordado, salvo que el turno haya enviado uno nuevo", () => {
    const start = { messageId: "wamid.viejo", consumed: false };

    expect(consumeOnStateChange(start, start, true)).toEqual({ messageId: "wamid.viejo", consumed: true });
    expect(consumeOnStateChange(start, start, false)).toEqual(start);
    expect(consumeOnStateChange(start, { messageId: "wamid.nuevo", consumed: false }, true)).toEqual({
      messageId: "wamid.nuevo",
      consumed: false,
    });
    expect(consumeOnStateChange({ consumed: false }, { consumed: false }, true)).toEqual({ consumed: false });
  });

  it("el identificador vigente es el recordado solo mientras no se haya consumido", () => {
    expect(currentInteractiveId(remembered("wamid.actual"))).toBe("wamid.actual");
    expect(currentInteractiveId(remembered("wamid.actual", true))).toBeUndefined();
    expect(currentInteractiveId({})).toBeUndefined();
  });
});
