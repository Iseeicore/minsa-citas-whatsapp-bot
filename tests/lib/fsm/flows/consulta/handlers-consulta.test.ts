import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { queries, queryResult, sent, tap, text, texts } from "@/tests/support/fsm-events";
import {
  ASK_DNI_TEXT,
  ASK_ESTABLECIMIENTO_TEXT,
  ASK_TIPO_TEXT,
  BUSCANDO_INCIDENCIA_TEXT,
  CODIGO_EJEMPLO_ANONIMA,
  CODIGO_EJEMPLO_CON_DNI,
  CODIGO_NO_RECONOCIDO_TEXT,
  CONSULTA_FALLA_TEXT,
  ESTABLECIMIENTO_AGOTADO_TEXT,
  ESTABLECIMIENTO_ILEGIBLE_TEXT,
  ESTABLECIMIENTO_NO_ENCONTRADO_TEXT,
  ESTABLECIMIENTO_RECHAZADO_TEXT,
  ESTABLECIMIENTO_VARIOS_TEXT,
  LIMITE_DIARIO_TEXT,
  NO_UBICADA_TEXT,
  SERIE_CON_DNI_TEXT,
  askCodigoText,
  confirmEstablecimientoText,
  consultasRestantesText,
  invalidCodigoText,
  otraSerieText,
} from "@/lib/constants/textos/consulta";
import { INVALID_DOCUMENT_TEXT } from "@/lib/constants/textos/fallas";
import { FALLBACK_TEXT } from "@/lib/constants/textos/comunes";
import { ConsultaTipoButtonId } from "@/lib/enums/consulta-tipo-button-id";
import { ConsultaEstablecimientoButtonId } from "@/lib/enums/consulta-establecimiento-button-id";
import { CounterKey } from "@/lib/enums/counter-key";
import { CupoDiarioStatus } from "@/lib/enums/cupo-diario-status";
import { EstablecimientoSearchBy } from "@/lib/enums/establecimiento-search-by";
import { EstablecimientoSearchStatus } from "@/lib/enums/establecimiento-search-status";
import { LookupStatus } from "@/lib/enums/lookup-status";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

const ANONIMA = "MINSA-2026-A-000001";
const CON_DNI = "MINSA-2026-000001";
const HOSPITAL = { id: 7, areaId: 1, codigoRenipress: "5946", nombre: "Hospital Nacional Hipólito Unanue", distrito: "El Agustino" };

const cupo = (total: number) => queryResult(QueryKind.CONSULTA_CUPO_DIARIO, { statusCupo: CupoDiarioStatus.COUNTED, total });
const porNombre = (candidatos: unknown[]) =>
  queryResult(QueryKind.BUSCAR_ESTABLECIMIENTO, { by: EstablecimientoSearchBy.NOMBRE, status: EstablecimientoSearchStatus.OK, candidatos });
const porCodigo = () =>
  queryResult(QueryKind.BUSCAR_ESTABLECIMIENTO, {
    by: EstablecimientoSearchBy.CODIGO,
    status: EstablecimientoSearchStatus.FOUND,
    establecimiento: HOSPITAL,
  });
const ninguno = () => porNombre([]);

const at = (state: SessionState, slots: Session["slots"] = {}, counters: Session["counters"] = {}): Session => ({
  state,
  slots: { [SlotKey.CONSULTA_CANAL]: SessionChannel.WHATSAPP, [SlotKey.CONSULTA_USADAS_HOY]: 0, ...slots },
  counters,
});

function run(session: Session, ...events: Parameters<typeof handle>[1][]): HandlerResult {
  let step: HandlerResult = { session, effects: [], outcome: "continue" };
  for (const event of events) step = handle(step.session, event);
  return step;
}

