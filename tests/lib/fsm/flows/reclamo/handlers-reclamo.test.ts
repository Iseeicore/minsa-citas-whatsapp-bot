import { describe, expect, it } from "vitest";
import { handleReclamo } from "@/lib/fsm/flows/reclamo/handlers-reclamo";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";

const FROM = "51999999999";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const photo = (): InboundEvent => ({ from: FROM, type: "image", mediaDataUri: "data:image/png;base64,abc" });
const fotoIntentResult = (quiereOmitir: boolean): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind: "analyze_reclamo_foto_intent",
  result: { quiereOmitir },
});

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);

const identityChoice = (): Session => ({ state: "reclamo_identity_choice", slots: {}, counters: {} });

describe("reclamo_identity_choice: nombre o anónimo (reemplaza la pregunta por DNI)", () => {
  it("ofrece los botones nombre/anónimo, no DNI", () => {
    const result = handleReclamo(identityChoice(), text("cualquier cosa"));

    expect(sent(result)[0]).toMatchObject({
      kind: "send_buttons",
      buttons: [
        { id: "reclamo_con_nombre", title: "Sí, doy mi nombre" },
        { id: "reclamo_anonimo", title: "Prefiero ser anónimo" },
      ],
    });
  });

  it("'reclamo_con_nombre' pasa a pedir el nombre (NO pide DNI)", () => {
    const result = handleReclamo(identityChoice(), tap("reclamo_con_nombre"));

    expect(result.session.state).toBe("reclamo_awaiting_nombre_libre");
    expect((sent(result)[0] as { text: string }).text).toBe("Ingresa tu nombre.");
  });

  it("'reclamo_anonimo' salta directo a la descripción, sin pedir nombre", () => {
    const result = handleReclamo(identityChoice(), tap("reclamo_anonimo"));

    expect(result.session.state).toBe("reclamo_awaiting_descripcion");
    expect(result.session.slots.nombreCompleto).toBeUndefined();
  });

  it("ya no reconoce los ids viejos (reclamo_con_dni/reclamo_sin_dni): la rama DNI queda dormida", () => {
    const conDni = handleReclamo(identityChoice(), tap("reclamo_con_dni"));
    expect(conDni.session.state).toBe("reclamo_identity_choice");

    const sinDni = handleReclamo(identityChoice(), tap("reclamo_sin_dni"));
    expect(sinDni.session.state).toBe("reclamo_identity_choice");
  });
});

describe("reclamo_awaiting_nombre_libre: toma el nombre tal cual, sin RENIEC", () => {
  const awaitingNombre = (): Session => ({ state: "reclamo_awaiting_nombre_libre", slots: {}, counters: {} });

  it("guarda el nombre y pasa a descripción, sin disparar ninguna query (ni reniec_lookup)", () => {
    const result = handleReclamo(awaitingNombre(), text("Juan Pérez"));

    expect(result.session.state).toBe("reclamo_awaiting_descripcion");
    expect(result.session.slots.nombreCompleto).toBe("Juan Pérez");
    expect(queries(result)).toHaveLength(0);
  });

  it("nombre vacío, vuelve a pedirlo", () => {
    const result = handleReclamo(awaitingNombre(), text("   "));

    expect(result.session.state).toBe("reclamo_awaiting_nombre_libre");
    expect((sent(result)[0] as { text: string }).text).toBe("Por favor, ingresa tu nombre.");
  });

  it("puro ruido (sin letras reales) no se guarda como nombre, pide reintentar", () => {
    const result = handleReclamo(awaitingNombre(), text("🔥🔥💀💀#!@"));

    expect(result.session.state).toBe("reclamo_awaiting_nombre_libre");
    expect(result.session.slots.nombreCompleto).toBeUndefined();
    expect((sent(result)[0] as { text: string }).text).toBe("No pudimos leer eso — ¿podrías escribirlo de nuevo?");
  });
});

describe("reclamo_awaiting_descripcion: ruido no se registra como queja", () => {
  const awaitingDescripcion = (): Session => ({ state: "reclamo_awaiting_descripcion", slots: {}, counters: {} });

  it("puro ruido no se guarda como queja, pide reintentar", () => {
    const result = handleReclamo(awaitingDescripcion(), text("888(((#!#!#@@@"));

    expect(result.session.state).toBe("reclamo_awaiting_descripcion");
    expect(result.session.slots.queja).toBeUndefined();
    expect((sent(result)[0] as { text: string }).text).toBe("No pudimos leer eso — ¿podrías escribirlo de nuevo?");
  });

  it("una queja real con palabras sigue funcionando igual que hoy", () => {
    const result = handleReclamo(awaitingDescripcion(), text("El consultorio estaba cerrado."));

    expect(result.session.state).toBe("reclamo_awaiting_foto");
    expect(result.session.slots.queja).toBe("El consultorio estaba cerrado.");
  });
});

