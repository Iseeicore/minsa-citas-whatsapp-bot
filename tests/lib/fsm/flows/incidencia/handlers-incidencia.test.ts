import { describe, expect, it } from "vitest";
import { handleIncidencia } from "@/lib/fsm/flows/incidencia/handlers-incidencia";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { MediaFailure } from "@/lib/enums/media-failure";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import {
  ASK_DESCRIPCION_ANONIMO_TEXT,
  ASK_UBICACION_DENUNCIA_TEXT,
  AVISO_EMERGENCIA_DENUNCIA_TEXT,
  AVISO_PRIVACIDAD_TEXT,
  INCIDENCIA_CANCELADA_TEXT,
} from "@/lib/constants/textos/incidencia";

const FROM = "51999999999";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const file = (type: "image" | "document"): InboundEvent => ({ from: FROM, type, text: type === "image" ? "foto del cobro" : undefined });
const fotoIntentResult = (quiereOmitir: boolean): QueryResultEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind: "analyze_incidencia_foto_intent",
  result: { quiereOmitir },
});
const consentCheckResult = (aceptado: boolean): QueryResultEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind: "verificar_consentimiento",
  result: { aceptado },
});
const consentRegisterResult = (): QueryResultEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind: "registrar_consentimiento",
  result: { ok: true },
});

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const texts = (result: HandlerResult): string[] => sent(result).map((effect) => ("text" in effect ? effect.text : ""));
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);

const identityChoice = (): Session => ({ state: "incidencia_identity_choice", slots: {}, counters: {} });

describe("incidencia_identity_choice: documento o anónimo", () => {
  it("ofrece los botones documento/anónimo", () => {
    const result = handleIncidencia(identityChoice(), text("cualquier cosa"));

    expect(sent(result)[0]).toMatchObject({ kind: "send_text" });
    expect(sent(result)[1]).toMatchObject({
      kind: "send_buttons",
      text: "¿Deseas registrar tu denuncia con tu número de documento o prefieres que sea anónima?",
      buttons: [
        { id: "incidencia_con_documento", title: "Con mi documento" },
        { id: "incidencia_anonimo", title: "Prefiero ser anónimo" },
      ],
    });
  });

  it("'incidencia_con_documento' pide el número de documento, sin decir cuántos dígitos", () => {
    const result = handleIncidencia(identityChoice(), tap("incidencia_con_documento"));

    expect(result.session.state).toBe("incidencia_awaiting_dni");
    expect(texts(result)).toEqual(["Ingresa tu número de documento."]);
  });

  it("'incidencia_anonimo' pasa directo al relato, sin pedir documento ni volver a pedir la autorización", () => {
    const result = handleIncidencia(identityChoice(), tap("incidencia_anonimo"));

    expect(result.session.state).toBe("incidencia_awaiting_descripcion");
    expect(queries(result)).toEqual([]);
    expect(result.session.slots[SlotKey.DNI]).toBeUndefined();
    expect(texts(result)).toEqual(["Entendemos tu preferencia por el anonimato. Cuéntame tu denuncia (*hasta 1000 caracteres*)."]);
  });
});

describe("incidencia_awaiting_dni: el largo decide el tipo de documento", () => {
  const awaitingDni = (): Session => ({ state: "incidencia_awaiting_dni", slots: {}, counters: {} });

  it.each([
    ["un DNI de 8 dígitos", " 12345678 ", "12345678"],
    ["un carnet de extranjería de 9 dígitos", "123456789", "123456789"],
  ])("%s se guarda sin consultar a nadie y pasa al relato", (_label, typed, saved) => {
    const result = handleIncidencia(awaitingDni(), text(typed));

    expect(result.session.state).toBe("incidencia_awaiting_descripcion");
    expect(result.session.slots[SlotKey.DNI]).toBe(saved);
    expect(queries(result)).toEqual([]);
  });

  it("tocar «Continuar anónimo» sigue al relato, sin documento", () => {
    const result = handleIncidencia(awaitingDni(), tap("incidencia_anonimo"));

    expect(result.session.state).toBe("incidencia_awaiting_descripcion");
    expect(result.session.slots[SlotKey.DNI]).toBeUndefined();
    expect(texts(result)).toEqual([ASK_DESCRIPCION_ANONIMO_TEXT]);
  });

  it.each(["", "1234567", "1234567890", "abcdefgh", "1234 5678", "hdp"])(
    "%j no es un documento: lo pide de nuevo con la opción de seguir anónimo",
    (value) => {
      const result = handleIncidencia(awaitingDni(), text(value));

      expect(result.session.state).toBe("incidencia_awaiting_dni");
      expect(result.session.slots[SlotKey.DNI]).toBeUndefined();
      expect(queries(result)).toHaveLength(0);
      expect(sent(result)[0]).toMatchObject({
        kind: "send_buttons",
        text: "Documento inválido. Debe tener 8 dígitos (DNI) o 9 dígitos (carnet de extranjería). Intenta de nuevo.",
        buttons: [{ id: "incidencia_anonimo", title: "Continuar anónimo" }],
      });
    },
  );

  it("con un borrador ya escrito, lo ofrece usar apenas recibe el documento", () => {
    const session: Session = {
      ...awaitingDni(),
      slots: { [SlotKey.INCIDENCIA_BORRADOR]: "Me cobraron sin recibo en la ventanilla." },
    };
    const result = handleIncidencia(session, text("12345678"));

    expect(result.session.state).toBe("incidencia_confirm_borrador");
  });
});

