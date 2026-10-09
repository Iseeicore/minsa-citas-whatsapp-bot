import { describe, expect, it } from "vitest";
import { handleIncidencia } from "@/lib/fsm/flows/incidencia/handlers-incidencia";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "51999999999";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const file = (type: "image" | "document"): InboundEvent => ({ from: FROM, type, text: type === "image" ? "foto del cobro" : undefined });
const reniecResult = (result: unknown): QueryResultEvent => ({ from: FROM, type: "query_result", queryKind: "reniec_lookup", result });
const fotoIntentResult = (quiereOmitir: boolean): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind: "analyze_incidencia_foto_intent",
  result: { quiereOmitir },
});

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const texts = (result: HandlerResult): string[] => sent(result).map((effect) => ("text" in effect ? effect.text : ""));
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);

const identityChoice = (): Session => ({ state: "incidencia_identity_choice", slots: {}, counters: {} });

describe("incidencia_identity_choice: nombre o anónimo", () => {
  it("ofrece los botones nombre/anónimo", () => {
    const result = handleIncidencia(identityChoice(), text("cualquier cosa"));

    expect(sent(result)[0]).toMatchObject({
      kind: "send_buttons",
      buttons: [
        { id: "incidencia_con_nombre", title: "Sí, doy mi nombre" },
        { id: "incidencia_anonimo", title: "Prefiero ser anónimo" },
      ],
    });
  });

  it("'incidencia_con_nombre' pide el número de documento, sin decir cuántos dígitos", () => {
    const result = handleIncidencia(identityChoice(), tap("incidencia_con_nombre"));

    expect(result.session.state).toBe("incidencia_awaiting_dni");
    expect(texts(result)).toEqual(["Ingresa tu número de documento."]);
  });

  it("'incidencia_anonimo' salta directo al relato, sin pedir documento ni nombre", () => {
    const result = handleIncidencia(identityChoice(), tap("incidencia_anonimo"));

    expect(result.session.state).toBe("incidencia_awaiting_descripcion");
    expect(result.session.slots[SlotKey.NOMBRE_COMPLETO]).toBeUndefined();
    expect(result.session.slots[SlotKey.DNI]).toBeUndefined();
  });
});

describe("incidencia_awaiting_dni: el largo decide el documento", () => {
  const awaitingDni = (): Session => ({ state: "incidencia_awaiting_dni", slots: {}, counters: {} });

  it("un DNI de 8 dígitos se valida en RENIEC", () => {
    const result = handleIncidencia(awaitingDni(), text(" 12345678 "));

    expect(result.session.state).toBe("incidencia_reniec_pending");
    expect(result.session.slots[SlotKey.DNI]).toBe("12345678");
    expect(queries(result)).toEqual([{ kind: "reniec_lookup", payload: { dni: "12345678" } }]);
  });

  it("un carnet de extranjería de 9 dígitos no se consulta en RENIEC: se pide el nombre o un alias", () => {
    const result = handleIncidencia(awaitingDni(), text("123456789"));

    expect(result.session.state).toBe("incidencia_awaiting_nombre_libre");
    expect(result.session.slots[SlotKey.DNI]).toBe("123456789");
    expect(queries(result)).toHaveLength(0);
    expect(texts(result)[0]).toContain("carnet de extranjería");
  });

  it.each(["", "1234567", "1234567890", "abcdefgh", "1234 5678", "hdp"])("%j no es un documento: lo pide de nuevo", (value) => {
    const result = handleIncidencia(awaitingDni(), text(value));

    expect(result.session.state).toBe("incidencia_awaiting_dni");
    expect(texts(result)[0]).toContain("Documento inválido");
    expect(queries(result)).toHaveLength(0);
  });
});