describe("el submit final nunca lleva DNI por este camino (lo mockea quejas.ts automáticamente)", () => {
  it("camino con nombre: el submit llega con dni null", () => {
    let step = handleReclamo(identityChoice(), tap("reclamo_con_nombre"));
    step = handleReclamo(step.session, text("Juan Pérez"));
    step = handleReclamo(step.session, text("El consultorio estaba cerrado."));
    step = handleReclamo(step.session, text("OMITIR"));

    const [submitQuery] = queries(step);
    expect(submitQuery.kind).toBe("quejas_submit");
    expect((submitQuery.payload.submission as { dni: string | null }).dni).toBeNull();
    expect((submitQuery.payload.submission as { nombreCompleto: string | null }).nombreCompleto).toBe("Juan Pérez");
  });

  it("camino anónimo: el submit llega con dni y nombreCompleto null", () => {
    let step = handleReclamo(identityChoice(), tap("reclamo_anonimo"));
    step = handleReclamo(step.session, text("El consultorio estaba cerrado."));
    step = handleReclamo(step.session, text("OMITIR"));

    const [submitQuery] = queries(step);
    expect((submitQuery.payload.submission as { dni: string | null }).dni).toBeNull();
    expect((submitQuery.payload.submission as { nombreCompleto: string | null }).nombreCompleto).toBeNull();
  });
});

function awaitingFoto(): Session {
  return { state: "reclamo_awaiting_foto", slots: { queja: "Mala atención" }, counters: {} };
}

describe("reclamo_awaiting_foto: ya no exige la palabra exacta OMITIR", () => {
  it("una foto directa se registra igual que siempre", () => {
    const result = handleReclamo(awaitingFoto(), photo());

    expect(result.session.state).toBe("reclamo_submit_pending");
    expect(queries(result)[0].kind).toBe("quejas_submit");
  });

  it("'OMITIR' sigue funcionando como atajo determinístico (sin IA)", () => {
    const result = handleReclamo(awaitingFoto(), text("OMITIR"));

    expect(result.session.state).toBe("reclamo_submit_pending");
    expect(queries(result)[0].kind).toBe("quejas_submit");
  });

  it("'no quiero' se reconoce determinísticamente (sin IA), ya está en el parser de confirmación", () => {
    const result = handleReclamo(awaitingFoto(), text("no quiero"));

    expect(result.session.state).toBe("reclamo_submit_pending");
    expect(queries(result)[0].kind).toBe("quejas_submit");
  });

  it("texto ambiguo tipo 'no deseo' dispara la consulta a IA en vez de reinterpretar solo", () => {
    const result = handleReclamo(awaitingFoto(), text("no deseo"));

    expect(result.session.state).toBe("reclamo_foto_intent_pending");
    expect(queries(result)).toEqual([{ kind: "analyze_reclamo_foto_intent", payload: { text: "no deseo" } }]);
  });

  it("un 'sí' limpio (quiere mandarla) se reconoce determinísticamente, no dispara IA", () => {
    const result = handleReclamo(awaitingFoto(), text("sí"));

    expect(result.session.state).toBe("reclamo_awaiting_foto");
    expect(queries(result)).toHaveLength(0);
  });

  it("un 'sí' con más palabras ('sí, ya te mando') no es un match determinístico limpio: se consulta a la IA", () => {
    const result = handleReclamo(awaitingFoto(), text("sí, ya te mando"));

    expect(result.session.state).toBe("reclamo_foto_intent_pending");
  });

  it("texto vacío, vuelve a pedir la foto sin IA", () => {
    const result = handleReclamo(awaitingFoto(), text(""));

    expect(result.session.state).toBe("reclamo_awaiting_foto");
    expect(queries(result)).toHaveLength(0);
  });

  it("texto demasiado largo no se manda a analizar, solo se repite el pedido", () => {
    const result = handleReclamo(awaitingFoto(), text("a".repeat(500)));

    expect(result.session.state).toBe("reclamo_awaiting_foto");
    expect(queries(result)).toHaveLength(0);
  });

  it("puro ruido no se manda a la IA, solo se repite el pedido", () => {
    const result = handleReclamo(awaitingFoto(), text("#!@#!@😵‍💫😵‍💫"));

    expect(result.session.state).toBe("reclamo_awaiting_foto");
    expect(queries(result)).toHaveLength(0);
  });
});

describe("reclamo_foto_intent_pending: resuelve lo que dijo la IA", () => {
  it("si la IA dice que quiere omitir, registra el reclamo sin foto", () => {
    const pending: Session = { state: "reclamo_foto_intent_pending", slots: { queja: "Mala atención" }, counters: {} };
    const result = handleReclamo(pending, fotoIntentResult(true));

    expect(result.session.state).toBe("reclamo_submit_pending");
    expect(queries(result)[0].kind).toBe("quejas_submit");
  });

  it("si la IA dice que no quiere omitir, vuelve a pedir la foto", () => {
    const pending: Session = { state: "reclamo_foto_intent_pending", slots: { queja: "Mala atención" }, counters: {} };
    const result = handleReclamo(pending, fotoIntentResult(false));

    expect(result.session.state).toBe("reclamo_awaiting_foto");
    expect(queries(result)).toHaveLength(0);
  });
});