describe("incidencia_awaiting_descripcion: ruido no se registra como incidencia", () => {
  const awaitingDescripcion = (): Session => ({ state: "incidencia_awaiting_descripcion", slots: {}, counters: {} });

  it("puro ruido no se guarda como incidencia, pide reintentar", () => {
    const result = handleIncidencia(awaitingDescripcion(), text("888(((#!#!#@@@"));

    expect(result.session.state).toBe("incidencia_awaiting_descripcion");
    expect(result.session.slots[SlotKey.DESCRIPCION_INCIDENCIA]).toBeUndefined();
    expect(texts(result)).toEqual(["No pudimos leer eso — ¿podrías escribirlo de nuevo?"]);
  });

  it.each(["cerrado", "me cobraron", "x".repeat(19)])("un relato demasiado corto (%j) se pide ampliar y no avanza", (corto) => {
    const result = handleIncidencia(awaitingDescripcion(), text(corto));

    expect(result.session.state).toBe("incidencia_awaiting_descripcion");
    expect(result.session.slots[SlotKey.DESCRIPCION_INCIDENCIA]).toBeUndefined();
    expect(texts(result)).toEqual(["Cuéntanos un poco más: escribe al menos 20 caracteres para poder entender lo que pasó."]);
  });

  it("un relato de exactamente 20 caracteres se acepta", () => {
    expect(handleIncidencia(awaitingDescripcion(), text("a".repeat(20))).session.state).toBe("incidencia_awaiting_foto");
  });

  it("una incidencia real con palabras pasa a ofrecer la evidencia", () => {
    const result = handleIncidencia(awaitingDescripcion(), text("El consultorio estaba cerrado."));

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(result.session.slots[SlotKey.DESCRIPCION_INCIDENCIA]).toBe("El consultorio estaba cerrado.");
    expect(texts(result)).toEqual([
      "¿Quieres enviar una *imagen (JPG o PNG, hasta 5 MB)* como evidencia? Es *opcional*: envíala ahora, o toca *Omitir* (o escribe OMITIR) para continuar sin ella.",
    ]);
  });

  it("un relato de más de 1000 caracteres se rechaza diciendo cuántos tiene", () => {
    const result = handleIncidencia(awaitingDescripcion(), text("a b ".repeat(300)));

    expect(result.session.state).toBe("incidencia_awaiting_descripcion");
    expect(result.session.slots[SlotKey.DESCRIPCION_INCIDENCIA]).toBeUndefined();
    expect(texts(result)).toEqual(["Tu mensaje tiene 1199 caracteres; el máximo es 1000. Resúmelo y envíalo de nuevo."]);
  });

  it("un mensaje sin texto vuelve a pedir el relato, con el documento enmascarado si lo dio", () => {
    const anonimo = handleIncidencia(awaitingDescripcion(), text("   "));
    const conDocumento = handleIncidencia({ ...awaitingDescripcion(), slots: { [SlotKey.DNI]: "12347453" } }, text(""));

    expect(texts(anonimo)).toEqual([ASK_DESCRIPCION_ANONIMO_TEXT]);
    expect(texts(conDocumento)).toEqual(["Cuéntame tu denuncia, documento ****7453 (*hasta 1000 caracteres*)."]);
    expect(conDocumento.session.state).toBe("incidencia_awaiting_descripcion");
  });

  it("la evidencia se ofrece siempre: ya no depende de que exista un servicio de imágenes", () => {
    const previous = process.env.MEDIA_STORAGE_BASE_URL;
    delete process.env.MEDIA_STORAGE_BASE_URL;
    try {
      expect(handleIncidencia(awaitingDescripcion(), text("El consultorio estaba cerrado.")).session.state).toBe(
        "incidencia_awaiting_foto",
      );
    } finally {
      if (previous !== undefined) process.env.MEDIA_STORAGE_BASE_URL = previous;
    }
  });
});

