import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { serializeOffered, type OfferedList } from "@/lib/fsm/parsing/selection/selection-matchers";
import { startReferenciasLookup } from "@/lib/fsm/flows/referencia/lookup";
import { resolveDistritoCandidates, resolveDistritoText } from "@/lib/fsm/flows/cita/parsing/distrito-resolver";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { QueryKind } from "@/lib/enums/query-kind";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";
import { EstablecimientoPageRowId } from "@/lib/enums/establecimiento-page-row-id";
import { HoraPageButtonId } from "@/lib/enums/hora-page-button-id";
import { OtherEstablecimientoButtonId } from "@/lib/enums/other-establecimiento-button-id";
import { OtherFechaButtonId } from "@/lib/enums/other-fecha-button-id";
import { pick, queries, queryResult, sent, tap, text } from "@/tests/support/fsm-events";
import { buildReferencia } from "@/tests/support/referencia";

type QueryOnlyCase = [string, () => HandlerResult, QueryKind];

function at(state: SessionState, slots: Session["slots"] = {}, offered?: OfferedList, counters: Session["counters"] = {}): Session {
  return {
    state,
    slots: {
      [SlotKey.CITA_BEARER]: "token",
      [SlotKey.CITA_DNI]: "12345678",
      [SlotKey.CITA_UBIGEO]: "150132",
      [SlotKey.CITA_COD_EESS]: "0000123",
      [SlotKey.CITA_ESPECIALIDAD_ID]: "02",
      ...slots,
      ...(offered ? { [SlotKey.CITA_OFFERED]: serializeOffered(offered) } : {}),
    },
    counters,
  };
}

function expectOnlyQuery(result: HandlerResult, kind: QueryKind): void {
  expect(sent(result)).toEqual([]);
  expect(queries(result).map((effect) => effect.kind)).toEqual([kind]);
}

const especialidades: OfferedList = {
  text: "Selecciona la especialidad:",
  rows: [
    { id: "01", title: "Medicina General", description: "5 cupos" },
    { id: "02", title: "Odontología", description: "3 cupos" },
  ],
};

const establecimientos: OfferedList = {
  text: "Selecciona el establecimiento:",
  rows: [
    { id: "0000123", title: "C.S. San Borja", description: "10 cupos" },
    { id: "0000456", title: "Hosp. Lurigancho", description: "4 cupos" },
    { id: EstablecimientoPageRowId.NEXT, title: "Ver más establecimientos", description: "Página 2 de 2" },
  ],
};

const fechas: OfferedList = {
  text: "Selecciona la fecha:",
  rows: [
    { id: "22/09/2026", title: "22/09/2026", description: "5 cupo(s) disponibles" },
    { id: "23/09/2026", title: "23/09/2026", description: "3 cupo(s) disponibles" },
  ],
};

const horas: OfferedList = {
  text: "Selecciona el horario:",
  rows: [
    { id: "08:00|08:30", title: "08:00 - 08:30", description: "2 cupo(s) disponibles" },
    { id: "08:45|09:15", title: "08:45 - 09:15", description: "1 cupo(s) disponibles" },
  ],
};

const ubigeos: OfferedList = {
  text: "Selecciona tu ubigeo:",
  rows: [
    { id: "150101", title: "San Juan de Lurigancho", description: "Lima — Lima" },
    { id: "150102", title: "San Juan de Miraflores", description: "Lima — Lima" },
  ],
};

const distritos: OfferedList = {
  text: "Encontramos varias opciones. ¿Cuál es tu distrito?",
  rows: [
    { id: "Lima|Lima|Miraflores", title: "Miraflores", description: "Lima — Lima" },
    { id: "Arequipa|Arequipa|Miraflores", title: "Miraflores", description: "Arequipa — Arequipa" },
  ],
};

const REFERENCIA = buildReferencia();
const UBIGEO_FOUND = { status: "found", items: [{ ubigeoInei: "150110", distrito: "COMAS", provincia: "LIMA", departamento: "LIMA" }] };
const FECHA_HORA = { [SlotKey.CITA_FECHA]: "22/09/2026" };

