import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import type {
  BookAppointmentParams,
  BookAppointmentResult,
  ListEspecialidadesResult,
  ListEstablecimientosResult,
  ListFechasResult,
  ListHorasResult,
  ListReferencesResult,
  ReferenciaItem,
  SearchUbigeoResult,
  ValidateUserResult,
  VerifyCodeResult,
} from "@/lib/integrations/minsa/types";
import type { ResolveDistritoAiDetailedResult } from "@/lib/fsm/parsing/ai/distrito";
import { AppointmentMode } from "@/lib/enums/appointment-mode";
import { BookingStatus } from "@/lib/enums/booking-status";
import { CatalogStatus } from "@/lib/enums/catalog-status";
import { CitaReferenciaButtonId } from "@/lib/enums/cita-referencia-button-id";
import { DistritoAiOutcome } from "@/lib/enums/distrito-ai-outcome";
import { HoraConfirmButtonId } from "@/lib/enums/hora-confirm-button-id";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { ReauthButtonId } from "@/lib/enums/reauth-button-id";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { SendType } from "@/lib/enums/send-type";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { ValidateUserStatus } from "@/lib/enums/validate-user-status";
import { VerifyCodeStatus } from "@/lib/enums/verify-code-status";
import { CITA_REFERENCIA_SIN_SELECCIONABLES_TEXT } from "@/lib/constants/textos/cita-referencia";

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  validateUser: vi.fn<(...args: unknown[]) => Promise<ValidateUserResult>>(),
  verifyCode: vi.fn<(twofaId: string, code: string) => Promise<VerifyCodeResult>>(),
  listReferences: vi.fn<(documento: string, tipo: string, bearer: string) => Promise<ListReferencesResult>>(),
  searchUbigeo: vi.fn<(...args: string[]) => Promise<SearchUbigeoResult>>(),
  listEspecialidades: vi.fn<(...args: string[]) => Promise<ListEspecialidadesResult>>(),
  listEstablecimientos: vi.fn<(...args: unknown[]) => Promise<ListEstablecimientosResult>>(),
  listFechas: vi.fn<(...args: string[]) => Promise<ListFechasResult>>(),
  listHoras: vi.fn<(...args: string[]) => Promise<ListHorasResult>>(),
  bookAppointment: vi.fn<(params: BookAppointmentParams, bearer: string) => Promise<BookAppointmentResult>>(),
  resolveDistrito: vi.fn<(...args: unknown[]) => Promise<ResolveDistritoAiDetailedResult>>(),
  selectionHints: vi.fn(),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) => {
    const persisted = structuredClone(mocks.sessions.get(from));
    if (persisted) delete persisted.channel;
    return persisted;
  },
  saveSession: async (from: string, session: Session) => {
    mocks.sessions.set(from, structuredClone(session));
  },
  sessionRowExists: async (from: string) => mocks.sessions.has(from),
  resetSession: async (from: string) => {
    mocks.sessions.delete(from);
  },
  closeSession: async (from: string) => {
    mocks.sessions.delete(from);
  },
  resetAllSandboxTestSessions: async () => mocks.sessions.clear(),
}));
vi.mock("@/lib/integrations/minsa/identity", () => ({ verifyCode: mocks.verifyCode, validateUser: mocks.validateUser }));
vi.mock("@/lib/integrations/minsa/references", () => ({ listReferences: mocks.listReferences }));
vi.mock("@/lib/integrations/minsa/catalog", () => ({
  searchUbigeo: mocks.searchUbigeo,
  listEspecialidades: mocks.listEspecialidades,
  listEstablecimientos: mocks.listEstablecimientos,
  listFechas: mocks.listFechas,
  listHoras: mocks.listHoras,
}));
vi.mock("@/lib/integrations/minsa/booking", () => ({ bookAppointment: mocks.bookAppointment }));
vi.mock("@/lib/fsm/parsing/ai/distrito", () => ({ resolveDistritoAiDetailed: mocks.resolveDistrito }));
vi.mock("@/lib/fsm/parsing/ai/selection-hints", () => ({ extractSelectionHints: mocks.selectionHints }));