describe("el registro final: con la persona o anónimo", () => {
  const submission = (step: HandlerResult) => queries(step)[0].payload.submission as { dni: string | null; mediaDataUris: string[] };
  const confirmar = (step: HandlerResult) => handleIncidencia(step.session, tap("incidencia_confirmar_registro_si"));

  it.each([
    ["un DNI", "12345678"],
    ["un carnet de extranjería", "123456789"],
  ])("con %s: lleva solo el documento, sin nombre", (_label, documento) => {
    let step = handleIncidencia(identityChoice(), tap("incidencia_con_documento"));
    step = handleIncidencia(step.session, text(documento));
    expect(texts(step)).toEqual([`Cuéntame tu denuncia, documento ****${documento.slice(-4)} (*hasta 1000 caracteres*).`]);
    step = handleIncidencia(step.session, text("El consultorio estaba cerrado."));
    step = handleIncidencia(step.session, text("OMITIR"));
    expect(step.session.state).toBe("incidencia_confirm_registro");
    expect(texts(step)[0]).toContain(`Identificado con documento terminado en ${documento.slice(-4)}`);
    step = confirmar(step);

    expect(submission(step)).toEqual({
      waId: FROM,
      dni: documento,
      descripcion: "El consultorio estaba cerrado.",
      establecimientoId: null,
      mediaDataUris: [],
      canal: "whatsapp",
    });
  });

  it("desde el Chat-bot: el registro lleva el canal web", () => {
    let step = handleIncidencia({ ...identityChoice(), channel: "web" }, tap("incidencia_anonimo"));
    step = handleIncidencia(step.session, text("El consultorio estaba cerrado."));
    step = handleIncidencia(step.session, text("OMITIR"));
    step = confirmar(step);

    expect(submission(step)).toMatchObject({ canal: "web" });
  });

  it("confirmar el registro solo pide registrarlo: no manda «Enviando…» ni otro texto", () => {
    let step = handleIncidencia(identityChoice(), tap("incidencia_anonimo"));
    step = handleIncidencia(step.session, text("El consultorio estaba cerrado."));
    step = handleIncidencia(step.session, text("OMITIR"));
    step = confirmar(step);

    expect(step.session.state).toBe("incidencia_submit_pending");
    expect(sent(step)).toEqual([]);
    expect(queries(step).map((effect) => effect.kind)).toEqual(["incidencia_register"]);
  });

  it("con el establecimiento confirmado: el registro lleva su id", () => {
    let step = handleIncidencia({ ...identityChoice(), slots: { [SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID]: 7 } }, tap("incidencia_anonimo"));
    step = handleIncidencia(step.session, text("El consultorio estaba cerrado."));
    step = handleIncidencia(step.session, text("OMITIR"));
    step = confirmar(step);

    expect(submission(step)).toMatchObject({ establecimientoId: 7 });
  });

  it("anónimo: llega sin documento", () => {
    let step = handleIncidencia(identityChoice(), tap("incidencia_anonimo"));
    step = handleIncidencia(step.session, text("El consultorio estaba cerrado."));
    step = handleIncidencia(step.session, text("OMITIR"));
    step = confirmar(step);

    expect(submission(step)).toEqual({
      waId: FROM,
      dni: null,
      descripcion: "El consultorio estaba cerrado.",
      establecimientoId: null,
      mediaDataUris: [],
      canal: "whatsapp",
    });
  });
});

const PNG_A = "data:image/png;base64,iVBORw0KGgo=";
const PNG_B = "data:image/png;base64,iVBORw0KGgoAAAA=";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngDe = (indice: number) => `data:image/png;base64,${Buffer.concat([PNG_SIGNATURE, Buffer.from([indice])]).toString("base64")}`;
const imagenesDe = (result: HandlerResult): string[] => JSON.parse(result.session.slots[SlotKey.INCIDENCIA_IMAGENES] ?? "[]");
const conImagenes = (cantidad: number): Session => ({
  state: "incidencia_awaiting_foto",
  slots: {
    descripcionIncidencia: "Mala atención",
    [SlotKey.INCIDENCIA_IMAGENES]: JSON.stringify(Array.from({ length: cantidad }, (_, i) => pngDe(i))),
  },
  counters: {},
});

function awaitingFoto(): Session {
  return { state: "incidencia_awaiting_foto", slots: { descripcionIncidencia: "Mala atención" }, counters: {} };
}

