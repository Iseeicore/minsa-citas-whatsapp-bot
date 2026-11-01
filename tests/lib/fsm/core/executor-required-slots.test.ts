import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { MissingSlotError } from "@/lib/errors/missing-slot-error";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionChannel } from "@/lib/enums/session-channel";
import { ResultadoIntentoConsulta } from "@/lib/enums/resultado-intento-consulta";

const minsa = vi.hoisted(() => ({
  searchUbigeo: vi.fn(async () => ({ status: "found", items: [] })),
  listEspecialidades: vi.fn(async () => ({ status: "found", items: [] })),
  listEstablecimientos: vi.fn(async () => ({ status: "found", items: [] })),
  listFechas: vi.fn(async () => ({ status: "found", items: [] })),
  listHoras: vi.fn(async () => ({ status: "found", items: [] })),
  bookAppointment: vi.fn(async () => ({ status: "error" })),
  listReferences: vi.fn(async () => ({ status: "error" })),
  validateUser: vi.fn(async () => ({ status: "error" })),
  verifyCode: vi.fn(async () => ({ status: "error" })),
  consultarIncidencia: vi.fn(async () => ({ status: "error" })),
  countIntentosDelDia: vi.fn(async () => ({ statusCupo: "counted", total: 0 })),
  saveIntentoConsulta: vi.fn(async () => ({ statusCupo: "saved" })),
  saveAceptacionTerminos: vi.fn(async () => ({ ok: true })),
  waitBeforeBookingRetry: vi.fn(async () => undefined),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async () => ({ state: "main_menu", slots: {}, counters: {} }),
  saveSession: async () => undefined,
}));
vi.mock("@/lib/integrations/minsa/catalog", () => ({
  searchUbigeo: minsa.searchUbigeo,
  listEspecialidades: minsa.listEspecialidades,
  listEstablecimientos: minsa.listEstablecimientos,
  listFechas: minsa.listFechas,
  listHoras: minsa.listHoras,
}));
vi.mock("@/lib/integrations/minsa/booking", () => ({ bookAppointment: minsa.bookAppointment }));
vi.mock("@/lib/integrations/minsa/booking-retry", () => ({ waitBeforeBookingRetry: minsa.waitBeforeBookingRetry }));
vi.mock("@/lib/integrations/minsa/references", () => ({ listReferences: minsa.listReferences }));
vi.mock("@/lib/integrations/minsa/identity", () => ({ validateUser: minsa.validateUser, verifyCode: minsa.verifyCode }));
vi.mock("@/lib/recepcion/consulta", () => ({ consultarIncidencia: minsa.consultarIncidencia }));
vi.mock("@/lib/consulta/cupo-diario", () => ({
  countIntentosDelDia: minsa.countIntentosDelDia,
  saveIntentoConsulta: minsa.saveIntentoConsulta,
}));
vi.mock("@/lib/terminos/aceptacion-terminos", () => ({ saveAceptacionTerminos: minsa.saveAceptacionTerminos }));
vi.mock("@/lib/composition/stores", () => import("@/tests/support/memory-stores"));

import { runTurnUnlocked } from "@/lib/fsm/core/executor";

const FROM = "51999000333";
const event = { from: FROM, type: "text" as const, text: "hola", channel: "whatsapp" as const };

const startWith = (kind: QueryKind, payload: Record<string, unknown>, slots: Session["slots"] = {}): HandlerResult => ({
  session: { state: "main_menu", slots, counters: {} },
  effects: [{ kind, payload }],
  outcome: "continue",
});

const BEARER = { [SlotKey.CITA_BEARER]: "token" };

const CASES: Array<[QueryKind, Record<string, unknown>, ReturnType<typeof vi.fn>]> = [
  [QueryKind.SEARCH_UBIGEO, { departamento: "Lima", provincia: "Lima", distrito: "Comas" }, minsa.searchUbigeo],
  [QueryKind.LIST_ESPECIALIDADES, { ubigeo: "150101" }, minsa.listEspecialidades],
  [QueryKind.LIST_ESTABLECIMIENTOS, { especialidadId: "02", ubigeo: "150101" }, minsa.listEstablecimientos],
  [QueryKind.LIST_FECHAS, { codEess: "0000123", especialidadId: "02" }, minsa.listFechas],
  [QueryKind.LIST_HORAS, { codEess: "0000123", especialidadId: "02", fecha: "22/09/2026" }, minsa.listHoras],
  [
    QueryKind.BOOK_APPOINTMENT,
    { codigoRenipress: "0000123", codigoUps: "02", fechaCita: "22/09/2026", horaInicio: "08:00", numeroDocumentoPaciente: "12345678" },
    minsa.bookAppointment,
  ],
  [QueryKind.LIST_REFERENCES, { numeroDocumento: "12345678", tipoDocumento: "1" }, minsa.listReferences],
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the executor refuses to call MINSA with a missing required value", () => {
  it.each(CASES)("calls MINSA for %s when every value and the token are present", async (kind, payload, client) => {
    await runTurnUnlocked(FROM, event, undefined, startWith(kind, payload, BEARER));
    expect(client).toHaveBeenCalledTimes(1);
  });

  it.each(CASES)("fails the %s turn without calling MINSA when the token is missing", async (kind, payload, client) => {
    await expect(runTurnUnlocked(FROM, event, undefined, startWith(kind, payload))).rejects.toThrow(MissingSlotError);
    expect(client).not.toHaveBeenCalled();
  });

  it.each(CASES.flatMap(([kind, payload, client]) => Object.keys(payload).map((field) => [kind, field, payload, client] as const)))(
    "fails the %s turn without calling MINSA when %s is empty",
    async (kind, field, payload, client) => {
      const missing = { ...payload, [field]: "" };
      await expect(runTurnUnlocked(FROM, event, undefined, startWith(kind, missing, BEARER))).rejects.toThrow(
        expect.objectContaining({ field, queryKind: kind }),
      );
      expect(client).not.toHaveBeenCalled();
    },
  );

  it.each<[QueryKind, Record<string, unknown>, ReturnType<typeof vi.fn>]>([
    [QueryKind.VALIDATE_USER, { tipoDocumento: "1" }, minsa.validateUser],
    [QueryKind.VERIFY_CODE, { code: "123456" }, minsa.verifyCode],
    [QueryKind.VERIFY_CODE, { twofaId: "abc" }, minsa.verifyCode],
  ])("fails the %s turn without calling MINSA when a value is missing", async (kind, payload, client) => {
    await expect(runTurnUnlocked(FROM, event, undefined, startWith(kind, payload))).rejects.toThrow(MissingSlotError);
    expect(client).not.toHaveBeenCalled();
  });
});