import { POST } from "@/app/api/sandbox/route";
import { runTurn } from "@/lib/fsm/core/executor";

const FROM = "sandbox-appointment-mode";
const DOCUMENTO = "23456789";
const TOKEN = "synthetic-appointment-token";
const REFRESHED_TOKEN = "synthetic-refreshed-appointment-token";
const FECHA = "01/01/2099";
const FECHA_API = "20990101";
const HORA = "09:00|09:30";

const REFERENCIAS: ReferenciaItem[] = [3, 5, 5].map((estado, index) => ({
  idReferencia: `ref-${index + 1}`,
  numero: `000${index + 1}`,
  fechaInicio: "01/10/2026 10:00",
  ipressOrigen: "CENTRO DE ORIGEN",
  ipressDestino: `HOSPITAL ${index + 1}`,
  upsOrigen: "MEDICINA GENERAL",
  upsDestino: ["CARDIOLOGIA", "TRAUMATOLOGIA", "NEUROLOGIA"][index],
  codigoIpressDestino: `eess-${index + 1}`,
  codigoUpsDestino: `ups-${index + 1}`,
  estado,
}));

type Reply = { sent: SendEffect[]; session: { state: string }; interactiveId?: string };

async function send(event: Omit<InboundEvent, "from" | "channel">): Promise<Reply> {
  const response = await POST(
    new NextRequest("http://localhost/api/sandbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, ...event }),
    }),
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<Reply>;
}

function tap(reply: Reply, id: string): Promise<Reply> {
  expect(reply.interactiveId).toEqual(expect.any(String));
  return send({ type: InboundEventType.BUTTON, listId: id, replyTo: reply.interactiveId });
}

function texts(reply: Reply): string {
  return reply.sent
    .filter((effect) => effect.kind === SendType.TEXT || effect.kind === SendType.BUTTONS)
    .map((effect) => effect.text)
    .join("\n");
}

function otpSession(channel = SessionChannel.WEB): Session {
  return {
    state: SessionState.CITA_AWAITING_OTP,
    channel,
    slots: {
      [SlotKey.CITA_DNI_PENDING]: DOCUMENTO,
      [SlotKey.CITA_TWOFA_ID]: "synthetic-twofa",
      [SlotKey.MENU_CHOICE]: MenuChoice.AGENDAR_CITA,
    },
    counters: {},
  };
}

async function verify(): Promise<Reply> {
  return send({ type: InboundEventType.TEXT, text: "123456" });
}

function expectNoCatalogSearch(): void {
  for (const query of [mocks.searchUbigeo, mocks.listEspecialidades, mocks.listEstablecimientos, mocks.listFechas, mocks.listHoras]) {
    expect(query).not.toHaveBeenCalled();
  }
  expect(mocks.resolveDistrito).not.toHaveBeenCalled();
  expect(mocks.selectionHints).not.toHaveBeenCalled();
  expect(mocks.bookAppointment).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SANDBOX_ENABLED = "true";
  process.env.SANDBOX_USE_REAL_MINSA = "false";
  process.env.SANDBOX_USE_REAL_AI = "false";
  process.env.SANDBOX_USE_REAL_RENIEC = "false";
  process.env.DATABASE_URL = "";
  process.env.DATABASE_ENABLED = "false";
  mocks.sessions.clear();
  mocks.sessions.set(FROM, otpSession());
  mocks.validateUser.mockResolvedValue({ status: ValidateUserStatus.VALID, twofaId: "synthetic-twofa" });
  mocks.verifyCode.mockResolvedValue({ status: VerifyCodeStatus.VERIFIED, token: TOKEN });
  mocks.listReferences.mockResolvedValue({ statusReference: ReferenceStatus.FOUND, message: "", data: REFERENCIAS });
  mocks.searchUbigeo.mockResolvedValue({
    status: CatalogStatus.FOUND,
    items: [{ ubigeoInei: "150118", departamento: "Lima", provincia: "Lima", distrito: "Lurigancho" }],
  });
  mocks.listEspecialidades.mockResolvedValue({
    status: CatalogStatus.FOUND,
    items: [{ codigoEspecialidad: "ups-nueva", nombreEspecialidad: "MEDICINA GENERAL", cantidadCupos: 2 }],
  });
  mocks.listEstablecimientos.mockResolvedValue({
    status: CatalogStatus.FOUND,
    items: [{ renipressCode: "eess-nueva", establishmentName: "CENTRO NUEVA CITA", quotasOnline: 2 }],
  });
  mocks.listFechas.mockResolvedValue({
    status: CatalogStatus.FOUND,
    items: [
      { fechaCupo: FECHA, cantidadCupos: 2 },
      { fechaCupo: "02/01/2099", cantidadCupos: 2 },
    ],
  });
  mocks.listHoras.mockResolvedValue({
    status: CatalogStatus.FOUND,
    items: [
      { horaInicio: "09:00", horaFin: "09:30", cantidadCupos: 1 },
      { horaInicio: "10:00", horaFin: "10:30", cantidadCupos: 1 },
    ],
  });
  mocks.bookAppointment.mockResolvedValue({
    status: BookingStatus.BOOKED,
    url: "https://fake-minsa-digital.test/constancia",
    message: "Reserva de prueba",
  });
  mocks.resolveDistrito.mockResolvedValue({
    outcome: DistritoAiOutcome.FOUND,
    candidates: [{ departamento: "Lima", provincia: "Lima", distrito: "Lurigancho" }],
  });
});