describe("incidencia_awaiting_foto: hasta cinco imágenes de referencia", () => {
  it("una imagen se guarda en la sesión y se ofrece agregar otra, sin pasar a confirmar", () => {
    const result = handleIncidencia(awaitingFoto(), { ...file("image"), mediaDataUri: PNG_A });

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(texts(result)[0]).toContain("Recibimos tu imagen (1 de 5)");
    expect(imagenesDe(result)).toEqual([PNG_A]);
    expect(queries(result)).toHaveLength(0);
  });

  it("la segunda imagen se suma a la primera", () => {
    const result = handleIncidencia(conImagenes(1), { ...file("image"), mediaDataUri: PNG_B });

    expect(imagenesDe(result)).toHaveLength(2);
    expect(texts(result)[0]).toContain("(2 de 5)");
  });

  it("al llegar a la quinta pasa a confirmar y avisa que es el máximo", () => {
    const result = handleIncidencia(conImagenes(4), { ...file("image"), mediaDataUri: PNG_B });

    expect(result.session.state).toBe("incidencia_confirm_registro");
    expect(texts(result)[0]).toContain("es el máximo por denuncia");
    expect(imagenesDe(result)).toHaveLength(5);
  });

  it("una imagen repetida no se guarda dos veces y se dice por qué", () => {
    const result = handleIncidencia(conImagenes(1), { ...file("image"), mediaDataUri: pngDe(0) });

    expect(imagenesDe(result)).toHaveLength(1);
    expect(texts(result)[0]).toContain("ya la habías enviado");
  });

  it("una imagen de más de 5 MB se rechaza diciendo el motivo y deja seguir", () => {
    const result = handleIncidencia(awaitingFoto(), { ...file("image"), mediaFailure: MediaFailure.TOO_LARGE });

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(texts(result)[0]).toContain("pesa más de 5 MB y no se guardó");
    expect(texts(result)[0]).toContain("Omitir");
    expect(result.session.slots[SlotKey.INCIDENCIA_IMAGENES]).toBeUndefined();
  });

  it("una imagen que pesa de más según sus bytes también se rechaza por tamaño, conservando las anteriores", () => {
    const grande = `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64")}`;
    const result = handleIncidencia(conImagenes(1), { ...file("image"), mediaDataUri: grande });

    expect(texts(result)[0]).toContain("pesa más de 5 MB");
    expect(texts(result)[0]).toContain("Listo");
    expect(imagenesDe(result)).toHaveLength(1);
  });

  it("una imagen que no se pudo descargar dice que no se guardó, sin pedir solo reintentar", () => {
    const result = handleIncidencia(awaitingFoto(), file("image"));

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(texts(result)[0]).toContain("No pudimos descargar esa imagen desde WhatsApp, por eso no se guardó");
    expect(result.session.slots[SlotKey.INCIDENCIA_IMAGENES]).toBeUndefined();
  });

  it("un archivo que no es imagen válida se rechaza con su motivo", () => {
    const result = handleIncidencia(awaitingFoto(), { ...file("image"), mediaDataUri: "data:text/html;base64,PGI+" });

    expect(texts(result)[0]).toContain("Solo aceptamos imágenes JPG o PNG de hasta 5 MB; esa imagen no se guardó.");
  });

  it.each([
    ["un SVG", `data:image/svg+xml;base64,${Buffer.from("<svg></svg>").toString("base64")}`],
    ["un GIF", `data:image/gif;base64,${Buffer.from("GIF89a").toString("base64")}`],
    ["un PNG que dice ser JPEG", `data:image/jpeg;base64,${PNG_SIGNATURE.toString("base64")}`],
    ["un texto que dice ser PNG", `data:image/png;base64,${Buffer.from("<svg></svg>").toString("base64")}`],
  ])("%s se rechaza al subirlo como imagen no válida, conservando las anteriores", (_, mediaDataUri) => {
    const result = handleIncidencia(conImagenes(1), { ...file("image"), mediaDataUri });

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(texts(result)[0]).toContain("Solo aceptamos imágenes JPG o PNG de hasta 5 MB; esa imagen no se guardó.");
    expect(imagenesDe(result)).toHaveLength(1);
  });

  it("una imagen WEBP con su firma real se guarda", () => {
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
    const mediaDataUri = `data:image/webp;base64,${webp.toString("base64")}`;
    const result = handleIncidencia(awaitingFoto(), { ...file("image"), mediaDataUri });

    expect(imagenesDe(result)).toEqual([mediaDataUri]);
  });

  it("un PDF no se guarda y se dice, sin dar la evidencia por registrada", () => {
    const result = handleIncidencia(awaitingFoto(), file("document"));

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(texts(result)[0]).toContain("Solo aceptamos imágenes JPG o PNG de hasta 5 MB; ese archivo no se guardó.");
    expect(texts(result)[0]).not.toContain("se registró tu evidencia");
  });

  it("'Listo' (botón o texto) con imágenes pasa a confirmar el registro", () => {
    expect(handleIncidencia(conImagenes(2), tap("incidencia_foto_listo")).session.state).toBe("incidencia_confirm_registro");
    expect(handleIncidencia(conImagenes(2), text("listo")).session.state).toBe("incidencia_confirm_registro");
  });

  it("el resumen a confirmar cuenta las imágenes adjuntas", () => {
    const result = handleIncidencia(conImagenes(2), tap("incidencia_foto_listo"));

    expect(texts(result)[0]).toContain("Imágenes adjuntas: 2");
  });

  it("al confirmar, el registro lleva todas las imágenes; sin imágenes lleva la lista vacía", () => {
    const sendIt = (session: Session) =>
      queries(handleIncidencia({ ...session, state: "incidencia_confirm_registro" }, tap("incidencia_confirmar_registro_si")))[0].payload
        .submission as { mediaDataUris: string[] };

    expect(sendIt(conImagenes(3)).mediaDataUris).toHaveLength(3);
    expect(sendIt(awaitingFoto()).mediaDataUris).toEqual([]);
  });

  it("al registrar, las imágenes salen de la sesión; si alguna pesaba de más se avisa", () => {
    const pending: Session = { state: "incidencia_submit_pending", slots: conImagenes(2).slots, counters: {} };
    const tooBig = handleIncidencia(pending, {
      from: FROM,
      type: InternalEventType.QUERY_RESULT,
      queryKind: "incidencia_register",
      result: { status: "rejected", reason: "media_too_large" },
    });

    expect(tooBig.session.slots[SlotKey.INCIDENCIA_IMAGENES]).toBeUndefined();
    expect(texts(tooBig)[0]).toContain("pesa más de 5 MB");
  });

  it("'OMITIR' sigue funcionando como atajo determinístico (sin IA): pide confirmar, sin acuse", () => {
    const result = handleIncidencia(awaitingFoto(), text("OMITIR"));

    expect(result.session.state).toBe("incidencia_confirm_registro");
    expect(queries(result)).toHaveLength(0);
    expect(texts(result)).not.toContain("Ok, se registró tu evidencia.");
  });

  it("tocar el botón Omitir pide confirmar el registro igual que escribir OMITIR, sin IA ni acuse", () => {
    const result = handleIncidencia(awaitingFoto(), { from: FROM, type: "button", listId: "incidencia_foto_omitir" });

    expect(result.session.state).toBe("incidencia_confirm_registro");
    expect(queries(result)).toHaveLength(0);
    expect(texts(result)).not.toContain("Ok, se registró tu evidencia.");
  });

  it("la pregunta de evidencia ofrece el botón Omitir", () => {
    const session: Session = { state: "incidencia_awaiting_descripcion", slots: {}, counters: {} };
    const result = handleIncidencia(session, text("El consultorio estaba cerrado."));
    const buttons = result.effects.find((effect) => !isQueryEffect(effect) && effect.kind === "send_buttons");

    expect(buttons).toMatchObject({ buttons: [{ id: "incidencia_foto_omitir", title: "Omitir" }] });
  });

  it("'no quiero' se reconoce determinísticamente (sin IA)", () => {
    const result = handleIncidencia(awaitingFoto(), text("no quiero"));

    expect(result.session.state).toBe("incidencia_confirm_registro");
  });

  it("texto ambiguo tipo 'no deseo' dispara la consulta a IA en vez de reinterpretar solo", () => {
    const result = handleIncidencia(awaitingFoto(), text("no deseo"));

    expect(result.session.state).toBe("incidencia_foto_intent_pending");
    expect(queries(result)).toEqual([{ kind: "analyze_incidencia_foto_intent", payload: { text: "no deseo" } }]);
  });

  it("un 'sí' limpio (quiere mandarla) se reconoce determinísticamente, no dispara IA", () => {
    const result = handleIncidencia(awaitingFoto(), text("sí"));

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(queries(result)).toHaveLength(0);
  });

  it("un 'sí' con más palabras ('sí, ya te mando') no es un match determinístico limpio: se consulta a la IA", () => {
    expect(handleIncidencia(awaitingFoto(), text("sí, ya te mando")).session.state).toBe("incidencia_foto_intent_pending");
  });

  it("texto vacío, vuelve a pedir la evidencia sin IA", () => {
    const result = handleIncidencia(awaitingFoto(), text(""));

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(queries(result)).toHaveLength(0);
  });

  it("texto demasiado largo no se manda a analizar, solo se repite el pedido", () => {
    const result = handleIncidencia(awaitingFoto(), text("a".repeat(500)));

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(queries(result)).toHaveLength(0);
  });

  it("puro ruido no se manda a la IA, solo se repite el pedido", () => {
    const result = handleIncidencia(awaitingFoto(), text("#!@#!@😵‍💫😵‍💫"));

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(queries(result)).toHaveLength(0);
  });
});