describe("la entrada lee primero el cupo del día", () => {
  it.each([
    ["el menú", () => handle(at(SessionState.MAIN_MENU), tap("consultar_incidencia"))],
    ["la palabra clave", () => handleFirstContact("consultar mi denuncia", "whatsapp")],
  ])("desde %s pide el cupo sin mandar mensajes", (_origen, enter) => {
    const step = enter();

    expect(step.session.state).toBe(SessionState.CONSULTA_CUPO_PENDING);
    expect(queries(step)).toEqual([{ kind: QueryKind.CONSULTA_CUPO_DIARIO, payload: {} }]);
    expect(sent(step)).toEqual([]);
  });

  it("con cupo, pregunta si la denuncia fue anónima", () => {
    const step = run(at(SessionState.CONSULTA_CUPO_PENDING), cupo(0));

    expect(step.session.state).toBe(SessionState.CONSULTA_AWAITING_TIPO);
    expect(sent(step)).toMatchObject([
      { text: ASK_TIPO_TEXT, buttons: [{ id: ConsultaTipoButtonId.ANONIMA }, { id: ConsultaTipoButtonId.CON_DNI }] },
    ]);
  });

  it("con las 3 consultas del día usadas, la 4.ª termina con el aviso del límite", () => {
    const step = run(at(SessionState.CONSULTA_CUPO_PENDING), cupo(3));

    expect(step.session.state).toBe(SessionState.CONSULTA_FAILED);
    expect(texts(step)).toEqual([LIMITE_DIARIO_TEXT]);
  });

  it("si no se pudo contar el cupo, no lo toma como cero: avisa la falla y termina", () => {
    const step = run(
      at(SessionState.CONSULTA_CUPO_PENDING),
      queryResult(QueryKind.CONSULTA_CUPO_DIARIO, { statusCupo: CupoDiarioStatus.FAILED }),
    );

    expect(step.session.state).toBe(SessionState.CONSULTA_FAILED);
    expect(texts(step)).toEqual([CONSULTA_FALLA_TEXT]);
  });

  it.each([
    [ANONIMA, true],
    [CON_DNI, false],
  ])("el código %s escrito desde el menú deduce el tipo y salta la pregunta", (codigo, anonima) => {
    const step = run(at(SessionState.MAIN_MENU), text(`quiero ver mi denuncia ${codigo}`), cupo(1));

    expect(step.session.state).toBe(SessionState.CONSULTA_AWAITING_ESTABLECIMIENTO);
    expect(step.session.slots).toMatchObject({ [SlotKey.CONSULTA_CODIGO]: codigo, [SlotKey.CONSULTA_ANONIMA]: anonima });
    expect(texts(step)).toEqual([ASK_ESTABLECIMIENTO_TEXT]);
  });
});

describe("el camino completo", () => {
  it("anónima, con el establecimiento por nombre: consulta sin DNI y muestra el estado resumido", () => {
    const tipo = run(at(SessionState.CONSULTA_AWAITING_TIPO), tap(ConsultaTipoButtonId.ANONIMA));
    expect(texts(tipo)).toEqual([askCodigoText(CODIGO_EJEMPLO_ANONIMA)]);

    const nombre = run(tipo.session, text(ANONIMA), text("hospital hipolito unanue"));
    expect(queries(nombre)).toEqual([{ kind: QueryKind.BUSCAR_ESTABLECIMIENTO, payload: { nombre: "hospital hipolito unanue" } }]);

    const confirm = run(nombre.session, porNombre([{ ...HOSPITAL, similitud: 0.9, similitudPalabra: 1 }]));
    expect(sent(confirm)).toMatchObject([{ text: confirmEstablecimientoText(HOSPITAL.nombre, HOSPITAL.codigoRenipress) }]);

    const search = run(confirm.session, tap(ConsultaEstablecimientoButtonId.SI));
    expect(texts(search)).toEqual([BUSCANDO_INCIDENCIA_TEXT]);
    expect(queries(search)).toEqual([
      { kind: QueryKind.CONSULTAR_INCIDENCIA, payload: { codigo: ANONIMA, establecimientoId: 7, anonima: true, canal: "whatsapp" } },
    ]);

    const found = run(
      search.session,
      queryResult(QueryKind.CONSULTAR_INCIDENCIA, {
        status: LookupStatus.FOUND,
        codigo: ANONIMA,
        estado: "EN_GESTION",
        fechaRegistro: "2026-10-30T15:00:00.000Z",
      }),
    );
    expect(found.session).toEqual({ state: SessionState.CONSULTA_COMPLETED, slots: {}, counters: {} });
    expect(texts(found)).toEqual([`Denuncia ${ANONIMA}\nEstado: En proceso\nRegistrada el 30/10/2026`]);
  });

  it("con DNI, con el establecimiento por código IPRESS: pide el DNI y lo manda en la consulta", () => {
    const establecimiento = run(at(SessionState.CONSULTA_AWAITING_TIPO), tap(ConsultaTipoButtonId.CON_DNI), text(CON_DNI), text("5946"));
    expect(queries(establecimiento)).toEqual([{ kind: QueryKind.BUSCAR_ESTABLECIMIENTO, payload: { codigo: "5946" } }]);

    const dni = run(establecimiento.session, porCodigo(), tap(ConsultaEstablecimientoButtonId.SI));
    expect(dni.session.state).toBe(SessionState.CONSULTA_AWAITING_DNI);
    expect(texts(dni)).toEqual([ASK_DNI_TEXT]);

    expect(texts(run(dni.session, text("123")))).toEqual([INVALID_DOCUMENT_TEXT]);

    const search = run(dni.session, text("12345678"));
    expect(queries(search)).toEqual([
      {
        kind: QueryKind.CONSULTAR_INCIDENCIA,
        payload: { codigo: CON_DNI, establecimientoId: 7, anonima: false, canal: "whatsapp", dni: "12345678" },
      },
    ]);
  });
});