describe("a booking retry waits before calling MINSA again", () => {
  it("waits only when the payload carries the retry attempt, and always before booking", async () => {
    const [, booking] = CASES.find(([kind]) => kind === QueryKind.BOOK_APPOINTMENT) ?? [];

    await runTurnUnlocked(FROM, event, undefined, startWith(QueryKind.BOOK_APPOINTMENT, { ...booking }, BEARER));
    expect(minsa.waitBeforeBookingRetry).not.toHaveBeenCalled();

    await runTurnUnlocked(FROM, event, undefined, startWith(QueryKind.BOOK_APPOINTMENT, { ...booking, retryAttempt: 2 }, BEARER));
    expect(minsa.waitBeforeBookingRetry).toHaveBeenCalledWith(2);
    expect(minsa.waitBeforeBookingRetry.mock.invocationCallOrder[0]).toBeLessThan(minsa.bookAppointment.mock.invocationCallOrder[1]);
  });
});

const CONSULTA = { codigo: "MINSA-2026-000001", establecimientoId: 7, anonima: false, dni: "12345678" };

describe("the executor refuses to guess the channel of a query", () => {
  it.each<[QueryKind, Record<string, unknown>, ReturnType<typeof vi.fn>]>([
    [QueryKind.CONSULTAR_INCIDENCIA, CONSULTA, minsa.consultarIncidencia],
    [QueryKind.CONSULTA_REINTENTOS_AGOTADOS, {}, minsa.saveIntentoConsulta],
    [QueryKind.REGISTRAR_ACEPTACION_TERMINOS, { version: "1" }, minsa.saveAceptacionTerminos],
    [QueryKind.CONSULTAR_INCIDENCIA, { ...CONSULTA, canal: "sms" }, minsa.consultarIncidencia],
  ])("fails the %s turn when the payload has no valid channel, never assuming whatsapp", async (kind, payload, client) => {
    await expect(runTurnUnlocked(FROM, event, undefined, startWith(kind, payload))).rejects.toThrow(
      expect.objectContaining({ field: "canal", queryKind: kind }),
    );
    expect(client).not.toHaveBeenCalled();
  });
});

describe("the consulta of a denuncia counts against the sender the server received, never one from the payload", () => {
  const WEB = { canal: SessionChannel.WEB, identificador: "otra-persona" };

  it("consults with the sender as the identifier", async () => {
    await runTurnUnlocked(FROM, event, undefined, startWith(QueryKind.CONSULTAR_INCIDENCIA, { ...CONSULTA, ...WEB }));

    expect(minsa.consultarIncidencia).toHaveBeenCalledWith(
      { codigo: CONSULTA.codigo, establecimientoId: 7, esAnonimo: false, dni: "12345678" },
      { identificador: FROM, canal: SessionChannel.WEB },
      expect.anything(),
    );
  });

  it("an anonymous consulta carries no DNI", async () => {
    await runTurnUnlocked(FROM, event, undefined, startWith(QueryKind.CONSULTAR_INCIDENCIA, { ...CONSULTA, anonima: true, ...WEB }));

    expect(minsa.consultarIncidencia).toHaveBeenCalledWith(
      { codigo: CONSULTA.codigo, establecimientoId: 7, esAnonimo: true },
      expect.anything(),
      expect.anything(),
    );
  });

  it("counts the day and records the exhausted retries for the sender", async () => {
    await runTurnUnlocked(FROM, event, undefined, startWith(QueryKind.CONSULTA_CUPO_DIARIO, { identificador: "otra-persona" }));
    await runTurnUnlocked(FROM, event, undefined, startWith(QueryKind.CONSULTA_REINTENTOS_AGOTADOS, WEB));

    expect(minsa.countIntentosDelDia).toHaveBeenCalledWith(FROM, expect.anything());
    expect(minsa.saveIntentoConsulta).toHaveBeenCalledWith(
      { identificador: FROM, canal: SessionChannel.WEB, resultado: ResultadoIntentoConsulta.REINTENTOS_AGOTADOS },
      expect.anything(),
    );
  });

  it.each([
    ["establecimientoId", { ...CONSULTA, establecimientoId: "siete" }],
    ["dni", { ...CONSULTA, dni: "" }],
    ["codigo", { ...CONSULTA, codigo: "" }],
  ])("fails without consulting when %s is missing", async (field, payload) => {
    await expect(
      runTurnUnlocked(FROM, event, undefined, startWith(QueryKind.CONSULTAR_INCIDENCIA, { ...payload, canal: SessionChannel.WEB })),
    ).rejects.toThrow(expect.objectContaining({ field, queryKind: QueryKind.CONSULTAR_INCIDENCIA }));
    expect(minsa.consultarIncidencia).not.toHaveBeenCalled();
  });
});
