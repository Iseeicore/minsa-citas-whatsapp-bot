import { describe, expect, it } from "vitest";
import { askConfirmRegistro, handleConfirmRegistro, submitIncidencia } from "@/lib/fsm/flows/incidencia/pasos-comunes";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { findLimitViolations } from "@/lib/whatsapp/message-limits";
import type { HandlerResult, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionChannel } from "@/lib/enums/session-channel";
import { MAX_DESCRIPCION_LENGTH } from "@/lib/constants/limits/incidencia";
import { WHATSAPP_INTERACTIVE_BODY_MAX } from "@/lib/constants/limits/whatsapp";
import {
  CONFIRM_REGISTRO_BUTTONS,
  RESUMEN_DECLARACION_TEXT,
  RESUMEN_LISTO_TEXT,
  resumenDocumentoText,
} from "@/lib/constants/textos/incidencia";

const DESCRIPCION_MAXIMA = "d".repeat(MAX_DESCRIPCION_LENGTH);
const ESTABLECIMIENTO_LARGO = `Hospital Nacional ${"e".repeat(100)}`;

const session = (slots: Session["slots"]): Session => ({ state: "incidencia_awaiting_foto", slots, counters: {} });

const resumen = (result: HandlerResult): SendEffect => {
  const [effect] = result.effects.filter((item): item is SendEffect => !isQueryEffect(item));
  return effect;
};

const bodyOf = (effect: SendEffect): string => ("text" in effect ? effect.text : "");

const conImagenes = (cantidad: number): string =>
  JSON.stringify(Array.from({ length: cantidad }, (_, i) => `data:image/png;base64,AAAA${i}`));

describe("el registro lleva el canal de la conversación", () => {
  it.each([
    [undefined, SessionChannel.WHATSAPP],
    [SessionChannel.WHATSAPP, SessionChannel.WHATSAPP],
    [SessionChannel.WEB, SessionChannel.WEB],
  ])("una sesión con canal %s envía el canal %s", (channel, canal) => {
    const pending = { ...session({ [SlotKey.DESCRIPCION_INCIDENCIA]: "Me cobraron sin recibo." }), channel };
    const [register] = submitIncidencia(pending, "wa-1").effects.filter(isQueryEffect);

    expect(register.payload).toMatchObject({ submission: { canal } });
  });
});

describe("askConfirmRegistro: el resumen siempre cabe en el cuerpo interactivo de Meta", () => {
  it("un resumen corto sale completo, sin recortar nada", () => {
    const result = askConfirmRegistro(
      session({
        [SlotKey.DESCRIPCION_INCIDENCIA]: "Me cobraron sin recibo.",
        [SlotKey.INCIDENCIA_ESTABLECIMIENTO_NOMBRE]: "Hospital Loayza",
        [SlotKey.DNI]: "12345678",
      }),
    );

    expect(resumen(result)).toEqual({
      kind: "send_buttons",
      text: [
        RESUMEN_LISTO_TEXT,
        "Establecimiento: Hospital Loayza",
        "Relato: «Me cobraron sin recibo.»",
        resumenDocumentoText("5678"),
        "",
        RESUMEN_DECLARACION_TEXT,
      ].join("\n"),
      buttons: CONFIRM_REGISTRO_BUTTONS,
    });
  });

  it("con el relato máximo, establecimiento largo, documento e imágenes, solo se acorta el relato y termina en «…»", () => {
    const result = askConfirmRegistro(
      session({
        [SlotKey.DESCRIPCION_INCIDENCIA]: DESCRIPCION_MAXIMA,
        [SlotKey.INCIDENCIA_ESTABLECIMIENTO_NOMBRE]: ESTABLECIMIENTO_LARGO,
        [SlotKey.DNI]: "12345678",
        [SlotKey.INCIDENCIA_IMAGENES]: conImagenes(3),
      }),
    );
    const body = bodyOf(resumen(result));

    expect(findLimitViolations(resumen(result))).toEqual([]);
    expect(body.length).toBe(WHATSAPP_INTERACTIVE_BODY_MAX);
    expect(body).toContain(`Establecimiento: ${ESTABLECIMIENTO_LARGO}\n`);
    expect(body).toContain(`${resumenDocumentoText("5678")}\n`);
    expect(body).toContain("Imágenes adjuntas: 3\n");
    expect(body).toMatch(/Relato: «d+…»\n/);
    expect(body.endsWith(RESUMEN_DECLARACION_TEXT)).toBe(true);
  });

  it("el recorte es solo para mostrar: la sesión y el registro conservan el relato completo", () => {
    const shown = askConfirmRegistro(
      session({
        [SlotKey.DESCRIPCION_INCIDENCIA]: DESCRIPCION_MAXIMA,
        [SlotKey.INCIDENCIA_ESTABLECIMIENTO_NOMBRE]: ESTABLECIMIENTO_LARGO,
        [SlotKey.DNI]: "12345678",
      }),
    );

    expect(shown.session.slots[SlotKey.DESCRIPCION_INCIDENCIA]).toBe(DESCRIPCION_MAXIMA);

    const confirmed = handleConfirmRegistro(shown.session, {
      from: "51999999999",
      type: "button",
      listId: "incidencia_confirmar_registro_si",
    });
    const [register] = confirmed.effects.filter(isQueryEffect);

    expect(register.payload).toMatchObject({ submission: { descripcion: DESCRIPCION_MAXIMA, dni: "12345678" } });
  });

  it("si ni con el relato vacío cabría, también acorta el establecimiento", () => {
    const enorme = "x".repeat(3000);
    const result = askConfirmRegistro(
      session({
        [SlotKey.DESCRIPCION_INCIDENCIA]: DESCRIPCION_MAXIMA,
        [SlotKey.INCIDENCIA_ESTABLECIMIENTO_NOMBRE]: enorme,
      }),
    );
    const body = bodyOf(resumen(result));

    expect(findLimitViolations(resumen(result))).toEqual([]);
    expect(body.startsWith(RESUMEN_LISTO_TEXT)).toBe(true);
    expect(body).toContain("Establecimiento: ");
    expect(body.endsWith(RESUMEN_DECLARACION_TEXT)).toBe(true);
  });
});