describe("los pasos", () => {
  it("una respuesta que no es Sí ni No vuelve a preguntar el tipo", () => {
    const step = run(at(SessionState.CONSULTA_AWAITING_TIPO), text("tal vez"));

    expect(step.session.state).toBe(SessionState.CONSULTA_AWAITING_TIPO);
    expect(texts(step)).toEqual([FALLBACK_TEXT]);
    expect(sent(step)[1]).toMatchObject({ text: ASK_TIPO_TEXT });
  });

  it("un código de la otra serie avisa el tipo con un ejemplo y no cuenta como intento", () => {
    const step = run(at(SessionState.CONSULTA_AWAITING_CODIGO, { [SlotKey.CONSULTA_ANONIMA]: true }), text(CON_DNI));

    expect(step.session.state).toBe(SessionState.CONSULTA_AWAITING_CODIGO);
    expect(texts(step)).toEqual([otraSerieText(SERIE_CON_DNI_TEXT, CODIGO_EJEMPLO_ANONIMA)]);
    expect(step.session.counters).toEqual({});
  });

  it("un código mal escrito se vuelve a pedir con el ejemplo de su tipo", () => {
    const step = run(at(SessionState.CONSULTA_AWAITING_CODIGO, { [SlotKey.CONSULTA_ANONIMA]: false }), text("123"));

    expect(texts(step)).toEqual([invalidCodigoText(CODIGO_EJEMPLO_CON_DNI)]);
    expect(step.session.counters[CounterKey.CONSULTA_INTENTOS_CODIGO]).toBe(1);
  });

  it("«No, es otro» vuelve a pedir el establecimiento y cuenta como intento del paso", () => {
    const propuesto = JSON.stringify({ id: 7, nombre: HOSPITAL.nombre, codigoRenipress: HOSPITAL.codigoRenipress });
    const step = run(
      at(SessionState.CONSULTA_CONFIRM_ESTABLECIMIENTO, { [SlotKey.CONSULTA_ESTABLECIMIENTO_PROPUESTO]: propuesto }),
      tap(ConsultaEstablecimientoButtonId.NO),
    );

    expect(step.session.state).toBe(SessionState.CONSULTA_AWAITING_ESTABLECIMIENTO);
    expect(texts(step)).toEqual([ESTABLECIMIENTO_RECHAZADO_TEXT]);
    expect(step.session.counters[CounterKey.CONSULTA_INTENTOS_ESTABLECIMIENTO]).toBe(1);
  });

  it("un establecimiento que no aparece se vuelve a pedir", () => {
    const step = run(at(SessionState.CONSULTA_BUSCAR_ESTABLECIMIENTO_PENDING), ninguno());

    expect(step.session.state).toBe(SessionState.CONSULTA_AWAITING_ESTABLECIMIENTO);
    expect(texts(step)).toEqual([ESTABLECIMIENTO_NO_ENCONTRADO_TEXT]);
  });

  it("con la búsqueda de establecimientos caída, avisa la falla y termina sin gastar una consulta", () => {
    const step = run(
      at(SessionState.CONSULTA_BUSCAR_ESTABLECIMIENTO_PENDING),
      queryResult(QueryKind.BUSCAR_ESTABLECIMIENTO, {
        by: EstablecimientoSearchBy.NOMBRE,
        status: EstablecimientoSearchStatus.UNAVAILABLE,
      }),
    );

    expect(step.session.state).toBe(SessionState.CONSULTA_FAILED);
    expect(texts(step)).toEqual([CONSULTA_FALLA_TEXT]);
    expect(queries(step)).toEqual([]);
  });
});