describe("«quiero cerrar» cancela desde cualquier paso", () => {
  const steps: [string, Session][] = [
    ["pedir ubicación", { state: "incidencia_awaiting_ubicacion", slots: {}, counters: {} }],
    [
      "confirmar ubicación",
      { state: "incidencia_confirm_ubicacion", slots: { [SlotKey.INCIDENCIA_ESTABLECIMIENTO_PROPUESTO]: "{}" }, counters: {} },
    ],
    ["omitir ubicación", { state: "incidencia_confirm_omitir", slots: {}, counters: {} }],
    ["documento o anónimo", identityChoice()],
    ["documento", { state: "incidencia_awaiting_dni", slots: {}, counters: {} }],
    ["relato", { state: "incidencia_awaiting_descripcion", slots: { [SlotKey.DNI]: "12345678" }, counters: {} }],
    [
      "borrador",
      {
        state: "incidencia_confirm_borrador",
        slots: { [SlotKey.INCIDENCIA_BORRADOR]: "Me cobraron sin recibo en la ventanilla." },
        counters: {},
      },
    ],
    ["evidencia", awaitingFoto()],
  ];

  it.each(steps)("en el paso «%s»: no guarda nada, limpia la sesión y se despide", (_label, session) => {
    const result = handleIncidencia(session, text("Quiero cerrar"));

    expect(result.session).toEqual({ state: "incidencia_cancelled", slots: {}, counters: {} });
    expect(queries(result)).toHaveLength(0);
    expect(texts(result)[0]).toContain("no se registró ninguna denuncia");
    expect(result.outcome).toBe("closed");
  });

  it.each(["quiero cerrar", "QUIERO CERRAR.", "  Quiero   cerrar!! ", "cerrar", "cerrar sesión", "terminar la sesión"])(
    "%j cierra",
    (frase) => {
      expect(handleIncidencia(awaitingFoto(), text(frase)).session.state).toBe("incidencia_cancelled");
    },
  );

  it("un relato que solo menciona la frase no cancela", () => {
    const relato = "El doctor me dijo que quiero cerrar mi cuenta pero me cobraron sin recibo";
    const result = handleIncidencia({ state: "incidencia_awaiting_descripcion", slots: {}, counters: {} }, text(relato));

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(result.session.slots[SlotKey.DESCRIPCION_INCIDENCIA]).toBe(relato);
  });

  it("tocar un botón no cancela", () => {
    expect(handleIncidencia(identityChoice(), tap("incidencia_anonimo")).session.state).toBe("incidencia_awaiting_descripcion");
  });
});

