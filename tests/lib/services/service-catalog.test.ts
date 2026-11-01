import { afterEach, describe, expect, it, vi } from "vitest";
import { BotService } from "@/lib/services/bot-service";
import { CitaService } from "@/lib/services/cita-service";
import { ConsultaService } from "@/lib/services/consulta-service";
import { IncidenciaService } from "@/lib/services/incidencia-service";
import { ReferenciaService } from "@/lib/services/referencia-service";
import { ServiceCatalog, serviceCatalog } from "@/lib/services/service-catalog";
import { UnknownServiceError } from "@/lib/errors/unknown-service-error";
import { SERVICE_DISABLED_TEXT } from "@/lib/constants/textos/menu";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SlotKey } from "@/lib/enums/slot-key";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import type { Session } from "@/lib/fsm/core/types";

afterEach(() => {
  vi.unstubAllEnvs();
});

const ROW_CITA = { id: MenuChoice.AGENDAR_CITA, title: "Agendar una cita médica" };
const ROW_INCIDENCIA = { id: MenuChoice.REGISTRAR_INCIDENCIA, title: "Denuncia anticorrupción" };
const ROW_CONSULTA = { id: MenuChoice.CONSULTAR_INCIDENCIA, title: "Consultar mi denuncia" };
const ROW_REFERENCIA = { id: MenuChoice.CONSULTAR_REFERENCIA, title: "Cita con referencia" };
const CHANNELS = [SessionChannel.WHATSAPP, SessionChannel.WEB];

describe("the services", () => {
  it("are all BotServices with their own menu row", () => {
    expect(new CitaService()).toBeInstanceOf(BotService);
    expect(new ReferenciaService()).toBeInstanceOf(BotService);
    expect(new IncidenciaService()).toBeInstanceOf(BotService);
    expect(new ConsultaService()).toBeInstanceOf(BotService);
    expect(new CitaService().menuRow).toEqual(ROW_CITA);
    expect(new ReferenciaService().menuRow).toEqual(ROW_REFERENCIA);
    expect(new IncidenciaService().menuRow).toEqual(ROW_INCIDENCIA);
    expect(new ConsultaService().menuRow).toEqual(ROW_CONSULTA);
  });

  it("the cita and the referencia are enabled whatever the flag says", () => {
    for (const value of ["true", "false", undefined]) {
      vi.stubEnv("INCIDENCIAS_ENABLED", value);
      expect(new CitaService().isEnabled()).toBe(true);
      expect(new ReferenciaService().isEnabled()).toBe(true);
    }
  });

  it("every service shows its row in both channels, the referencia included", () => {
    for (const service of [new CitaService(), new ReferenciaService(), new IncidenciaService(), new ConsultaService()]) {
      expect(service.menuChannels).toEqual(CHANNELS);
    }
  });

  it("the incidencia and the consulta follow INCIDENCIAS_ENABLED", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");
    expect([new IncidenciaService().isEnabled(), new ConsultaService().isEnabled()]).toEqual([true, true]);

    vi.stubEnv("INCIDENCIAS_ENABLED", "false");
    expect([new IncidenciaService().isEnabled(), new ConsultaService().isEnabled()]).toEqual([false, false]);
  });

  it("the incidencia and the consulta are off when the variable is not defined", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", undefined);

    expect([new IncidenciaService().isEnabled(), new ConsultaService().isEnabled()]).toEqual([false, false]);
  });

  it("each one recognizes only the states of its own flow", () => {
    expect(new CitaService().matchesState(SessionState.CITA_AWAITING_DNI)).toBe(true);
    expect(new CitaService().matchesState(SessionState.INCIDENCIA_AWAITING_DNI)).toBe(false);
    expect(new CitaService().matchesState(SessionState.REFERENCIA_LOOKUP_PENDING)).toBe(false);
    expect(new ReferenciaService().matchesState(SessionState.REFERENCIA_LOOKUP_PENDING)).toBe(true);
    expect(new ReferenciaService().matchesState(SessionState.REFERENCIA_AWAITING_CITA_OFFER)).toBe(true);
    expect(new ReferenciaService().matchesState(SessionState.REFERENCIA_CLOSED)).toBe(true);
    expect(new ReferenciaService().matchesState(SessionState.CITA_AWAITING_DNI)).toBe(false);
    expect(new IncidenciaService().matchesState(SessionState.INCIDENCIA_AWAITING_REAUTH)).toBe(true);
    expect(new IncidenciaService().matchesState(SessionState.CONSULTA_AWAITING_CODIGO)).toBe(false);
    expect(new ConsultaService().matchesState(SessionState.CONSULTA_QUERY_PENDING)).toBe(true);
    expect(new ConsultaService().matchesState(SessionState.MAIN_MENU)).toBe(false);
  });

  it("the disabled reply says that only the citas and the referencias remain, the same in both channels", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");
    for (const service of [new IncidenciaService(), new ConsultaService()]) {
      expect(service.disabledReply()).toBe(SERVICE_DISABLED_TEXT);
    }
    expect(SERVICE_DISABLED_TEXT).toBe("Por ahora solo puedo ayudarte a agendar una cita médica o una cita con referencia.");
  });
});

