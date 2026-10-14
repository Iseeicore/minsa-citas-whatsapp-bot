import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { QueryKind } from "@/lib/enums/query-kind";

const store = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  registrar: vi.fn<(submission: unknown) => Promise<unknown>>(),
  consultar: vi.fn<(codigo: string) => Promise<unknown>>(),
  tieneConsentimiento: vi.fn<(from: string) => Promise<boolean>>(),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) => structuredClone(store.sessions.get(from) ?? { state: "main_menu", slots: {}, counters: {} }),
  saveSession: async (from: string, session: Session) => {
    store.sessions.set(from, structuredClone({ ...session, updatedAt: undefined }));
  },
}));
vi.mock("@/lib/recepcion/servicio", () => ({ registrarIncidencia: store.registrar }));
vi.mock("@/lib/recepcion/consulta", () => ({ consultarIncidencia: store.consultar, listarIncidencias: vi.fn() }));
vi.mock("@/lib/recepcion/repositorio", () => ({
  tieneConsentimientoAceptado: store.tieneConsentimiento,
  marcarConsentimientoAceptado: vi.fn(),
}));

import { runTurnUnlocked } from "@/lib/fsm/core/executor";

const FROM = "51999000222";
const event = { from: FROM, type: "text" as const, text: "hola" };

const startWith = (kind: QueryKind, payload: Record<string, unknown> = {}): HandlerResult => ({
  session: { state: "main_menu", slots: {}, counters: {} },
  effects: [{ kind, payload }],
  outcome: "continue",
});

const INCIDENT_ONLY = [
  QueryKind.INCIDENCIA_REGISTER,
  QueryKind.CONSULTAR_INCIDENCIA,
  QueryKind.LISTAR_INCIDENCIAS,
  QueryKind.VERIFICAR_CONSENTIMIENTO,
  QueryKind.REGISTRAR_CONSENTIMIENTO,
  QueryKind.BUSCAR_ESTABLECIMIENTO,
  QueryKind.ANALYZE_INCIDENCIA_FOTO_INTENT,
];

beforeEach(() => {
  store.sessions.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the executor, as the last defense", () => {
  it.each(INCIDENT_ONLY)("rejects the %s query when the incidencias are off, before touching anything", async (kind) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    await expect(runTurnUnlocked(FROM, event, undefined, startWith(kind))).rejects.toThrow(/disabled/i);

    expect(store.registrar).not.toHaveBeenCalled();
    expect(store.consultar).not.toHaveBeenCalled();
    expect(store.tieneConsentimiento).not.toHaveBeenCalled();
  });

  it("still resolves the incident queries when they are on", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");
    store.tieneConsentimiento.mockResolvedValue(true);

    await runTurnUnlocked(FROM, event, undefined, startWith(QueryKind.VERIFICAR_CONSENTIMIENTO));

    expect(store.tieneConsentimiento).toHaveBeenCalledWith(FROM);
  });

  it("does not block a query the cita shares with the rest (the document lookup runs)", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    await expect(
      runTurnUnlocked(FROM, event, undefined, startWith(QueryKind.ANALYZE_MAIN_MENU_INTENT, { text: "quiero una cita" })),
    ).resolves.toBeDefined();
  });
});
