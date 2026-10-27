import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionChannel } from "@/lib/enums/session-channel";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { CitaReferenciaButtonId } from "@/lib/enums/cita-referencia-button-id";
import { CounterKey } from "@/lib/enums/counter-key";
import { ListPageButtonId } from "@/lib/enums/list-page-button-id";
import {
  REFERENCIA_ESPECIALIDAD_NO_INFORMADA_TEXT,
  REFERENCIAS_LIST_TEXT,
  referenciaBloqueadaText,
} from "@/lib/constants/textos/cita-reserva";
import { CITA_REFERENCIA_SIN_SELECCIONABLES_TEXT } from "@/lib/constants/textos/cita-referencia";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import { startBooking } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";
import {
  offerReferenciasList,
  restartReferenceSelection,
  withConsultaReferenciasActions,
} from "@/lib/fsm/flows/cita/steps/booking/references";
import { AppointmentMode } from "@/lib/enums/appointment-mode";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";

const FROM = "sandbox-references";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "list", listId: id });

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const texts = (result: HandlerResult): string[] =>
  sent(result)
    .filter((e) => e.kind === "send_text")
    .map((e) => (e as { text: string }).text);
const listRows = (result: HandlerResult) => {
  const list = sent(result).find((e) => e.kind === "send_interactive_list");
  return list?.kind === "send_interactive_list" ? list.rows : undefined;
};

const REFERENCIA: ReferenciaItem = {
  idReferencia: "1364486",
  numero: "00123",
  fechaInicio: "24/07/2024 23:03",
  ipressOrigen: "SAN FERNANDO",
  ipressDestino: "HOSPITAL MARIA AUXILIADORA",
  upsOrigen: "MEDICINA GENERAL",
  upsDestino: "GASTROENTEROLOGÍA",
  codigoIpressDestino: "5987",
  codigoUpsDestino: "222800",
  estado: 5,
};

function referenciaOffered(): Session {
  return {
    state: "cita_awaiting_referencia_select",
    slots: {
      [SlotKey.CITA_BEARER]: "token",
      [SlotKey.CITA_DNI]: "12345678",
      [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify([REFERENCIA]),
      [SlotKey.CITA_OFFERED]: JSON.stringify({
        text: "Estas son tus referencias:",
        rows: [{ id: "1364486", title: "HOSPITAL MARIA AUXILIADORA", description: "24/07/2024 11:03 pm · SAN FERNANDO" }],
      }),
    },
    counters: {},
  };
}

describe("handleAwaitingReferenciaSelect", () => {
  it("al elegir, consulta directamente las fechas del destino sin repetir una confirmación", () => {
    const result = handle(referenciaOffered(), tap("1364486"));

    expect(result.session.state).toBe("cita_fecha_pending");
    expect(result.effects.filter(isQueryEffect)).toEqual([{ kind: "list_fechas", payload: { codEess: "5987", especialidadId: "222800" } }]);
    expect(texts(result).join("\n")).not.toContain("¿Es esta tu referencia?");
    expect(sent(result).some((e) => e.kind === "send_buttons")).toBe(false);
  });
});

function referenciaConfirmPending(): Session {
  return {
    state: "cita_awaiting_referencia_confirm",
    slots: {
      [SlotKey.CITA_BEARER]: "token",
      [SlotKey.CITA_DNI]: "12345678",
      [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify([REFERENCIA]),
      [SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]: "1364486",
    },
    counters: {},
  };
}

describe("handleAwaitingReferenciaConfirm", () => {
  it("sí: usa el destino de la referencia y salta directo a buscar fechas, sin preguntar distrito", () => {
    const result = handle(referenciaConfirmPending(), text("si"));

    expect(result.session.state).toBe("cita_fecha_pending");
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBe("5987");
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_ID]).toBe("222800");
    expect(result.session.slots[SlotKey.CITA_ESTABLECIMIENTO_NOMBRE]).toBe("HOSPITAL MARIA AUXILIADORA");
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE]).toBe("GASTROENTEROLOGÍA");
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe("1364486");
    expect(texts(result).join(" ")).not.toContain("distrito");

    const fechas = result.effects.find((effect) => isQueryEffect(effect) && effect.kind === "list_fechas");
    expect(fechas).toEqual({ kind: "list_fechas", payload: { codEess: "5987", especialidadId: "222800" } });
  });

  it("sí, pero sin códigos de destino: permite elegir modalidad sin inventar otro destino", () => {
    const sinCodigos: ReferenciaItem = { ...REFERENCIA, codigoIpressDestino: "", codigoUpsDestino: "" };
    const session = referenciaConfirmPending();
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify([sinCodigos]);

    const result = handle(session, text("si"));

    expect(result.session.state).toBe("referencia_awaiting_appointment_mode");
    expect(result.effects.filter(isQueryEffect)).toEqual([]);
  });

  it("no, ver otra: vuelve a mostrar el listado de referencias", () => {
    const result = handle(referenciaConfirmPending(), text("no"));

    expect(result.session.state).toBe("cita_awaiting_referencia_select");
    expect(listRows(result)).toHaveLength(1);
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
  });

  it("respuesta ambigua: reintenta mostrando el mismo detalle", () => {
    const result = handle(referenciaConfirmPending(), text("mmm no se"));

    expect(result.session.state).toBe("cita_awaiting_referencia_confirm");
    expect(texts(result).join(" ")).toContain("N° : 00123");
  });

  it("limpia los contadores de la selección anterior en WhatsApp al confirmar una referencia", () => {
    const session = referenciaConfirmPending();
    session.channel = SessionChannel.WHATSAPP;
    session.counters = { [CounterKey.CITA_BOOKING_FAILURES]: 2, [CounterKey.CITA_HORA_PAGE]: 4, [CounterKey.CITA_LIST_PAGE]: 2 };

    const result = handle(session, text("si"));

    expect(result.session.state).toBe("cita_fecha_pending");
    expect(result.session.counters).toEqual({});
  });
});