describe("incidencia_reniec_pending: el nombre sale de RENIEC", () => {
  const pending = (): Session => ({ state: "incidencia_reniec_pending", slots: { [SlotKey.DNI]: "12345678" }, counters: {} });

  it("encontrado: guarda el nombre de RENIEC, lo saluda y pide el relato", () => {
    const result = handleIncidencia(pending(), reniecResult({ status: "found", nombreCompleto: "JUAN CARLOS QUISPE PEREZ" }));

    expect(result.session.state).toBe("incidencia_awaiting_descripcion");
    expect(result.session.slots[SlotKey.NOMBRE_COMPLETO]).toBe("JUAN CARLOS QUISPE PEREZ");
    expect(texts(result)).toEqual(["Gracias, JUAN CARLOS QUISPE PEREZ.", "Cuéntanos tu incidencia (hasta 1000 caracteres)."]);
  });

  it.each([["no lo encuentra", { status: "not_found" }], ["no responde", { status: "error" }], ["trae un nombre vacío", { status: "found", nombreCompleto: "  " }]])(
    "RENIEC %s: se disculpa y pide un nombre o alias, sin detener a la persona",
    (_label, result) => {
      const step = handleIncidencia(pending(), reniecResult(result));

      expect(step.session.state).toBe("incidencia_awaiting_nombre_libre");
      expect(texts(step)).toEqual(["Disculpa, nuestro servicio no responde. Disculpa las molestias. Escríbenos tu nombre o un alias."]);
      expect(step.session.slots[SlotKey.DNI]).toBe("12345678");
    },
  );

  it("con un borrador ya escrito, ofrece usarlo después de saludar", () => {
    const session: Session = { ...pending(), slots: { ...pending().slots, [SlotKey.INCIDENCIA_BORRADOR]: "Me cobraron sin recibo en la ventanilla." } };
    const result = handleIncidencia(session, reniecResult({ status: "found", nombreCompleto: "ANA RIOS" }));

    expect(result.session.state).toBe("incidencia_confirm_borrador");
    expect(texts(result)[0]).toBe("Gracias, ANA RIOS.");
  });
});