beforeEach(() => {
  vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", "LIMA");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("identidad: sin «Validando…» ni «Verificando…»", () => {
  it.each<QueryOnlyCase>([
    [
      "el documento válido solo consulta a MINSA",
      () => handle(at(SessionState.CITA_AWAITING_DNI), text("12345678")),
      QueryKind.VALIDATE_USER,
    ],
    [
      "el código OTP solo se verifica",
      () => handle(at(SessionState.CITA_AWAITING_OTP, { [SlotKey.CITA_TWOFA_ID]: "twofa-1" }), text("123456")),
      QueryKind.VERIFY_CODE,
    ],
    [
      "la búsqueda de referencias no anuncia que analiza la cuenta",
      () => startReferenciasLookup(at(SessionState.CITA_VERIFY_PENDING)),
      QueryKind.LIST_REFERENCES,
    ],
  ])("%s", (_name, run, kind) => {
    expectOnlyQuery(run(), kind);
  });
});

describe("ubicación: sin «Buscando tu ubigeo…» ni «Buscando tu distrito…»", () => {
  it.each<QueryOnlyCase>([
    [
      "un único distrito candidato solo busca el ubigeo",
      () =>
        resolveDistritoCandidates(at(SessionState.CITA_AWAITING_DISTRITO_AI), [
          { departamento: "Lima", provincia: "Lima", distrito: "Comas" },
        ]),
      QueryKind.SEARCH_UBIGEO,
    ],
    [
      "un distrito que solo la IA puede leer se consulta sin anunciarlo",
      () => resolveDistritoText(at(SessionState.CITA_AWAITING_DISTRITO_AI), "Sam Borja", undefined),
      QueryKind.RESOLVE_DISTRITO_AI,
    ],
    [
      "elegir un distrito entre varios solo busca el ubigeo",
      () => handle(at(SessionState.CITA_AWAITING_DISTRITO_DISAMBIGUATION, {}, distritos), pick("Lima|Lima|Miraflores")),
      QueryKind.SEARCH_UBIGEO,
    ],
    [
      "el distrito escrito a mano solo busca el ubigeo",
      () =>
        handle(
          at(SessionState.CITA_AWAITING_DISTRITO, { [SlotKey.CITA_DEPARTAMENTO]: "Lima", [SlotKey.CITA_PROVINCIA]: "Lima" }),
          text("Miraflores"),
        ),
      QueryKind.SEARCH_UBIGEO,
    ],
    [
      "un ubigeo fijado pasa a las especialidades sin el «Entendido. Buscando…»",
      () =>
        handle(
          at(SessionState.CITA_UBIGEO_PENDING, { [SlotKey.CITA_DISTRITO]: "Comas" }),
          queryResult(QueryKind.SEARCH_UBIGEO, UBIGEO_FOUND),
        ),
      QueryKind.LIST_ESPECIALIDADES,
    ],
    [
      "un ubigeo elegido de la lista pasa a las especialidades sin el «Entendido. Buscando…»",
      () => handle(at(SessionState.CITA_AWAITING_UBIGEO_SELECT, {}, ubigeos), pick("150101")),
      QueryKind.LIST_ESPECIALIDADES,
    ],
  ])("%s", (_name, run, kind) => {
    expectOnlyQuery(run(), kind);
  });
});