describe("incidencia_foto_intent_pending: resuelve lo que dijo la IA", () => {
  const pending = (): Session => ({
    state: "incidencia_foto_intent_pending",
    slots: { descripcionIncidencia: "Mala atención" },
    counters: {},
  });

  it("si la IA dice que quiere omitir, pide confirmar el registro", () => {
    const result = handleIncidencia(pending(), fotoIntentResult(true));

    expect(result.session.state).toBe("incidencia_confirm_registro");
    expect(queries(result)).toHaveLength(0);
  });

  it("si la IA dice que no quiere omitir, vuelve a pedir la evidencia", () => {
    const result = handleIncidencia(pending(), fotoIntentResult(false));

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(queries(result)).toHaveLength(0);
  });
});

describe("incidencia_submit_pending: el resultado del registro", () => {
  const submitResult = (result: { status: string; reason?: string; codigo?: string }): QueryResultEvent => ({
    from: FROM,
    type: InternalEventType.QUERY_RESULT,
    queryKind: "incidencia_register",
    result,
  });
  const pending = (): Session => ({ state: "incidencia_submit_pending", slots: { descripcionIncidencia: "Mala atención" }, counters: {} });

  const withPlace = (extra: Session["slots"] = {}): Session => ({
    ...pending(),
    slots: {
      ...pending().slots,
      [SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID]: 7,
      [SlotKey.INCIDENCIA_ESTABLECIMIENTO_NOMBRE]: "HOSPITAL NACIONAL DOS DE MAYO",
      ...extra,
    },
  });

  it("aceptado sin establecimiento: entrega el código en un solo mensaje, sin nombrar el lugar", () => {
    const result = handleIncidencia(pending(), submitResult({ status: "accepted", codigo: "MINSA-2026-000123" }));

    expect(result.session.state).toBe("incidencia_confirmed");
    expect(texts(result)).toEqual([
      "¡Gracias! Tu denuncia quedó registrada con el código *MINSA-2026-000123*. Guárdalo: para ver su estado, elige *Consultar mi denuncia* en el menú o escribe tu código. ¡Hasta pronto!",
    ]);
    expect(result.outcome).toBe("closed");
  });

  it("aceptado con establecimiento, anónimo: código y establecimiento en negrita, sin prometer contacto", () => {
    const result = handleIncidencia(withPlace(), submitResult({ status: "accepted", codigo: "MINSA-2026-A-000123" }));

    expect(texts(result)).toEqual([
      "¡Gracias! Tu denuncia quedó registrada con el código *MINSA-2026-A-000123* en *HOSPITAL NACIONAL DOS DE MAYO*. Guárdalo: para ver su estado, elige *Consultar mi denuncia* en el menú o escribe tu código. ¡Hasta pronto!",
    ]);
  });

  it("aceptado con establecimiento, identificado (tiene DNI): avisa que el área se comunicará", () => {
    const result = handleIncidencia(
      withPlace({ [SlotKey.DNI]: "12345678" }),
      submitResult({ status: "accepted", codigo: "MINSA-2026-000123" }),
    );

    expect(texts(result)).toEqual([
      "¡Gracias! Tu denuncia quedó registrada con el código *MINSA-2026-000123* en *HOSPITAL NACIONAL DOS DE MAYO*. Guárdalo: para ver su estado, elige *Consultar mi denuncia* en el menú o escribe tu código. Si el área responsable necesita información adicional, se comunicará contigo. ¡Hasta pronto!",
    ]);
  });

  it("aceptado pero sin código (una reentrega que no lo pudo leer): agradece y se despide", () => {
    expect(texts(handleIncidencia(withPlace(), submitResult({ status: "accepted" })))).toEqual([
      "Gracias por tu denuncia, ya se registró. ¡Hasta pronto!",
    ]);
  });
  it("tope diario alcanzado: avisa que podrá registrar otra mañana y cierra", () => {
    const result = handleIncidencia(pending(), submitResult({ status: "rejected", reason: "daily_limit" }));

    expect(result.session.state).toBe("incidencia_failed");
    expect(texts(result)[0]).toContain("Podrás registrar otra mañana");
  });

  it("fallido: se disculpa y pide intentarlo más tarde", () => {
    const result = handleIncidencia(pending(), submitResult({ status: "error" }));

    expect(result.session.state).toBe("incidencia_failed");
    expect(texts(result)).toEqual([
      "Lo sentimos, no pudimos registrar tu denuncia en este momento. Por favor, inténtalo de nuevo más tarde.",
    ]);
  });

  it("una imagen que pasó del tope al registrar: lo dice con el tope de 5 MB", () => {
    const result = handleIncidencia(pending(), submitResult({ status: "rejected", reason: "media_too_large" }));

    expect(texts(result)).toEqual(["No pudimos registrar tu denuncia porque una de las imágenes pesa más de 5 MB."]);
  });
});

