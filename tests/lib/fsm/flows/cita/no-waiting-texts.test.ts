import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { serializeOffered, type OfferedList } from "@/lib/fsm/parsing/selection/selection-matchers";
import { startReferenciasLookup } from "@/lib/fsm/flows/referencia/lookup";
import { resolveDistritoCandidates, resolveDistritoText } from "@/lib/fsm/flows/cita/parsing/distrito-resolver";
import type { HandlerResult, InboundEvent, QueryEffectKind, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { EstablecimientoPageRowId } from "@/lib/enums/establecimiento-page-row-id";
import { HoraPageButtonId } from "@/lib/enums/hora-page-button-id";
import { OtherEstablecimientoButtonId } from "@/lib/enums/other-establecimiento-button-id";
import { OtherFechaButtonId } from "@/lib/enums/other-fecha-button-id";

const FROM = "sandbox-no-waiting-texts";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "list", listId: id });
const queryResult = (queryKind: QueryEffectKind, result: unknown): QueryResultEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind,
  result,
});

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const queryKinds = (result: HandlerResult): string[] => result.effects.filter(isQueryEffect).map((effect) => effect.kind);

function at(state: Session["state"], slots: Session["slots"] = {}, offered?: OfferedList, counters: Session["counters"] = {}): Session {
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

function expectOnlyQuery(result: HandlerResult, kind: QueryEffectKind): void {
  expect(sent(result)).toEqual([]);
  expect(queryKinds(result)).toEqual([kind]);
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

beforeEach(() => {
  vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", "LIMA");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("identidad: sin «Validando…» ni «Verificando…»", () => {
  it("el documento válido solo consulta a MINSA", () => {
    expectOnlyQuery(handle(at("cita_awaiting_dni"), text("12345678")), "validate_user");
  });

  it("el código OTP solo se verifica", () => {
    expectOnlyQuery(handle(at("cita_awaiting_otp", { [SlotKey.CITA_TWOFA_ID]: "twofa-1" }), text("123456")), "verify_code");
  });

  it("la búsqueda de referencias no anuncia que analiza la cuenta", () => {
    expectOnlyQuery(startReferenciasLookup(at("cita_verify_pending")), "list_references");
  });
});

describe("ubicación: sin «Buscando tu ubigeo…» ni «Buscando tu distrito…»", () => {
  it("un único distrito candidato solo busca el ubigeo", () => {
    const candidate = { departamento: "Lima", provincia: "Lima", distrito: "Comas" };

    expectOnlyQuery(resolveDistritoCandidates(at("cita_awaiting_distrito_ai"), [candidate]), "search_ubigeo");
  });

  it("un distrito que solo la IA puede leer se consulta sin anunciarlo", () => {
    expectOnlyQuery(resolveDistritoText(at("cita_awaiting_distrito_ai"), "Sam Borja", undefined), "resolve_distrito_ai");
  });

  it("elegir un distrito entre varios solo busca el ubigeo", () => {
    const offered: OfferedList = {
      text: "Encontramos varias opciones. ¿Cuál es tu distrito?",
      rows: [
        { id: "Lima|Lima|Miraflores", title: "Miraflores", description: "Lima — Lima" },
        { id: "Arequipa|Arequipa|Miraflores", title: "Miraflores", description: "Arequipa — Arequipa" },
      ],
    };

    expectOnlyQuery(handle(at("cita_awaiting_distrito_disambiguation", {}, offered), tap("Lima|Lima|Miraflores")), "search_ubigeo");
  });

  it("el distrito escrito a mano solo busca el ubigeo", () => {
    const session = at("cita_awaiting_distrito", { [SlotKey.CITA_DEPARTAMENTO]: "Lima", [SlotKey.CITA_PROVINCIA]: "Lima" });

    expectOnlyQuery(handle(session, text("Miraflores")), "search_ubigeo");
  });

  it("un ubigeo fijado pasa a las especialidades sin el «Entendido. Buscando…»", () => {
    const session = at("cita_ubigeo_pending", { [SlotKey.CITA_DISTRITO]: "Comas" });
    const found = { status: "found", items: [{ ubigeoInei: "150110", distrito: "COMAS", provincia: "LIMA", departamento: "LIMA" }] };

    expectOnlyQuery(handle(session, queryResult("search_ubigeo", found)), "list_especialidades");
  });

  it("un ubigeo elegido de la lista pasa a las especialidades sin el «Entendido. Buscando…»", () => {
    expectOnlyQuery(handle(at("cita_awaiting_ubigeo_select", {}, ubigeos), tap("150101")), "list_especialidades");
  });
});

describe("catálogo: sin «Buscando…» ni «revisando tu respuesta»", () => {
  it("la especialidad elegida solo busca establecimientos", () => {
    expectOnlyQuery(handle(at("cita_awaiting_especialidad_select", {}, especialidades), tap("01")), "list_establecimientos");
  });

  it("un texto que la lista no reconoce va a la IA sin anunciarlo", () => {
    const result = handle(at("cita_awaiting_especialidad_select", {}, especialidades), text("algo para los dientes de mi hijo"));

    expect(result.session.state).toBe("cita_selection_hints_pending");
    expectOnlyQuery(result, "extract_selection_hints");
  });

  it("la página siguiente de establecimientos no anuncia la búsqueda", () => {
    const counters = { [CounterKey.CITA_ESTABLECIMIENTOS_PAGE]: 1, [CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES]: 2 };
    const session = at("cita_awaiting_establecimiento_select", {}, establecimientos, counters);

    expectOnlyQuery(handle(session, tap(EstablecimientoPageRowId.NEXT)), "list_establecimientos");
  });

  it("el establecimiento elegido solo busca fechas", () => {
    expectOnlyQuery(handle(at("cita_awaiting_establecimiento_select", {}, establecimientos), tap("0000456")), "list_fechas");
  });

  it("aceptar el establecimiento propuesto solo busca fechas", () => {
    const session = at("cita_awaiting_other_establecimiento", {
      [SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO]: "0000456",
      [SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE]: "Hospital Lurigancho",
    });

    expectOnlyQuery(handle(session, tap(OtherEstablecimientoButtonId.YES)), "list_fechas");
  });

  it("la referencia elegida solo busca fechas en su destino", () => {
    const session = at(
      "cita_awaiting_referencia_select",
      { [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify([REFERENCIA]) },
      { text: "Estas son tus referencias:", rows: [{ id: "1364486", title: "Gastroenterología", description: "Destino" }] },
    );

    expectOnlyQuery(handle(session, tap("1364486")), "list_fechas");
  });
});

describe("fecha y hora: sin «Buscando…» ni «Agendando…»", () => {
  it("aceptar otra fecha solo vuelve a buscar fechas", () => {
    expectOnlyQuery(handle(at("cita_awaiting_other_fecha"), tap(OtherFechaButtonId.YES)), "list_fechas");
  });

  it("una sola fecha se anuncia en negrita y sin «Buscando horarios…»", () => {
    const found = { status: "found", items: [{ fechaCupo: "22/09/2026", cantidadCupos: 3 }] };
    const result = handle(at("cita_fecha_pending"), queryResult("list_fechas", found));

    expect(sent(result)).toHaveLength(1);
    expect(sent(result)[0]).toMatchObject({ kind: "send_text", text: expect.stringMatching(/^Fecha encontrada: \*[^*]+\*\.$/) });
    expect(queryKinds(result)).toEqual(["list_horas"]);
  });

  it("una frase de tiempo que las reglas no leen va a la IA sin anunciarlo", () => {
    expectOnlyQuery(handle(at("cita_awaiting_fecha_select", {}, fechas), text("la próxima semana")), "resolve_fecha_ai");
  });

  it("la fecha elegida solo busca horarios", () => {
    expectOnlyQuery(handle(at("cita_awaiting_fecha_select", {}, fechas), tap("22/09/2026")), "list_horas");
  });

  it("la página siguiente de horarios no anuncia la búsqueda", () => {
    const session = at("cita_awaiting_hora_select", { [SlotKey.CITA_FECHA]: "22/09/2026" }, horas);

    expectOnlyQuery(handle(session, { from: FROM, type: "button", listId: HoraPageButtonId.NEXT }), "list_horas");
  });

  it("el horario elegido reserva sin «Agendando tu cita…»", () => {
    const session = at("cita_awaiting_hora_select", { [SlotKey.CITA_FECHA]: "22/09/2026" }, horas);

    expectOnlyQuery(handle(session, tap("08:45|09:15")), "book_appointment");
  });
});

describe("menú principal: sin «revisando tu mensaje»", () => {
  it("un mensaje que solo la IA puede leer se consulta sin anunciarlo", () => {
    const result = handle({ state: "main_menu", slots: {}, counters: {} }, text("Buenas tarde, no sé qué hacer"));

    expect(result.session.state).toBe("main_menu_intent_pending");
    expectOnlyQuery(result, "analyze_main_menu_intent");
  });
});