describe("catálogo: sin «Buscando…» ni «revisando tu respuesta»", () => {
  it.each<QueryOnlyCase>([
    [
      "la especialidad elegida solo busca establecimientos",
      () => handle(at(SessionState.CITA_AWAITING_ESPECIALIDAD_SELECT, {}, especialidades), pick("01")),
      QueryKind.LIST_ESTABLECIMIENTOS,
    ],
    [
      "la página siguiente de establecimientos no anuncia la búsqueda",
      () =>
        handle(
          at(SessionState.CITA_AWAITING_ESTABLECIMIENTO_SELECT, {}, establecimientos, {
            [CounterKey.CITA_ESTABLECIMIENTOS_PAGE]: 1,
            [CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES]: 2,
          }),
          pick(EstablecimientoPageRowId.NEXT),
        ),
      QueryKind.LIST_ESTABLECIMIENTOS,
    ],
    [
      "el establecimiento elegido solo busca fechas",
      () => handle(at(SessionState.CITA_AWAITING_ESTABLECIMIENTO_SELECT, {}, establecimientos), pick("0000456")),
      QueryKind.LIST_FECHAS,
    ],
    [
      "aceptar el establecimiento propuesto solo busca fechas",
      () =>
        handle(
          at(SessionState.CITA_AWAITING_OTHER_ESTABLECIMIENTO, {
            [SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO]: "0000456",
            [SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE]: "Hospital Lurigancho",
          }),
          pick(OtherEstablecimientoButtonId.YES),
        ),
      QueryKind.LIST_FECHAS,
    ],
    [
      "la referencia elegida solo busca fechas en su destino",
      () =>
        handle(
          at(
            SessionState.CITA_AWAITING_REFERENCIA_SELECT,
            { [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify([REFERENCIA]) },
            { text: "Estas son tus referencias:", rows: [{ id: REFERENCIA.idReferencia, title: "Cardiología", description: "Destino" }] },
          ),
          pick(REFERENCIA.idReferencia),
        ),
      QueryKind.LIST_FECHAS,
    ],
  ])("%s", (_name, run, kind) => {
    expectOnlyQuery(run(), kind);
  });

  it("un texto que la lista no reconoce va a la IA sin anunciarlo", () => {
    const result = handle(at(SessionState.CITA_AWAITING_ESPECIALIDAD_SELECT, {}, especialidades), text("algo para los dientes de mi hijo"));

    expect(result.session.state).toBe(SessionState.CITA_SELECTION_HINTS_PENDING);
    expectOnlyQuery(result, QueryKind.EXTRACT_SELECTION_HINTS);
  });
});

describe("fecha y hora: sin «Buscando…» ni «Agendando…»", () => {
  it.each<QueryOnlyCase>([
    [
      "aceptar otra fecha solo vuelve a buscar fechas",
      () => handle(at(SessionState.CITA_AWAITING_OTHER_FECHA), pick(OtherFechaButtonId.YES)),
      QueryKind.LIST_FECHAS,
    ],
    [
      "una frase de tiempo que las reglas no leen va a la IA sin anunciarlo",
      () => handle(at(SessionState.CITA_AWAITING_FECHA_SELECT, {}, fechas), text("la próxima semana")),
      QueryKind.RESOLVE_FECHA_AI,
    ],
    [
      "la fecha elegida solo busca horarios",
      () => handle(at(SessionState.CITA_AWAITING_FECHA_SELECT, {}, fechas), pick("22/09/2026")),
      QueryKind.LIST_HORAS,
    ],
    [
      "la página siguiente de horarios no anuncia la búsqueda",
      () => handle(at(SessionState.CITA_AWAITING_HORA_SELECT, FECHA_HORA, horas), tap(HoraPageButtonId.NEXT)),
      QueryKind.LIST_HORAS,
    ],
    [
      "el horario elegido reserva sin «Agendando tu cita…»",
      () => handle(at(SessionState.CITA_AWAITING_HORA_SELECT, FECHA_HORA, horas), pick("08:45|09:15")),
      QueryKind.BOOK_APPOINTMENT,
    ],
  ])("%s", (_name, run, kind) => {
    expectOnlyQuery(run(), kind);
  });

  it("una sola fecha se anuncia en negrita y sin «Buscando horarios…»", () => {
    const found = { status: "found", items: [{ fechaCupo: "22/09/2026", cantidadCupos: 3 }] };
    const result = handle(at(SessionState.CITA_FECHA_PENDING), queryResult(QueryKind.LIST_FECHAS, found));

    expect(sent(result)).toHaveLength(1);
    expect(sent(result)[0]).toMatchObject({ kind: SendType.TEXT, text: expect.stringMatching(/^Fecha encontrada: \*[^*]+\*\.$/) });
    expect(queries(result).map((effect) => effect.kind)).toEqual([QueryKind.LIST_HORAS]);
  });
});

describe("menú principal: sin «revisando tu mensaje»", () => {
  it("un mensaje que solo la IA puede leer se consulta sin anunciarlo", () => {
    const result = handle({ state: SessionState.MAIN_MENU, slots: {}, counters: {} }, text("Buenas tarde, no sé qué hacer"));

    expect(result.session.state).toBe(SessionState.MAIN_MENU_INTENT_PENDING);
    expectOnlyQuery(result, QueryKind.ANALYZE_MAIN_MENU_INTENT);
  });
});