describe("referencias para agendar en el chat web", () => {
  const web = (session: Session): Session => ({ ...session, channel: SessionChannel.WEB });

  it("distingue por especialidad las referencias del mismo hospital y conserva los tres estados entregados por MINSA", () => {
    const session = web(referenciaConfirmPending());
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify(
      [3, 5, 7].map((estado, index) => ({
        ...REFERENCIA,
        idReferencia: String(index),
        numero: `00${index}`,
        upsDestino: ["CARDIOLOGÍA", "TRAUMATOLOGÍA", "GASTROENTEROLOGÍA"][index],
        estado,
      })),
    );

    const result = offerReferenciasList(session);
    const rows = listRows(result);

    expect(rows?.map((row) => row.title)).toEqual(["CARDIOLOGÍA", "TRAUMATOLOGÍA", "GASTROENTEROLOGÍA"]);
    expect(rows?.map((row) => row.id)).toEqual(["0", "1", "2"]);
    expect(rows?.[0].description).toContain("HOSPITAL MARIA AUXILIADORA");
    expect(rows?.[0].description).toContain("N° 000");
    expect(rows?.[0].description).toContain("24/07/2024");
    expect(rows?.[0].description).toContain("ACEPTADO");
    expect(rows?.map((row) => row.disabled)).toEqual([undefined, undefined, true]);
    expect(rows?.every((row) => row.title.length <= 24 && (row.description?.length ?? 0) <= 72)).toBe(true);
  });

  it("incluye todos los datos públicos sin recortar los nombres largos ni confundir la fecha de referencia con una cita", () => {
    const session = web(referenciaConfirmPending());
    const reference = {
      ...REFERENCIA,
      upsDestino: "ATENCIÓN ESPECIALIZADA EN CARDIOLOGÍA PEDIÁTRICA Y CARDIOPATÍAS CONGÉNITAS",
      ipressDestino: "HOSPITAL NACIONAL DE ATENCIÓN ESPECIALIZADA Y REHABILITACIÓN INTEGRAL DEL DISTRITO DE SAN JUAN",
      ipressOrigen: "CENTRO DE SALUD DE ATENCIÓN PRIMARIA Y MEDICINA FAMILIAR DEL DISTRITO DE SAN JUAN",
    };
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify([reference]);
    session.slots[SlotKey.CITA_FECHA] = "24/10/2099";
    const original = structuredClone(session);

    const result = offerReferenciasList(session);
    const row = listRows(result)?.[0];

    expect(row?.id).toBe(reference.idReferencia);
    expect(row?.title.length).toBeLessThanOrEqual(24);
    expect(row?.referencia).toEqual({
      especialidad: reference.upsDestino,
      numero: reference.numero,
      destino: reference.ipressDestino,
      origen: reference.ipressOrigen,
      fecha: "24/07/2024",
      estado: "PACIENTE RECIBIDO",
    });
    expect(readOffered(result.session.slots)?.rows[0].referencia).toEqual(row?.referencia);
    expect(session).toEqual(original);
  });

  it.each(["", "   "])("una especialidad ausente (%j) se informa expresamente sin usar el hospital como especialidad", (upsDestino) => {
    const session = web(referenciaConfirmPending());
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify([{ ...REFERENCIA, upsDestino }]);

    const result = offerReferenciasList(session);
    const row = listRows(result)?.[0];

    expect(row?.title).toContain("Especialidad");
    expect(row?.title).not.toContain("HOSPITAL");
    expect(row?.referencia?.especialidad).toBe(REFERENCIA_ESPECIALIDAD_NO_INFORMADA_TEXT);
    expect(row?.referencia?.destino).toBe(REFERENCIA.ipressDestino);
    expect(row?.id).toBe(REFERENCIA.idReferencia);
  });

  it("destaca especialidad y destino en WhatsApp sin añadir metadatos web", () => {
    const session = referenciaConfirmPending();
    session.channel = SessionChannel.WHATSAPP;
    const original = structuredClone(session);

    const result = offerReferenciasList(session);

    expect(listRows(result)).toEqual([
      {
        id: REFERENCIA.idReferencia,
        title: "GASTROENTEROLOGÍA",
        description: "HOSPITAL MARIA AUXILIADORA · N° 00123 · 24/07/2024 · PACIENTE RECIBIDO",
      },
    ]);
    expect(readOffered(result.session.slots)?.rows[0]).not.toHaveProperty("referencia");
    expect(session).toEqual(original);
  });

  it("conserva los datos completos y los identificadores de referencia al cambiar de página", () => {
    const session = web(referenciaConfirmPending());
    const references = Array.from({ length: 12 }, (_, index) => ({
      ...REFERENCIA,
      idReferencia: `referencia-${index}`,
      numero: `numero-${index}`,
      ipressDestino: `HOSPITAL NACIONAL DE ATENCIÓN ESPECIALIZADA Y REHABILITACIÓN INTEGRAL NÚMERO ${index}`,
    }));
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify(references);
    const offered = offerReferenciasList(session);
    const original = structuredClone(offered.session);

    const nextPage = handle(offered.session, tap(ListPageButtonId.NEXT));
    const visible = listRows(nextPage);

    expect(visible?.map((row) => row.id)).toEqual([references[10].idReferencia, references[11].idReferencia]);
    expect(visible?.[0].referencia?.destino).toBe(references[10].ipressDestino);
    expect(visible?.[0].referencia?.numero).toBe(references[10].numero);
    expect(readOffered(nextPage.session.slots)?.rows[10].referencia).toEqual(visible?.[0].referencia);
    const selected = handle(nextPage.session, tap(references[10].idReferencia));
    expect(selected.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe(references[10].idReferencia);
    expect(offered.session).toEqual(original);
  });

  it("conserva los datos de las tarjetas al aclarar referencias de la misma especialidad", () => {
    const session = web(referenciaConfirmPending());
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify([
      { ...REFERENCIA, idReferencia: "111", numero: "00111", upsDestino: "CARDIOLOGÍA" },
      { ...REFERENCIA, idReferencia: "222", numero: "00222", upsDestino: "CARDIOLOGÍA" },
    ]);
    const offered = offerReferenciasList(session);

    const ambiguous = handle(offered.session, text("cardiologia"));
    const rows = listRows(ambiguous);

    expect(rows?.map((row) => row.referencia?.numero)).toEqual(["00111", "00222"]);
    expect(readOffered(ambiguous.session.slots)?.rows).toEqual(rows);
    const selected = handle(ambiguous.session, tap("222"));
    expect(selected.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe("222");
    expect(selected.session.state).toBe("cita_fecha_pending");
    expect(texts(selected).join(" ")).not.toContain("¿Es esta tu referencia?");
  });

  it("elegir una referencia pasa directamente a buscar fechas en su destino y especialidad sin pedir confirmación intermedia", () => {
    const session = web(referenciaConfirmPending());
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify([
      REFERENCIA,
      { ...REFERENCIA, idReferencia: "222", numero: "00999", upsDestino: "CARDIOLOGÍA", codigoUpsDestino: "070" },
    ]);
    const offered = offerReferenciasList(session);
    const original = structuredClone(offered.session);

    const result = handle(offered.session, text("cardiologia"));

    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe("222");
    expect(result.session.state).toBe("cita_fecha_pending");
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBe(REFERENCIA.codigoIpressDestino);
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_ID]).toBe("070");
    expect(result.effects.some((effect) => effect.kind === "send_buttons")).toBe(false);
    expect(result.effects.find(isQueryEffect)).toEqual({
      kind: "list_fechas",
      payload: { codEess: REFERENCIA.codigoIpressDestino, especialidadId: "070" },
    });
    expect(texts(result).join(" ")).not.toContain("¿Es esta tu referencia?");
    expect(offered.session).toEqual(original);
  });

  it.each(["codigoIpressDestino", "codigoUpsDestino"] as const)(
    "si falta %s, vuelve a la elección sin consultar fechas ni cambiar a cita nueva",
    (campo) => {
      const session = web(referenciaConfirmPending());
      session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify([{ ...REFERENCIA, [campo]: "" }]);

      const result = handle(offerReferenciasList(session).session, tap(REFERENCIA.idReferencia));

      expect(result.session.state).toBe("referencia_awaiting_appointment_mode");
      expect(result.effects.some(isQueryEffect)).toBe(false);
      expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
      expect(texts(result).join(" ")).toContain("no tiene todos los datos de destino");
      expect(session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe(REFERENCIA.idReferencia);
    },
  );

  it("si la selección ya no existe, informa el problema y permite consultar de nuevo", () => {
    const session = web(referenciaConfirmPending());
    delete session.slots[SlotKey.CITA_REFERENCIAS_DATA];

    const result = handle(session, text("si"));

    expect(result.session.state).toBe("referencia_awaiting_lookup_retry");
    expect(result.effects.some(isQueryEffect)).toBe(false);
    expect(texts(result).join(" ")).toContain("ya no está en el listado");
  });

  it("un error al volver a consultar una referencia desaparecida conserva la opción de reintentar", () => {
    const session = web(referenciaConfirmPending());
    delete session.slots[SlotKey.CITA_REFERENCIAS_DATA];
    const missing = handle(session, text("si"));
    const retry = handle(missing.session, { from: FROM, type: "button", listId: CitaReferenciaButtonId.RETRY });
    expect(retry.session.state).toBe("referencia_lookup_pending");

    const result = handle(retry.session, {
      from: FROM,
      type: InternalEventType.QUERY_RESULT,
      queryKind: "list_references",
      result: { statusReference: "error", data: [], message: "" },
    });

    expect(result.session.state).toBe("referencia_awaiting_lookup_retry");
    expect(texts(result).join(" ")).not.toContain("No cuentas con referencias");
  });

  it("rechaza una fila cuyo identificador ya no está en los datos de referencias", () => {
    const session = web(referenciaOffered());
    delete session.slots[SlotKey.CITA_REFERENCIAS_DATA];

    const result = handle(session, tap(REFERENCIA.idReferencia));

    expect(result.session.state).toBe("referencia_awaiting_lookup_retry");
    expect(result.effects.some(isQueryEffect)).toBe(false);
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
  });

  it("limpia las preferencias anteriores solo al confirmar y conserva los códigos de la referencia elegida", () => {
    const session = web(referenciaConfirmPending());
    session.slots[SlotKey.CITA_DISTRITO_HINT_TEXT] = "Surco";
    session.slots[SlotKey.CITA_ESPECIALIDAD_HINT_TEXT] = "Traumatología";
    session.slots[SlotKey.CITA_ESTABLECIMIENTO_HINT_TEXT] = "Otro hospital";
    session.slots[SlotKey.INITIAL_MESSAGE_TEXT] = "Quiero traumatología en Surco";
    session.slots[SlotKey.CITA_FECHAS_DESCARTADAS] = "24/10/2026";

    const offered = offerReferenciasList(session);
    expect(offered.session.slots[SlotKey.CITA_DISTRITO_HINT_TEXT]).toBe("Surco");
    const result = handle(session, text("si"));

    expect(result.session.slots[SlotKey.CITA_DISTRITO_HINT_TEXT]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_ESTABLECIMIENTO_HINT_TEXT]).toBeUndefined();
    expect(result.session.slots[SlotKey.INITIAL_MESSAGE_TEXT]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_FECHAS_DESCARTADAS]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBe(REFERENCIA.codigoIpressDestino);
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_ID]).toBe(REFERENCIA.codigoUpsDestino);
    expect(session.slots[SlotKey.CITA_DISTRITO_HINT_TEXT]).toBe("Surco");
  });

  it("al elegir otra referencia después de una cita duplicada reinicia los intentos y permite reintentar su primer error", () => {
    const session = web(referenciaConfirmPending());
    session.state = "cita_booking_pending";
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify([
      REFERENCIA,
      { ...REFERENCIA, idReferencia: "222", codigoIpressDestino: "777", codigoUpsDestino: "070", upsDestino: "CARDIOLOGÍA" },
    ]);
    session.counters = { [CounterKey.CITA_BOOKING_FAILURES]: 2, [CounterKey.CITA_HORA_PAGE]: 4, [CounterKey.CITA_LIST_PAGE]: 2 };
    const original = structuredClone(session);
    const duplicate = handle(session, {
      from: FROM,
      type: InternalEventType.QUERY_RESULT,
      queryKind: "book_appointment",
      result: { status: "duplicate" },
    });
    const listed = handle(duplicate.session, tap(CitaReferenciaButtonId.REFERENCE));
    const selected = handle(listed.session, tap("222"));

    expect(selected.session.counters[CounterKey.CITA_BOOKING_FAILURES]).toBeUndefined();
    expect(selected.session.counters[CounterKey.CITA_HORA_PAGE]).toBeUndefined();
    expect(selected.session.counters[CounterKey.CITA_LIST_PAGE]).toBeUndefined();

    const booking = startBooking(
      { ...selected.session, slots: { ...selected.session.slots, [SlotKey.CITA_FECHA]: "07/10/2099" } },
      "18:00",
    );
    const failed = handle(booking.session, {
      from: FROM,
      type: InternalEventType.QUERY_RESULT,
      queryKind: "book_appointment",
      result: { status: "error" },
    });

    expect(failed.session.state).toBe("cita_hora_pending");
    expect(failed.session.counters[CounterKey.CITA_BOOKING_FAILURES]).toBe(1);
    expect(failed.effects.find((effect) => isQueryEffect(effect) && effect.kind === "list_horas")).toEqual({
      kind: "list_horas",
      payload: { codEess: "777", especialidadId: "070", fecha: "07/10/2099" },
    });
    expect(failed.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe("222");
    expect(session).toEqual(original);
  });

  it("volver a elegir referencia limpia toda la reserva anterior y conserva la identidad validada sin mutar la entrada", () => {
    const session = web(referenciaConfirmPending());
    session.state = "cita_awaiting_hora_confirm";
    session.slots = {
      ...session.slots,
      [SlotKey.CITA_COD_EESS]: "5987",
      [SlotKey.CITA_ESPECIALIDAD_ID]: "222800",
      [SlotKey.CITA_ESTABLECIMIENTO_NOMBRE]: REFERENCIA.ipressDestino,
      [SlotKey.CITA_ESPECIALIDAD_NOMBRE]: REFERENCIA.upsDestino,
      [SlotKey.CITA_FECHA]: "07/10/2099",
      [SlotKey.CITA_HORA_CONFIRM_ID]: "18:00|18:30",
      [SlotKey.CITA_HORA_CONFIRM_ONLY]: "only",
      [SlotKey.CITA_HORA_CHOICE_A]: "18:00|18:30",
      [SlotKey.CITA_HORA_CHOICE_B]: "19:00|19:30|1",
      [SlotKey.CITA_HORAS_DIA]: "18:00|18:30|1",
      [SlotKey.CITA_FECHAS_DESCARTADAS]: "06/10/2099",
      [SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS]: "otro",
      [SlotKey.CITA_ESPECIALIDADES_DESCARTADAS]: "otra",
      [SlotKey.CITA_RESUME_STATE]: "cita_hora_pending",
      [SlotKey.CITA_EXIT_RESUME_STATE]: "cita_awaiting_hora_confirm",
      [SlotKey.CITA_APPOINTMENT_MODE]: AppointmentMode.REFERENCE,
    };
    session.counters = { [CounterKey.CITA_BOOKING_FAILURES]: 2, [CounterKey.CITA_HORA_PAGE]: 4, [CounterKey.CITA_LIST_PAGE]: 3 };
    const original = structuredClone(session);

    const result = restartReferenceSelection(session);

    expect(result.session.state).toBe("cita_awaiting_referencia_select");
    const remaining = { ...result.session.slots };
    delete remaining[SlotKey.CITA_OFFERED];
    expect(remaining).toEqual({
      [SlotKey.CITA_BEARER]: "token",
      [SlotKey.CITA_DNI]: "12345678",
      [SlotKey.CITA_REFERENCIAS_DATA]: session.slots[SlotKey.CITA_REFERENCIAS_DATA],
      [SlotKey.CITA_APPOINTMENT_MODE]: AppointmentMode.REFERENCE,
      [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.CITA_REFERENCIAS,
    });
    expect(result.session.counters).toEqual({});
    expect(listRows(result)?.[0].id).toBe(REFERENCIA.idReferencia);
    expect(session).toEqual(original);
  });

  it("si desapareció la lista al cambiar de referencia permite reconsultarla con la identidad validada", () => {
    const session = web(referenciaConfirmPending());
    delete session.slots[SlotKey.CITA_REFERENCIAS_DATA];

    const result = restartReferenceSelection(session);

    expect(result.session.state).toBe("referencia_awaiting_lookup_retry");
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("token");
    expect(result.session.slots[SlotKey.CITA_DNI]).toBe("12345678");
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.CITA_REFERENCIAS);
  });
});