describe("el resultado y lo que cuenta para el cupo", () => {
  const pending = (usadas: number) => at(SessionState.CONSULTA_QUERY_PENDING, { [SlotKey.CONSULTA_USADAS_HOY]: usadas });

  it("no encontrada: dice cuántas consultas le quedan hoy", () => {
    const step = run(pending(1), queryResult(QueryKind.CONSULTAR_INCIDENCIA, { status: LookupStatus.NOT_FOUND }));

    expect(step.session.state).toBe(SessionState.CONSULTA_COMPLETED);
    expect(texts(step)).toEqual([`${NO_UBICADA_TEXT} ${consultasRestantesText(1)}`]);
  });

  it.each([{ status: LookupStatus.ERROR }, undefined])("error o resultado ilegible: avisa la falla y termina", (value) => {
    const step = run(pending(0), queryResult(QueryKind.CONSULTAR_INCIDENCIA, value));

    expect(step.session.state).toBe(SessionState.CONSULTA_FAILED);
    expect(texts(step)).toEqual([CONSULTA_FALLA_TEXT]);
  });

  it.each([
    [
      "3 códigos inválidos",
      at(SessionState.CONSULTA_AWAITING_CODIGO, { [SlotKey.CONSULTA_ANONIMA]: true }),
      [text("a"), text("b"), text("c")],
      CODIGO_NO_RECONOCIDO_TEXT,
    ],
    [
      "3 establecimientos no encontrados",
      at(SessionState.CONSULTA_BUSCAR_ESTABLECIMIENTO_PENDING),
      [ninguno(), text("x hospital"), ninguno(), text("y hospital"), ninguno()],
      ESTABLECIMIENTO_AGOTADO_TEXT,
    ],
  ])("%s agotan el paso y se registran como una consulta del día", (_caso, start, events, aviso) => {
    const step = run(start, ...events);

    expect(step.session.state).toBe(SessionState.CONSULTA_INTENTO_PENDING);
    expect(texts(step)).toEqual([aviso]);
    expect(queries(step)).toEqual([{ kind: QueryKind.CONSULTA_REINTENTOS_AGOTADOS, payload: { canal: "whatsapp" } }]);

    const closed = run(step.session, queryResult(QueryKind.CONSULTA_REINTENTOS_AGOTADOS, { statusCupo: CupoDiarioStatus.SAVED }));
    expect(closed.session).toEqual({ state: SessionState.CONSULTA_FAILED, slots: {}, counters: {} });
    expect(sent(closed)).toEqual([]);
  });

  it("la consulta no lleva el identificador de la persona: lo pone el servidor", () => {
    const step = run(
      at(SessionState.CONSULTA_AWAITING_DNI, {
        [SlotKey.CONSULTA_CODIGO]: CON_DNI,
        [SlotKey.CONSULTA_ANONIMA]: false,
        [SlotKey.CONSULTA_ESTABLECIMIENTO_ID]: 7,
      }),
      text("12345678"),
    );

    expect(JSON.stringify(queries(step))).not.toMatch(/waId|identificador|synthetic-fsm/);
  });
});