describe("incidencia_awaiting_nombre_libre: nombre o alias tal cual", () => {
  const awaitingNombre = (): Session => ({ state: "incidencia_awaiting_nombre_libre", slots: { [SlotKey.DNI]: "12345678" }, counters: {} });

  it("guarda el nombre, conserva el documento y pasa al relato, sin ninguna consulta", () => {
    const result = handleIncidencia(awaitingNombre(), text("Juan Pérez"));

    expect(result.session.state).toBe("incidencia_awaiting_descripcion");
    expect(result.session.slots[SlotKey.NOMBRE_COMPLETO]).toBe("Juan Pérez");
    expect(result.session.slots[SlotKey.DNI]).toBe("12345678");
    expect(queries(result)).toHaveLength(0);
  });

  it("nombre vacío, vuelve a pedirlo", () => {
    const result = handleIncidencia(awaitingNombre(), text("   "));

    expect(result.session.state).toBe("incidencia_awaiting_nombre_libre");
    expect(texts(result)).toEqual(["Por favor, ingresa tu nombre."]);
  });

  it("puro ruido (sin letras reales) no se guarda como nombre, pide reintentar", () => {
    const result = handleIncidencia(awaitingNombre(), text("🔥🔥💀💀#!@"));

    expect(result.session.state).toBe("incidencia_awaiting_nombre_libre");
    expect(result.session.slots[SlotKey.NOMBRE_COMPLETO]).toBeUndefined();
    expect(texts(result)).toEqual(["No pudimos leer eso — ¿podrías escribirlo de nuevo?"]);
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

  it("una incidencia real con palabras pasa a ofrecer la evidencia", () => {
    const result = handleIncidencia(awaitingDescripcion(), text("El consultorio estaba cerrado."));

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(result.session.slots[SlotKey.DESCRIPCION_INCIDENCIA]).toBe("El consultorio estaba cerrado.");
    expect(texts(result)[0]).toContain("imagen o un archivo");
  });

  it("la evidencia se ofrece siempre: ya no depende de que exista un servicio de imágenes", () => {
    const previous = process.env.MEDIA_STORAGE_BASE_URL;
    delete process.env.MEDIA_STORAGE_BASE_URL;
    try {
      expect(handleIncidencia(awaitingDescripcion(), text("El consultorio estaba cerrado.")).session.state).toBe("incidencia_awaiting_foto");
    } finally {
      if (previous !== undefined) process.env.MEDIA_STORAGE_BASE_URL = previous;
    }
  });
});

describe("el registro final: con la persona, con carnet o anónimo", () => {
  const submission = (step: HandlerResult) => queries(step)[0].payload.submission as { dni: string | null; nombreCompleto: string | null; mediaDataUri?: string };

  it("con DNI: lleva el documento y el nombre de RENIEC", () => {
    let step = handleIncidencia(identityChoice(), tap("incidencia_con_nombre"));
    step = handleIncidencia(step.session, text("12345678"));
    step = handleIncidencia(step.session, reniecResult({ status: "found", nombreCompleto: "JUAN CARLOS QUISPE PEREZ" }));
    step = handleIncidencia(step.session, text("El consultorio estaba cerrado."));
    step = handleIncidencia(step.session, text("OMITIR"));

    expect(submission(step)).toEqual({ waId: FROM, dni: "12345678", nombreCompleto: "JUAN CARLOS QUISPE PEREZ", descripcion: "El consultorio estaba cerrado." });
  });

  it("con RENIEC caído: lleva el documento y el alias que escribió", () => {
    let step = handleIncidencia(identityChoice(), tap("incidencia_con_nombre"));
    step = handleIncidencia(step.session, text("12345678"));
    step = handleIncidencia(step.session, reniecResult({ status: "error" }));
    step = handleIncidencia(step.session, text("Juan"));
    step = handleIncidencia(step.session, text("El consultorio estaba cerrado."));
    step = handleIncidencia(step.session, text("OMITIR"));

    expect(submission(step)).toMatchObject({ dni: "12345678", nombreCompleto: "Juan" });
  });

  it("con carnet de extranjería: lleva el número y el nombre que escribió", () => {
    let step = handleIncidencia(identityChoice(), tap("incidencia_con_nombre"));
    step = handleIncidencia(step.session, text("123456789"));
    step = handleIncidencia(step.session, text("María Gómez"));
    step = handleIncidencia(step.session, text("El consultorio estaba cerrado."));
    step = handleIncidencia(step.session, text("OMITIR"));

    expect(submission(step)).toMatchObject({ dni: "123456789", nombreCompleto: "María Gómez" });
  });

  it("anónimo: llega con documento y nombre en null", () => {
    let step = handleIncidencia(identityChoice(), tap("incidencia_anonimo"));
    step = handleIncidencia(step.session, text("El consultorio estaba cerrado."));
    step = handleIncidencia(step.session, text("OMITIR"));

    expect(submission(step)).toEqual({ waId: FROM, dni: null, nombreCompleto: null, descripcion: "El consultorio estaba cerrado." });
  });
});

function awaitingFoto(): Session {
  return { state: "incidencia_awaiting_foto", slots: { descripcionIncidencia: "Mala atención" }, counters: {} };
}

describe("incidencia_awaiting_foto: la evidencia es opcional y no se guarda", () => {
  it.each(["image", "document"] as const)("un archivo (%s) se reconoce, se acusa y se registra la incidencia sin él", (type) => {
    const result = handleIncidencia(awaitingFoto(), file(type));

    expect(result.session.state).toBe("incidencia_submit_pending");
    expect(texts(result)[0]).toBe("Ok, se registró tu evidencia.");
    const [register] = queries(result);
    expect(register.kind).toBe("incidencia_register");
    expect(register.payload.submission).not.toHaveProperty("mediaDataUri");
    expect(result.session.slots[SlotKey.MEDIA_DATA_URI]).toBeUndefined();
  });

  it("'OMITIR' sigue funcionando como atajo determinístico (sin IA), sin acuse", () => {
    const result = handleIncidencia(awaitingFoto(), text("OMITIR"));

    expect(result.session.state).toBe("incidencia_submit_pending");
    expect(queries(result)[0].kind).toBe("incidencia_register");
    expect(texts(result)).not.toContain("Ok, se registró tu evidencia.");
  });

  it("'no quiero' se reconoce determinísticamente (sin IA)", () => {
    const result = handleIncidencia(awaitingFoto(), text("no quiero"));

    expect(result.session.state).toBe("incidencia_submit_pending");
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

describe("incidencia_foto_intent_pending: resuelve lo que dijo la IA", () => {
  const pending = (): Session => ({ state: "incidencia_foto_intent_pending", slots: { descripcionIncidencia: "Mala atención" }, counters: {} });

  it("si la IA dice que quiere omitir, registra la incidencia", () => {
    const result = handleIncidencia(pending(), fotoIntentResult(true));

    expect(result.session.state).toBe("incidencia_submit_pending");
    expect(queries(result)[0].kind).toBe("incidencia_register");
  });

  it("si la IA dice que no quiere omitir, vuelve a pedir la evidencia", () => {
    const result = handleIncidencia(pending(), fotoIntentResult(false));

    expect(result.session.state).toBe("incidencia_awaiting_foto");
    expect(queries(result)).toHaveLength(0);
  });
});

describe("incidencia_submit_pending: el resultado del registro", () => {
  const submitResult = (result: { status: string; reason?: string }): QueryResultEvent => ({
    from: FROM,
    type: "query_result",
    queryKind: "incidencia_register",
    result,
  });
  const pending = (): Session => ({ state: "incidencia_submit_pending", slots: { descripcionIncidencia: "Mala atención" }, counters: {} });

  it("aceptado: confirma y cierra", () => {
    const result = handleIncidencia(pending(), submitResult({ status: "accepted" }));

    expect(result.session.state).toBe("incidencia_confirmed");
    expect(texts(result)[0]).toContain("Tu incidencia fue registrada");
    expect(result.outcome).toBe("closed");
  });

  it("fallido: avisa que no se pudo registrar", () => {
    const result = handleIncidencia(pending(), submitResult({ status: "error" }));

    expect(result.session.state).toBe("incidencia_failed");
    expect(texts(result)[0]).toContain("No pudimos registrar tu incidencia");
  });
});