describe("referencias en todos los estados", () => {
  const conEstado = (id: string, estado: number, extra: Partial<ReferenciaItem> = {}): ReferenciaItem => ({
    ...REFERENCIA,
    idReferencia: id,
    numero: `n-${id}`,
    upsDestino: `ESPECIALIDAD ${id}`,
    codigoIpressDestino: `eess-${id}`,
    codigoUpsDestino: `ups-${id}`,
    estado,
    ...extra,
  });
  const PENDIENTE = conEstado("pendiente", 1, { upsDestino: "NEUROLOGÍA", estadoDescripcion: "PENDIENTE" });
  const ACEPTADA = conEstado("aceptada", 3, { upsDestino: "CARDIOLOGÍA" });
  const SIN_DESCRIPCION = conEstado("sin-descripcion", 9, { numero: "009", upsDestino: "DERMATOLOGÍA" });
  const RECIBIDA = conEstado("recibida", 5, { upsDestino: "GASTROENTEROLOGÍA" });
  const MINSA_ORDER = [PENDIENTE, ACEPTADA, SIN_DESCRIPCION, RECIBIDA];

  const listed = (channel: SessionChannel, items: ReferenciaItem[] = MINSA_ORDER): Session => {
    const session = referenciaConfirmPending();
    session.channel = channel;
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify(items);
    return offerReferenciasList(session).session;
  };

  const expectRejectedOnSamePage = (before: Session, result: HandlerResult, etiqueta: string) => {
    expect(texts(result)[0]).toBe(referenciaBloqueadaText(etiqueta));
    expect(result.session).toEqual(before);
    expect(result.effects.some(isQueryEffect)).toBe(false);
    const page = before.counters[CounterKey.CITA_LIST_PAGE] ?? 0;
    const size = before.channel === SessionChannel.WHATSAPP ? 7 : 10;
    const expected = readOffered(before.slots)?.rows.slice(page * size, (page + 1) * size);
    expect(listRows(result)).toEqual(expected);
  };

  it("WhatsApp muestra solo las referencias que permiten agendar, sin filas bloqueadas", () => {
    const session = referenciaConfirmPending();
    session.channel = SessionChannel.WHATSAPP;
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify(MINSA_ORDER);

    const result = offerReferenciasList(session);
    const rows = listRows(result);

    expect(rows?.map((row) => row.id)).toEqual(["aceptada", "recibida"]);
    expect(rows?.map((row) => row.disabled)).toEqual([undefined, undefined]);
    expect(rows?.map((row) => row.description?.split(" · ").at(-1))).toEqual(["ACEPTADO", "PACIENTE RECIBIDO"]);
    expect(readOffered(result.session.slots)?.rows).toEqual(rows);
  });

  it("web en Cita con referencia muestra solo las que permiten agendar", () => {
    const session = referenciaConfirmPending();
    session.channel = SessionChannel.WEB;
    session.slots[SlotKey.CITA_APPOINTMENT_MODE] = AppointmentMode.REFERENCE;
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify(MINSA_ORDER);

    const result = offerReferenciasList(session);
    const rows = readOffered(result.session.slots)?.rows;

    expect(rows?.map((row) => [row.id, row.disabled])).toEqual([
      ["aceptada", undefined],
      ["recibida", undefined],
    ]);
    expect(withConsultaReferenciasActions(result)).toEqual(result);
    expect(readOffered(result.session.slots)?.text).toBe(REFERENCIAS_LIST_TEXT);
  });

  it("web conserva la etiqueta del estado en la tarjeta y la marca como no seleccionable", () => {
    const rows = readOffered(listed(SessionChannel.WEB).slots)?.rows;

    expect(rows?.map((row) => [row.id, row.referencia?.estado, row.disabled])).toEqual([
      ["aceptada", "ACEPTADO", undefined],
      ["recibida", "PACIENTE RECIBIDO", undefined],
      ["pendiente", "PENDIENTE", true],
      ["sin-descripcion", "Código 9", true],
    ]);
  });

  it("web rechaza el toque de una referencia bloqueada y repite la misma página", () => {
    const before = listed(SessionChannel.WEB);

    expectRejectedOnSamePage(before, handle(before, tap(PENDIENTE.idReferencia)), "PENDIENTE");
    expectRejectedOnSamePage(before, handle(before, tap(SIN_DESCRIPCION.idReferencia)), "Código 9");
  });

  it("WhatsApp numera solo las referencias que permiten agendar", () => {
    const items = [
      ...Array.from({ length: 3 }, (_, index) => conEstado(`bloqueada-${index}`, 2, { estadoDescripcion: "OBSERVADO" })),
      ...Array.from({ length: 6 }, (_, index) => conEstado(`aceptada-${index}`, 3)),
    ];
    const first = listed(SessionChannel.WHATSAPP, items);

    expect(readOffered(first.slots)?.rows.map((row) => row.id)).toEqual(Array.from({ length: 6 }, (_, index) => `aceptada-${index}`));
    expect(handle(first, text("7")).session.state).toBe("cita_awaiting_referencia_select");
    expect(handle(first, text("7")).effects.some(isQueryEffect)).toBe(false);
    expect(handle(first, tap("bloqueada-0")).effects.some(isQueryEffect)).toBe(false);

    const chosen = handle(first, text("1"));
    expect(chosen.session.state).toBe("cita_fecha_pending");
    expect(chosen.effects.filter(isQueryEffect)).toEqual([
      { kind: "list_fechas", payload: { codEess: "eess-aceptada-0", especialidadId: "ups-aceptada-0" } },
    ]);
  });

  it("web resuelve nombres y ordinales contra las filas ordenadas y rechaza las bloqueadas", () => {
    const before = listed(SessionChannel.WEB);

    expectRejectedOnSamePage(before, handle(before, text("neurologia")), "PENDIENTE");
    expectRejectedOnSamePage(before, handle(before, text("la tercera")), "PENDIENTE");
    expectRejectedOnSamePage(before, handle(before, text("la ultima")), "Código 9");

    const chosen = handle(before, text("la primera"));
    expect(chosen.session.state).toBe("cita_fecha_pending");
    expect(chosen.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe(ACEPTADA.idReferencia);
    expect(chosen.effects.filter(isQueryEffect)).toEqual([
      { kind: "list_fechas", payload: { codEess: "eess-aceptada", especialidadId: "ups-aceptada" } },
    ]);
  });

  it("una referencia seleccionable sigue el flujo actual aunque haya bloqueadas en la lista", () => {
    const chosen = handle(listed(SessionChannel.WHATSAPP), tap(RECIBIDA.idReferencia));

    expect(chosen.session.state).toBe("cita_fecha_pending");
    expect(chosen.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe(RECIBIDA.idReferencia);
    expect(chosen.effects.filter(isQueryEffect)).toEqual([
      { kind: "list_fechas", payload: { codEess: "eess-recibida", especialidadId: "ups-recibida" } },
    ]);
  });

  it("WhatsApp conserva número, fecha y estado completos y acorta solo el destino largo", () => {
    const largo = conEstado("largo", 5, {
      numero: "02441",
      fechaInicio: "12/12/2017 08:00",
      ipressDestino: "HOSPITAL NACIONAL ARZOBISPO LOAYZA DE LA CIUDAD DE LIMA METROPOLITANA",
    });
    const row = readOffered(listed(SessionChannel.WHATSAPP, [largo]).slots)?.rows[0];

    expect(row?.description?.length).toBeLessThanOrEqual(72);
    expect(row?.description?.startsWith("HOSPITAL NACIONAL ARZOBISPO")).toBe(true);
    expect(row?.description?.endsWith("… · N° 02441 · 12/12/2017 · PACIENTE RECIBIDO")).toBe(true);
  });

  it.each([
    ["volver a elegir referencia", (session: Session) => restartReferenceSelection(session)],
    [
      "elegir Cita con referencia",
      (session: Session) => handle({ ...session, state: "referencia_awaiting_appointment_mode" }, tap(CitaReferenciaButtonId.REFERENCE)),
    ],
  ])("al %s sin ninguna que permita agendar continúa con una cita nueva en vez de una lista sin salida", (_caso, act) => {
    const session = referenciaConfirmPending();
    session.channel = SessionChannel.WHATSAPP;
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify([PENDIENTE, SIN_DESCRIPCION]);

    const result = act(session);

    expect(texts(result)[0]).toBe(CITA_REFERENCIA_SIN_SELECCIONABLES_TEXT);
    expect(listRows(result)).toBeUndefined();
    expect(result.session.state).toBe("cita_awaiting_distrito_ai");
    expect(result.session.slots[SlotKey.CITA_APPOINTMENT_MODE]).toBe(AppointmentMode.NEW);
    expect(result.session.slots[SlotKey.CITA_REFERENCIAS_DATA]).toBeUndefined();
  });

  it("PACIENTE CITADO (7) no aparece en WhatsApp y en la web se muestra bloqueada y rechazada por toque y nombre", () => {
    const citada = conEstado("citada-7", 7, { upsDestino: "OFTALMOLOGÍA" });
    const recibida = conEstado("recibida-5", 5, { upsDestino: "PEDIATRÍA" });
    const items = [citada, ACEPTADA, recibida];

    const whatsapp = listed(SessionChannel.WHATSAPP, items);
    expect(readOffered(whatsapp.slots)?.rows.map((row) => [row.id, row.disabled])).toEqual([
      ["aceptada", undefined],
      ["recibida-5", undefined],
    ]);
    expect(handle(whatsapp, tap("citada-7")).effects.some(isQueryEffect)).toBe(false);

    const web = listed(SessionChannel.WEB, items);
    expect(readOffered(web.slots)?.rows[2]).toMatchObject({ disabled: true, referencia: { estado: "PACIENTE CITADO" } });
    expectRejectedOnSamePage(web, handle(web, text("oftalmologia")), "PACIENTE CITADO");
    expectRejectedOnSamePage(web, handle(web, tap("citada-7")), "PACIENTE CITADO");
  });

  it("el segundo control impide agendar con una referencia bloqueada aunque llegue confirmada", () => {
    const session = referenciaConfirmPending();
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify(MINSA_ORDER);
    session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID] = PENDIENTE.idReferencia;

    const result = handle(session, text("si"));

    expect(result.effects.some(isQueryEffect)).toBe(false);
    expect(texts(result)[0]).toBe(referenciaBloqueadaText("PENDIENTE"));
    expect(result.session.state).toBe("cita_awaiting_referencia_select");
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
    expect(listRows(result)?.map((row) => row.id)).toEqual(["aceptada", "recibida"]);
  });
});