describe("the ServiceCatalog", () => {
  it.each(CHANNELS)("lists the four rows in the %s channel, in the usual order, when the incidencias are on", (channel) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");

    expect(serviceCatalog.menuRows(channel)).toEqual([ROW_CITA, ROW_REFERENCIA, ROW_INCIDENCIA, ROW_CONSULTA]);
  });

  it.each(CHANNELS)("lists the cita and the referencia in the %s channel when the incidencias are off or undefined", (channel) => {
    for (const value of ["false", undefined]) {
      vi.stubEnv("INCIDENCIAS_ENABLED", value);

      expect(serviceCatalog.menuRows(channel)).toEqual([ROW_CITA, ROW_REFERENCIA]);
    }
  });

  it("decides per call, not when it is imported", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");
    expect(serviceCatalog.menuRows(SessionChannel.WEB)).toHaveLength(2);

    vi.stubEnv("INCIDENCIAS_ENABLED", "true");
    expect(serviceCatalog.menuRows(SessionChannel.WEB)).toHaveLength(4);
  });

  it("finds a service by its menu id, even a disabled one", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    expect(serviceCatalog.byId(MenuChoice.REGISTRAR_INCIDENCIA)).toBeInstanceOf(IncidenciaService);
    expect(serviceCatalog.isEnabled(MenuChoice.REGISTRAR_INCIDENCIA)).toBe(false);
    expect(serviceCatalog.isEnabled(MenuChoice.AGENDAR_CITA)).toBe(true);
  });

  it("throws an UnknownServiceError for an id nobody registered", () => {
    expect(() => new ServiceCatalog([new CitaService()]).byId(MenuChoice.REGISTRAR_INCIDENCIA)).toThrow(UnknownServiceError);
  });

  it("finds the disabled owner of a session, and nothing for the menu states or while every service is on", () => {
    const at = (state: Session["state"]): Session => ({ state, slots: {}, counters: {} });
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");
    vi.stubEnv("REFERENCIAS_ENABLED", "false");
    expect(serviceCatalog.disabledOwnerOf(at(SessionState.CONSULTA_AWAITING_DNI))).toBeInstanceOf(ConsultaService);
    expect(serviceCatalog.disabledOwnerOf(at(SessionState.INCIDENCIA_CONFIRM_REGISTRO))).toBeInstanceOf(IncidenciaService);
    expect(serviceCatalog.disabledOwnerOf(at(SessionState.CITA_AWAITING_DNI))).toBeUndefined();
    expect(serviceCatalog.disabledOwnerOf(at(SessionState.MAIN_MENU))).toBeUndefined();

    vi.stubEnv("INCIDENCIAS_ENABLED", "true");
    vi.stubEnv("REFERENCIAS_ENABLED", "true");
    expect(serviceCatalog.disabledOwnerOf(at(SessionState.CONSULTA_AWAITING_DNI))).toBeUndefined();
  });

  it("finds the owner of the incident-only queries, and nothing for the shared ones", () => {
    expect(serviceCatalog.forQuery(QueryKind.INCIDENCIA_REGISTER)).toBeInstanceOf(IncidenciaService);
    expect(serviceCatalog.forQuery(QueryKind.VERIFICAR_CONSENTIMIENTO)).toBeInstanceOf(IncidenciaService);
    expect(serviceCatalog.forQuery(QueryKind.REGISTRAR_CONSENTIMIENTO)).toBeInstanceOf(IncidenciaService);
    expect(serviceCatalog.forQuery(QueryKind.BUSCAR_ESTABLECIMIENTO)).toBeInstanceOf(IncidenciaService);
    expect(serviceCatalog.forQuery(QueryKind.ANALYZE_INCIDENCIA_FOTO_INTENT)).toBeInstanceOf(IncidenciaService);
    expect(serviceCatalog.forQuery(QueryKind.CONSULTAR_INCIDENCIA)).toBeInstanceOf(ConsultaService);
    expect(serviceCatalog.forQuery(QueryKind.CONSULTA_CUPO_DIARIO)).toBeInstanceOf(ConsultaService);
    expect(serviceCatalog.forQuery(QueryKind.CONSULTA_REINTENTOS_AGOTADOS)).toBeInstanceOf(ConsultaService);
    for (const shared of [QueryKind.VALIDATE_USER, QueryKind.VERIFY_CODE, QueryKind.LIST_ESTABLECIMIENTOS]) {
      expect(serviceCatalog.forQuery(shared)).toBeUndefined();
    }
  });

  it.each(CHANNELS)("maps the typed number to the rows visible in the %s channel, so the numbering has no gaps", (channel) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");
    expect(serviceCatalog.byMenuNumber("1", channel)?.id).toBe(MenuChoice.AGENDAR_CITA);
    expect(serviceCatalog.byMenuNumber(" 2 ", channel)?.id).toBe(MenuChoice.CONSULTAR_REFERENCIA);
    expect(serviceCatalog.byMenuNumber("3", channel)?.id).toBe(MenuChoice.REGISTRAR_INCIDENCIA);
    expect(serviceCatalog.byMenuNumber("4", channel)?.id).toBe(MenuChoice.CONSULTAR_INCIDENCIA);
    expect(serviceCatalog.byMenuNumber("5", channel)).toBeUndefined();

    vi.stubEnv("INCIDENCIAS_ENABLED", "false");
    expect(serviceCatalog.byMenuNumber("1", channel)?.id).toBe(MenuChoice.AGENDAR_CITA);
    expect(serviceCatalog.byMenuNumber("2", channel)?.id).toBe(MenuChoice.CONSULTAR_REFERENCIA);
    expect(serviceCatalog.byMenuNumber("3", channel)).toBeUndefined();
    expect(serviceCatalog.byMenuNumber("hola", channel)).toBeUndefined();
  });

  it.each(CHANNELS)("names the disabled service a typed number points at in the %s channel", (channel) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");
    expect(serviceCatalog.disabledByMenuNumber("3", channel)?.id).toBe(MenuChoice.REGISTRAR_INCIDENCIA);
    expect(serviceCatalog.disabledByMenuNumber("4", channel)?.id).toBe(MenuChoice.CONSULTAR_INCIDENCIA);
    expect(serviceCatalog.disabledByMenuNumber("1", channel)).toBeUndefined();
    expect(serviceCatalog.disabledByMenuNumber("2", channel)).toBeUndefined();
    expect(serviceCatalog.disabledByMenuNumber("5", channel)).toBeUndefined();

    vi.stubEnv("INCIDENCIAS_ENABLED", "true");
    expect(serviceCatalog.disabledByMenuNumber("3", channel)).toBeUndefined();
  });

  it("with the referencias off, owns the referencia states, the cita taken for a referencia and the list of referencias", () => {
    vi.stubEnv("REFERENCIAS_ENABLED", "false");
    const owner = (state: Session["state"], slots: Session["slots"] = {}) => serviceCatalog.disabledOwnerOf({ state, slots, counters: {} });

    expect(owner(SessionState.REFERENCIA_LOOKUP_PENDING)).toBeInstanceOf(ReferenciaService);
    expect(owner(SessionState.MAIN_MENU_REFERENCIA_CHOICE)).toBeInstanceOf(ReferenciaService);
    expect(owner(SessionState.CITA_AWAITING_REFERENCIA_SELECT)).toBeInstanceOf(ReferenciaService);
    expect(owner(SessionState.CITA_AWAITING_DNI, { [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS })).toBeInstanceOf(
      ReferenciaService,
    );
    expect(owner(SessionState.CITA_AWAITING_FECHA_SELECT, { [SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]: "R1" })).toBeInstanceOf(
      ReferenciaService,
    );
    expect(owner(SessionState.MAIN_MENU, { [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS })).toBeUndefined();
    expect(owner(SessionState.CITA_AWAITING_DNI)).toBeUndefined();
    expect(serviceCatalog.forQuery(QueryKind.LIST_REFERENCES)).toBeInstanceOf(ReferenciaService);
  });

  it.each(CHANNELS)("with only the referencias off, the typed numbers follow the rows shown in the %s channel", (channel) => {
    vi.stubEnv("REFERENCIAS_ENABLED", "false");

    expect(serviceCatalog.menuRows(channel)).toEqual([ROW_CITA, ROW_INCIDENCIA, ROW_CONSULTA]);
    expect(serviceCatalog.disabledByMenuNumber("2", channel)).toBeUndefined();
    expect(serviceCatalog.byMenuNumber("2", channel)?.id).toBe(MenuChoice.REGISTRAR_INCIDENCIA);
  });

  it("hides whatever its services say is disabled, without knowing about the flag", () => {
    class Hidden extends BotService {
      readonly id = MenuChoice.REGISTRAR_INCIDENCIA;
      readonly menuRow = ROW_INCIDENCIA;
      matchesState() {
        return false;
      }
      override isEnabled() {
        return false;
      }
    }

    expect(new ServiceCatalog([new CitaService(), new Hidden()]).menuRows(SessionChannel.WEB)).toEqual([ROW_CITA]);
  });
});