describe("incidencia_consent_*: autorización del tratamiento de datos", () => {
  const checkPending = (): Session => ({
    state: "incidencia_consent_check_pending",
    slots: { [SlotKey.DNI]: "12345678" },
    counters: {},
  });
  const choice = (): Session => ({ state: "incidencia_consent_choice", slots: {}, counters: {} });
  const registerPending = (): Session => ({ state: "incidencia_consent_register_pending", slots: {}, counters: {} });

  it("si ya había autorizado antes, salta directo a pedir el establecimiento sin volver a preguntar", () => {
    const result = handleIncidencia(checkPending(), consentCheckResult(true));

    expect(result.session.state).toBe("incidencia_awaiting_ubicacion");
    expect(queries(result)).toHaveLength(0);
    expect(texts(result)).toEqual([`${AVISO_EMERGENCIA_DENUNCIA_TEXT}\n\n${ASK_UBICACION_DENUNCIA_TEXT}`]);
  });

  it("si nunca autorizó, manda un solo efecto de consentimiento: modal en el Chat-bot y botones Autorizo/No autorizo en WhatsApp", () => {
    const result = handleIncidencia(checkPending(), consentCheckResult(false));

    expect(result.session.state).toBe("incidencia_consent_choice");
    expect(sent(result)).toEqual([
      {
        kind: "send_consent",
        title: "Autorización de datos",
        text: "Para registrar tu denuncia necesitamos tu autorización.",
        content: AVISO_PRIVACIDAD_TEXT,
        buttons: [
          { id: "incidencia_consent_si", title: "Sí, autorizo" },
          { id: "incidencia_consent_no", title: "No autorizo" },
        ],
        acceptLabel: "Acepto, autorizo mis datos",
        reopenLabel: "Revisar autorización",
        whatsappText: `${AVISO_PRIVACIDAD_TEXT}\n\n¿Autorizas el tratamiento de tus datos?`,
      },
    ]);
  });

  it("los botones de la autorización caben en los 20 caracteres que WhatsApp admite", () => {
    const result = handleIncidencia(checkPending(), consentCheckResult(false));
    const buttons = (sent(result)[0] as { buttons: { title: string }[] }).buttons;

    for (const button of buttons) expect(button.title.length).toBeLessThanOrEqual(20);
  });

  it.each(["Autorizo", "autorizo", "Sí, autorizo", "SI AUTORIZO", "Autorizo y deseo continuar", "¡Autorizo!"])(
    "escribir «%s» autoriza igual que el botón",
    (typed) => {
      const result = handleIncidencia(choice(), text(typed));

      expect(result.session.state).toBe("incidencia_consent_register_pending");
      expect(queries(result)).toEqual([{ kind: "registrar_consentimiento", payload: {} }]);
    },
  );

  it.each(["No autorizo", "no autorizo.", "NO AUTORIZO"])("escribir «%s» cancela sin guardar nada", (typed) => {
    const result = handleIncidencia(choice(), text(typed));

    expect(result.session.state).toBe("incidencia_cancelled");
    expect(queries(result)).toHaveLength(0);
  });

  it("«Autorizo» deja constancia en la base y recién después pasa al relato", () => {
    const result = handleIncidencia(choice(), tap("incidencia_consent_si"));

    expect(result.session.state).toBe("incidencia_consent_register_pending");
    expect(queries(result)).toEqual([{ kind: "registrar_consentimiento", payload: {} }]);
  });

  it("tras registrar el consentimiento, pide el establecimiento", () => {
    const result = handleIncidencia(registerPending(), consentRegisterResult());

    expect(result.session.state).toBe("incidencia_awaiting_ubicacion");
  });

  it("«No autorizo» cierra sin registrar nada y sin ofrecer reintento", () => {
    const result = handleIncidencia(choice(), tap("incidencia_consent_no"));

    expect(result.session).toEqual({ state: "incidencia_cancelled", slots: {}, counters: {} });
    expect(queries(result)).toHaveLength(0);
    expect(texts(result)[0]).toContain("No se registrará tu denuncia por este canal");
  });

  it("una respuesta ambigua avisa que no se entendió y repite los botones", () => {
    const result = handleIncidencia(choice(), text("tal vez"));

    expect(result.session.state).toBe("incidencia_consent_choice");
    expect(texts(result)[0]).toContain("No pudimos identificar tu respuesta");
    expect(sent(result)[1]).toMatchObject({ kind: "send_buttons" });
  });

  it("«quiero cerrar» también corta desde la elección de consentimiento", () => {
    expect(handleIncidencia(choice(), text("quiero cerrar")).session.state).toBe("incidencia_cancelled");
  });
});