describe("respuestas fuera de lo esperado en cada paso", () => {
  const propuesto = JSON.stringify({ id: 7, nombre: HOSPITAL.nombre, codigoRenipress: HOSPITAL.codigoRenipress });

  it("el código escrito en la pregunta del tipo lo deduce por la serie", () => {
    const step = run(at(SessionState.CONSULTA_AWAITING_TIPO), text(ANONIMA));

    expect(step.session.slots[SlotKey.CONSULTA_ANONIMA]).toBe(true);
    expect(texts(step)).toEqual([ASK_ESTABLECIMIENTO_TEXT]);
  });

  it("un toque sin texto en el código vuelve a pedirlo sin contar intento", () => {
    const step = run(at(SessionState.CONSULTA_AWAITING_CODIGO, { [SlotKey.CONSULTA_ANONIMA]: true }), tap("cualquiera"));

    expect(texts(step)).toEqual([askCodigoText(CODIGO_EJEMPLO_ANONIMA)]);
    expect(step.session.counters).toEqual({});
  });

  it("una sesión sin el tipo elegido acepta el código de cualquier serie", () => {
    const step = run(at(SessionState.CONSULTA_AWAITING_CODIGO), text(ANONIMA));

    expect(step.session.state).toBe(SessionState.CONSULTA_AWAITING_ESTABLECIMIENTO);
  });

  it.each([
    ["sin texto", tap("cualquiera"), ASK_ESTABLECIMIENTO_TEXT],
    ["ilegible", text("??? !!! ..."), ESTABLECIMIENTO_ILEGIBLE_TEXT],
  ])("un establecimiento %s se vuelve a pedir sin buscar", (_caso, event, aviso) => {
    const step = run(at(SessionState.CONSULTA_AWAITING_ESTABLECIMIENTO), event);

    expect(texts(step)).toEqual([aviso]);
    expect(queries(step)).toEqual([]);
  });

  it("varios establecimientos parecidos piden el nombre completo", () => {
    const step = run(
      at(SessionState.CONSULTA_BUSCAR_ESTABLECIMIENTO_PENDING),
      porNombre([
        { ...HOSPITAL, nombre: "Hospital A", similitud: 0.5, similitudPalabra: 0 },
        { ...HOSPITAL, nombre: "Hospital B", similitud: 0.45, similitudPalabra: 0 },
      ]),
    );

    expect(texts(step)).toEqual([ESTABLECIMIENTO_VARIOS_TEXT]);
  });

  it("una respuesta que no es Sí ni No repite la confirmación del establecimiento", () => {
    const step = run(
      at(SessionState.CONSULTA_CONFIRM_ESTABLECIMIENTO, { [SlotKey.CONSULTA_ESTABLECIMIENTO_PROPUESTO]: propuesto }),
      text("quizás"),
    );

    expect(step.session.state).toBe(SessionState.CONSULTA_CONFIRM_ESTABLECIMIENTO);
    expect(texts(step)).toEqual([FALLBACK_TEXT]);
    expect(sent(step)[1]).toMatchObject({ text: confirmEstablecimientoText(HOSPITAL.nombre, HOSPITAL.codigoRenipress) });
  });

  it("sin el establecimiento propuesto en la sesión, lo vuelve a pedir", () => {
    const step = run(at(SessionState.CONSULTA_CONFIRM_ESTABLECIMIENTO), tap(ConsultaEstablecimientoButtonId.SI));

    expect(step.session.state).toBe(SessionState.CONSULTA_AWAITING_ESTABLECIMIENTO);
  });

  it("un mensaje mientras espera una consulta termina con el aviso de falla; un resultado mientras espera un mensaje se ignora", () => {
    expect(texts(run(at(SessionState.CONSULTA_QUERY_PENDING), text("hola")))).toEqual([CONSULTA_FALLA_TEXT]);

    const ignored = run(at(SessionState.CONSULTA_AWAITING_DNI), queryResult(QueryKind.CONSULTAR_INCIDENCIA, {}));
    expect(ignored.session.state).toBe(SessionState.CONSULTA_AWAITING_DNI);
    expect(ignored.effects).toEqual([]);
  });

  it("la última consulta del día no encontrada avisa que ya no quedan; sin fecha legible omite la línea", () => {
    const pending = at(SessionState.CONSULTA_QUERY_PENDING, { [SlotKey.CONSULTA_USADAS_HOY]: 2 });

    expect(texts(run(pending, queryResult(QueryKind.CONSULTAR_INCIDENCIA, { status: LookupStatus.NOT_FOUND })))).toEqual([
      `${NO_UBICADA_TEXT} ${consultasRestantesText(0)}`,
    ]);
    expect(
      texts(
        run(
          pending,
          queryResult(QueryKind.CONSULTAR_INCIDENCIA, {
            status: LookupStatus.FOUND,
            codigo: ANONIMA,
            estado: "RESUELTO",
            fechaRegistro: "x",
          }),
        ),
      ),
    ).toEqual([`Denuncia ${ANONIMA}\nEstado: Resuelta`]);
  });

  it.each([
    [0, "Ya no te quedan consultas hoy."],
    [1, "Te queda 1 consulta hoy."],
    [2, "Te quedan 2 consultas hoy."],
  ])("con %i consultas restantes dice «%s»", (restantes, esperado) => {
    expect(consultasRestantesText(restantes)).toBe(esperado);
  });
});

describe("una sesión guardada en un estado retirado", () => {
  it.each([
    "consulta_awaiting_otp",
    "consulta_awaiting_listado",
    "consulta_listar_pending",
    "consulta_validate_pending",
    "consulta_verify_pending",
  ])("%s vuelve a empezar la consulta con una sesión limpia", (retirado) => {
    const step = handle({ state: retirado, slots: {}, counters: {} } as unknown as Session, text("123456"));

    expect(step.session.state).toBe(SessionState.CONSULTA_CUPO_PENDING);
    expect(step.notes).toContainEqual(expect.objectContaining({ kind: "retired_state", detail: { state: retirado } }));
  });
});