describe("POST /api/sandbox: elegir nueva cita o cita con referencia", () => {
  it("consulta las referencias despues del OTP y espera la eleccion antes de procesar pistas de ubicacion", async () => {
    const session = otpSession();
    session.slots[SlotKey.CITA_DISTRITO_HINT_TEXT] = "Lurigancho";
    mocks.sessions.set(FROM, session);

    const reply = await verify();

    expect(mocks.verifyCode).toHaveBeenCalledWith("synthetic-twofa", "123456");
    expect(mocks.listReferences).toHaveBeenCalledExactlyOnceWith(DOCUMENTO, "01", TOKEN);
    expect(reply.session.state).toBe(SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE);
    const buttons = reply.sent.find((effect) => effect.kind === SendType.BUTTONS);
    expect(buttons?.kind === SendType.BUTTONS && buttons.buttons.map((button) => button.id)).toEqual([
      CitaReferenciaButtonId.NEW,
      CitaReferenciaButtonId.REFERENCE,
    ]);
    expect(texts(reply)).not.toContain("distrito");
    expectNoCatalogSearch();
  });

  it("permite elegir entre especialidades y reserva el destino de la referencia solo despues de confirmar, sin duplicar por botones antiguos", async () => {
    const mode = await verify();
    const references = await tap(mode, CitaReferenciaButtonId.REFERENCE);
    const list = references.sent.find((effect) => effect.kind === SendType.INTERACTIVE_LIST);
    expect(list?.kind === SendType.INTERACTIVE_LIST && list.rows.map((row) => row.id)).toEqual(
      REFERENCIAS.map((item) => item.idReferencia),
    );
    expect(list?.kind === SendType.INTERACTIVE_LIST && list.rows.map((row) => row.title)).toEqual(
      REFERENCIAS.map((item) => item.upsDestino),
    );

    const selected = REFERENCIAS[2];
    const fechas = await tap(references, selected.idReferencia);
    expect(fechas.session.state).toBe(SessionState.CITA_AWAITING_FECHA_SELECT);
    expect(mocks.listFechas).toHaveBeenCalledExactlyOnceWith(selected.codigoIpressDestino, selected.codigoUpsDestino, TOKEN);
    expect(mocks.searchUbigeo).not.toHaveBeenCalled();
    expect(mocks.listEspecialidades).not.toHaveBeenCalled();
    expect(mocks.listEstablecimientos).not.toHaveBeenCalled();

    const horas = await tap(fechas, FECHA);
    expect(mocks.listHoras).toHaveBeenCalledExactlyOnceWith(selected.codigoIpressDestino, selected.codigoUpsDestino, FECHA_API, TOKEN);
    const confirm = await tap(horas, HORA);
    expect(confirm.session.state).toBe(SessionState.CITA_AWAITING_HORA_CONFIRM);
    expect(texts(confirm)).toContain(selected.ipressDestino);
    expect(texts(confirm)).toContain(selected.upsDestino);
    expect(mocks.bookAppointment).not.toHaveBeenCalled();

    const stale = await tap(horas, HORA);
    expect(stale.sent).toEqual([]);
    const booked = await tap(confirm, HoraConfirmButtonId.YES);
    expect(booked.session.state).toBe(SessionState.CITA_BOOKED);
    expect(mocks.bookAppointment).toHaveBeenCalledExactlyOnceWith(
      {
        codigoRenipress: selected.codigoIpressDestino,
        codigoUps: selected.codigoUpsDestino,
        fechaCita: FECHA_API,
        horaCita: "900",
        numeroDocumentoPaciente: DOCUMENTO,
        referenciaId: selected.idReferencia,
      },
      TOKEN,
    );
    const double = await tap(confirm, HoraConfirmButtonId.YES);
    expect(double.sent).toEqual([]);
    expect(mocks.bookAppointment).toHaveBeenCalledTimes(1);
  });

  it("Nueva cita recorre el catalogo normal y reserva sin reutilizar referencia ni destino previos", async () => {
    const session = otpSession();
    session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID] = REFERENCIAS[0].idReferencia;
    session.slots[SlotKey.CITA_COD_EESS] = REFERENCIAS[0].codigoIpressDestino;
    session.slots[SlotKey.CITA_ESPECIALIDAD_ID] = REFERENCIAS[0].codigoUpsDestino;
    mocks.sessions.set(FROM, session);

    const mode = await verify();
    const nueva = await tap(mode, CitaReferenciaButtonId.NEW);
    expect(nueva.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_APPOINTMENT_MODE]).toBe(AppointmentMode.NEW);
    expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();

    const especialidades = await send({ type: InboundEventType.TEXT, text: "Lurigancho" });
    const establecimientos = await tap(especialidades, "ups-nueva");
    const fechas =
      establecimientos.session.state === SessionState.CITA_AWAITING_FECHA_SELECT
        ? establecimientos
        : await tap(establecimientos, "eess-nueva");
    const horas = await tap(fechas, FECHA);
    const confirm = await send({ type: InboundEventType.TEXT, text: "09:00" });
    expect(confirm.session.state).toBe(SessionState.CITA_AWAITING_HORA_CONFIRM);
    expect(mocks.bookAppointment).not.toHaveBeenCalled();
    expect(horas.session.state).toBe(SessionState.CITA_AWAITING_HORA_SELECT);
    await tap(confirm, HoraConfirmButtonId.YES);

    expect(mocks.bookAppointment).toHaveBeenCalledTimes(1);
    expect(mocks.bookAppointment.mock.calls[0][0]).toMatchObject({ codigoRenipress: "eess-nueva", codigoUps: "ups-nueva" });
    expect(mocks.bookAppointment.mock.calls[0][0]).not.toHaveProperty("referenciaId");
    expect(mocks.listReferences).toHaveBeenCalledTimes(1);
  });

  it("una reserva duplicada conserva el proposito de referencia despues de expirar el acceso y verificar otro OTP", async () => {
    mocks.bookAppointment.mockResolvedValueOnce({ status: BookingStatus.DUPLICATE, message: "Cita activa de prueba" });
    let reply = await verify();
    for (const id of [CitaReferenciaButtonId.REFERENCE, REFERENCIAS[0].idReferencia, FECHA, HORA, HoraConfirmButtonId.YES]) {
      reply = await tap(reply, id);
    }
    expect(reply.session.state).toBe(SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE);
    const persisted = mocks.sessions.get(FROM);
    expect(persisted).toBeDefined();
    if (!persisted) return;
    expect(persisted.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.CITA_REFERENCIAS);
    persisted.slots[SlotKey.CITA_BEARER] = `synthetic.${Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url")}.signature`;

    const expired = await tap(reply, CitaReferenciaButtonId.REFERENCE);
    expect(expired.session.state).toBe(SessionState.CITA_AWAITING_REAUTH);
    const otp = await tap(expired, ReauthButtonId.YES);
    expect(otp.session.state).toBe(SessionState.CITA_AWAITING_OTP);
    mocks.verifyCode.mockResolvedValueOnce({ status: VerifyCodeStatus.VERIFIED, token: REFRESHED_TOKEN });
    const restored = await verify();

    expect(restored.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(mocks.listReferences).toHaveBeenCalledTimes(2);
    expect(mocks.listReferences).toHaveBeenNthCalledWith(1, DOCUMENTO, "01", TOKEN);
    expect(mocks.listReferences).toHaveBeenNthCalledWith(2, DOCUMENTO, "01", REFRESHED_TOKEN);
    expect(mocks.verifyCode).toHaveBeenCalledTimes(2);
    expect(mocks.searchUbigeo).not.toHaveBeenCalled();
    expect(mocks.listEspecialidades).not.toHaveBeenCalled();
    expect(mocks.listEstablecimientos).not.toHaveBeenCalled();
    const otherReference = await tap(restored, REFERENCIAS[1].idReferencia);
    expect(otherReference.session.state).toBe(SessionState.CITA_AWAITING_FECHA_SELECT);
    expect(mocks.listFechas).toHaveBeenLastCalledWith(REFERENCIAS[1].codigoIpressDestino, REFERENCIAS[1].codigoUpsDestino, REFRESHED_TOKEN);
    expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe(REFERENCIAS[1].idReferencia);
    expect(mocks.bookAppointment).toHaveBeenCalledTimes(1);
  });

  it("si ninguna referencia permite agendar continua con una nueva cita sin preguntar la modalidad", async () => {
    mocks.listReferences.mockResolvedValue({
      statusReference: ReferenceStatus.FOUND,
      message: "",
      data: REFERENCIAS.map((item, index) => ({ ...item, estado: [1, 2, 9][index], estadoDescripcion: "OBSERVADO" })),
    });
    const reply = await verify();

    expect(reply.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(reply.sent.some((effect) => effect.kind === SendType.BUTTONS)).toBe(false);
    expect(texts(reply)).toContain(CITA_REFERENCIA_SIN_SELECCIONABLES_TEXT);
    expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_APPOINTMENT_MODE]).toBe(AppointmentMode.NEW);
    expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_BEARER]).toBe(TOKEN);
    expectNoCatalogSearch();
  });

  it("con solo referencias PACIENTE CITADO (7) continua con una nueva cita sin preguntar la modalidad", async () => {
    mocks.listReferences.mockResolvedValue({
      statusReference: ReferenceStatus.FOUND,
      message: "",
      data: REFERENCIAS.map((item) => ({ ...item, estado: 7 })),
    });
    const reply = await verify();

    expect(reply.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(reply.sent.some((effect) => effect.kind === SendType.BUTTONS)).toBe(false);
    expect(texts(reply)).toContain(CITA_REFERENCIA_SIN_SELECCIONABLES_TEXT);
    expectNoCatalogSearch();
  });

  it("con una sola referencia que permite agendar entre bloqueadas sigue preguntando la modalidad", async () => {
    mocks.listReferences.mockResolvedValue({
      statusReference: ReferenceStatus.FOUND,
      message: "",
      data: [{ ...REFERENCIAS[0], estado: 1 }, REFERENCIAS[1]],
    });
    const reply = await verify();

    expect(reply.session.state).toBe(SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE);
  });

  it("una consulta exitosa sin referencias continua directamente con una nueva cita", async () => {
    mocks.listReferences.mockResolvedValue({ statusReference: ReferenceStatus.EMPTY, message: "", data: [] });
    const reply = await verify();

    expect(reply.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(reply.sent.some((effect) => effect.kind === SendType.BUTTONS)).toBe(false);
    expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_BEARER]).toBe(TOKEN);
    expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_DNI]).toBe(DOCUMENTO);
    expectNoCatalogSearch();
  });

  it("una referencia incompleta no cambia silenciosamente a una cita nueva", async () => {
    const incomplete = { ...REFERENCIAS[0], codigoIpressDestino: "", codigoUpsDestino: "" };
    mocks.listReferences.mockResolvedValue({ statusReference: ReferenceStatus.FOUND, message: "", data: [incomplete] });
    const mode = await verify();
    const references = await tap(mode, CitaReferenciaButtonId.REFERENCE);
    const unavailable = await tap(references, incomplete.idReferencia);

    expect(unavailable.session.state).toBe(SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE);
    expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
    expectNoCatalogSearch();
  });

  it("un error no significa ausencia de referencias y permite reintentar antes de decidir", async () => {
    mocks.listReferences.mockResolvedValueOnce({ statusReference: ReferenceStatus.ERROR, message: "", data: [] });
    const failed = await verify();

    expect(failed.session.state).toBe(SessionState.REFERENCIA_AWAITING_LOOKUP_RETRY);
    expect(texts(failed)).not.toContain("No cuentas con referencias");
    expectNoCatalogSearch();
    const retried = await tap(failed, CitaReferenciaButtonId.RETRY);
    expect(retried.session.state).toBe(SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE);
    expect(mocks.listReferences).toHaveBeenCalledTimes(2);
    expect(mocks.listReferences).toHaveBeenNthCalledWith(1, DOCUMENTO, "01", TOKEN);
    expect(mocks.listReferences).toHaveBeenNthCalledWith(2, DOCUMENTO, "01", TOKEN);
    expect(mocks.verifyCode).toHaveBeenCalledTimes(1);
    expectNoCatalogSearch();
  });

  it("permite continuar voluntariamente con una nueva cita si falla la consulta de referencias", async () => {
    mocks.listReferences.mockResolvedValue({ statusReference: ReferenceStatus.ERROR, message: "", data: [] });
    const failed = await verify();
    const nueva = await tap(failed, CitaReferenciaButtonId.NEW);

    expect(nueva.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(mocks.listReferences).toHaveBeenCalledTimes(1);
    expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
    expectNoCatalogSearch();
  });

  it("un boton antiguo no cambia la modalidad ni consulta disponibilidad", async () => {
    const mode = await verify();
    const stale = await send({ type: InboundEventType.BUTTON, listId: CitaReferenciaButtonId.REFERENCE, replyTo: "mensaje-anterior" });

    expect(stale.sent).toEqual([]);
    expect(stale.session.state).toBe(SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE);
    expect(mocks.sessions.get(FROM)?.slots[SlotKey.CITA_APPOINTMENT_MODE]).toBeUndefined();
    expectNoCatalogSearch();
    const current = await tap(mode, CitaReferenciaButtonId.REFERENCE);
    expect(current.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
  });

  it("WhatsApp sin referencias que permitan agendar continua con una nueva cita como el chat web", async () => {
    mocks.listReferences.mockResolvedValue({
      statusReference: ReferenceStatus.FOUND,
      message: "",
      data: REFERENCIAS.map((item) => ({ ...item, estado: 4, estadoDescripcion: "ANULADO" })),
    });
    mocks.sessions.set(FROM, otpSession(SessionChannel.WHATSAPP));
    const result = await runTurn(FROM, { from: FROM, type: InboundEventType.TEXT, text: "123456", channel: SessionChannel.WHATSAPP });

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(result.session.slots[SlotKey.CITA_APPOINTMENT_MODE]).toBe(AppointmentMode.NEW);
    expectNoCatalogSearch();
  });

  it("WhatsApp consulta referencias despues del OTP y ofrece las mismas modalidades que el chat web", async () => {
    mocks.sessions.set(FROM, otpSession(SessionChannel.WHATSAPP));
    const result = await runTurn(FROM, { from: FROM, type: InboundEventType.TEXT, text: "123456", channel: SessionChannel.WHATSAPP });

    expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE);
    expect(mocks.verifyCode).toHaveBeenCalledTimes(1);
    expect(mocks.listReferences).toHaveBeenCalledExactlyOnceWith(DOCUMENTO, "01", TOKEN);
    expectNoCatalogSearch();
  });
});