describe("incidencia_confirm_registro: checklist final antes de enviar", () => {
  const confirming = (): Session => ({
    state: "incidencia_confirm_registro",
    slots: { [SlotKey.DESCRIPCION_INCIDENCIA]: "Me cobraron sin recibo." },
    counters: {},
  });

  it("«Registrar» dispara el registro real", () => {
    const result = handleIncidencia(confirming(), tap("incidencia_confirmar_registro_si"));

    expect(result.session.state).toBe("incidencia_submit_pending");
    expect(queries(result)).toEqual([
      { kind: "incidencia_register", payload: { submission: expect.objectContaining({ descripcion: "Me cobraron sin recibo." }) } },
    ]);
  });

  it("«Cancelar» cierra sin registrar nada", () => {
    const result = handleIncidencia(confirming(), tap("incidencia_confirmar_registro_no"));

    expect(result.session).toEqual({ state: "incidencia_cancelled", slots: {}, counters: {} });
    expect(queries(result)).toHaveLength(0);
    expect(texts(result)[0]).toBe(INCIDENCIA_CANCELADA_TEXT);
  });

  it("una respuesta ambigua avisa que no se entendió y repite el resumen con los botones", () => {
    const result = handleIncidencia(confirming(), text("quizás"));

    expect(result.session.state).toBe("incidencia_confirm_registro");
    expect(texts(result)[0]).toContain("No pudimos identificar tu respuesta");
    expect(sent(result)[1]).toMatchObject({ kind: "send_buttons" });
  });
});
