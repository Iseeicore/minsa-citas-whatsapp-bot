import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { DisabledServiceQueryError } from "@/lib/errors/disabled-service-query-error";
import { QueryKind } from "@/lib/enums/query-kind";
import { IncidenciaService } from "@/lib/services/incidencia-service";

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
vi.mock("@/lib/recepcion/consulta", () => ({ consultarIncidencia: store.consultar }));
vi.mock("@/lib/composition/stores", () => import("@/tests/support/memory-stores"));
vi.mock("@/lib/recepcion/repositorio", () => ({
  tieneConsentimientoAceptado: store.tieneConsentimiento,
  marcarConsentimientoAceptado: vi.fn(),
}));

import { runTurnUnlocked } from "@/lib/fsm/core/executor";

const FROM = "51999000222";
const event = { from: FROM, type: "text" as const, text: "hola", channel: "whatsapp" as const };

const startWith = (kind: QueryKind, payload: Record<string, unknown> = {}): HandlerResult => ({
  session: { state: "main_menu", slots: {}, counters: {} },
  effects: [{ kind, payload }],
  outcome: "continue",
});

const INCIDENT_ONLY = [
  QueryKind.INCIDENCIA_REGISTER,
  QueryKind.CONSULTAR_INCIDENCIA,
  QueryKind.CONSULTA_CUPO_DIARIO,
  QueryKind.CONSULTA_REINTENTOS_AGOTADOS,
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

    await expect(runTurnUnlocked(FROM, event, undefined, startWith(kind))).rejects.toThrow(DisabledServiceQueryError);

    expect(store.registrar).not.toHaveBeenCalled();
    expect(store.consultar).not.toHaveBeenCalled();
    expect(store.tieneConsentimiento).not.toHaveBeenCalled();
  });

  it("rejects them too when the variable is not defined", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", undefined);

    await expect(runTurnUnlocked(FROM, event, undefined, startWith(QueryKind.INCIDENCIA_REGISTER))).rejects.toThrow(
      'resolveQuery: query "incidencia_register" belongs to the disabled service "registrar_incidencia"',
    );

    expect(store.registrar).not.toHaveBeenCalled();
  });

  it("still resolves the incident queries when they are on", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");
    store.tieneConsentimiento.mockResolvedValue(true);

    await runTurnUnlocked(FROM, event, undefined, startWith(QueryKind.VERIFICAR_CONSENTIMIENTO));

    expect(store.tieneConsentimiento).toHaveBeenCalledWith(FROM, expect.anything());
  });

  it("does not block a query the cita shares with the rest (the document lookup runs)", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    await expect(
      runTurnUnlocked(FROM, event, undefined, startWith(QueryKind.ANALYZE_MAIN_MENU_INTENT, { text: "quiero una cita" })),
    ).resolves.toBeDefined();
  });
});

describe("a stored incident session while the incidencias are off", () => {
  const NOTICE = new IncidenciaService().disabledReply();

  it.each(["consulta_awaiting_codigo", "consulta_query_pending", "incidencia_awaiting_descripcion", "incidencia_awaiting_foto"])(
    "%s comes back as the main menu with the notice, and the new state is what gets stored",
    async (state) => {
      vi.stubEnv("INCIDENCIAS_ENABLED", "false");
      store.sessions.set(FROM, { state: state as Session["state"], slots: {}, counters: {} });

      const turn = await runTurnUnlocked(FROM, event);

      expect(turn.session.state).toBe("main_menu");
      expect(turn.sent[0]).toEqual({ kind: "send_text", text: NOTICE });
      expect(turn.sent).toHaveLength(2);
      expect(store.sessions.get(FROM)?.state).toBe("main_menu");
      expect(store.registrar).not.toHaveBeenCalled();
      expect(store.consultar).not.toHaveBeenCalled();
    },
  );
});
