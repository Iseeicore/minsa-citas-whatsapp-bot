import { afterEach, describe, expect, it, vi } from "vitest";
import { BotService } from "@/lib/services/bot-service";
import { CitaService } from "@/lib/services/cita-service";
import { ConsultaService } from "@/lib/services/consulta-service";
import { IncidenciaService } from "@/lib/services/incidencia-service";
import { ServiceCatalog, serviceCatalog } from "@/lib/services/service-catalog";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";

afterEach(() => {
  vi.unstubAllEnvs();
});

const ROW_CITA = { id: MenuChoice.AGENDAR_CITA, title: "Agendar una cita médica" };
const ROW_INCIDENCIA = { id: MenuChoice.REGISTRAR_INCIDENCIA, title: "Registrar una incidencia" };
const ROW_CONSULTA = { id: MenuChoice.CONSULTAR_INCIDENCIA, title: "Consultar una incidencia" };

describe("the services", () => {
  it("are all BotServices with their own menu row", () => {
    expect(new CitaService()).toBeInstanceOf(BotService);
    expect(new CitaService().menuRow).toEqual(ROW_CITA);
    expect(new IncidenciaService().menuRow).toEqual(ROW_INCIDENCIA);
    expect(new ConsultaService().menuRow).toEqual(ROW_CONSULTA);
  });

  it("the cita is enabled whatever the flag says", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    expect(new CitaService().isEnabled()).toBe(true);
  });

  it("the incidencia and the consulta follow INCIDENCIAS_ENABLED", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");
    expect([new IncidenciaService().isEnabled(), new ConsultaService().isEnabled()]).toEqual([true, true]);

    vi.stubEnv("INCIDENCIAS_ENABLED", "false");
    expect([new IncidenciaService().isEnabled(), new ConsultaService().isEnabled()]).toEqual([false, false]);
  });

  it("each one recognizes only the states of its own flow", () => {
    expect(new CitaService().matchesState(SessionState.CITA_AWAITING_DNI)).toBe(true);
    expect(new CitaService().matchesState(SessionState.INCIDENCIA_AWAITING_DNI)).toBe(false);
    expect(new IncidenciaService().matchesState(SessionState.INCIDENCIA_AWAITING_REAUTH)).toBe(true);
    expect(new IncidenciaService().matchesState(SessionState.CONSULTA_AWAITING_CODIGO)).toBe(false);
    expect(new ConsultaService().matchesState(SessionState.CONSULTA_QUERY_PENDING)).toBe(true);
    expect(new ConsultaService().matchesState(SessionState.MAIN_MENU)).toBe(false);
  });

  it("the disabled reply is short, in Spanish and says that only the citas remain", () => {
    for (const service of [new IncidenciaService(), new ConsultaService()]) {
      expect(service.disabledReply()).toMatch(/cita/i);
      expect(service.disabledReply().length).toBeLessThan(160);
    }
  });
});

describe("the ServiceCatalog", () => {
  it("lists the three rows, in the usual order, when the incidencias are on", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");

    expect(serviceCatalog.menuRows()).toEqual([ROW_CITA, ROW_INCIDENCIA, ROW_CONSULTA]);
  });

  it("lists only the cita when the incidencias are off", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    expect(serviceCatalog.menuRows()).toEqual([ROW_CITA]);
  });

  it("decides per call, not when it is imported", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");
    expect(serviceCatalog.menuRows()).toHaveLength(1);

    vi.stubEnv("INCIDENCIAS_ENABLED", "true");
    expect(serviceCatalog.menuRows()).toHaveLength(3);
  });

  it("finds a service by its menu id, even a disabled one", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    expect(serviceCatalog.byId(MenuChoice.REGISTRAR_INCIDENCIA)).toBeInstanceOf(IncidenciaService);
    expect(serviceCatalog.isEnabled(MenuChoice.REGISTRAR_INCIDENCIA)).toBe(false);
    expect(serviceCatalog.isEnabled(MenuChoice.AGENDAR_CITA)).toBe(true);
  });

  it("finds the owner of a session state, or nothing for the menu states", () => {
    expect(serviceCatalog.forState(SessionState.CONSULTA_AWAITING_DNI)).toBeInstanceOf(ConsultaService);
    expect(serviceCatalog.forState(SessionState.INCIDENCIA_CONFIRM_REGISTRO)).toBeInstanceOf(IncidenciaService);
    expect(serviceCatalog.forState(SessionState.CITA_AWAITING_DNI)).toBeInstanceOf(CitaService);
    expect(serviceCatalog.forState(SessionState.MAIN_MENU)).toBeUndefined();
    expect(serviceCatalog.forState(SessionState.AWAITING_FLOW_START)).toBeUndefined();
  });

  it("finds the owner of the incident-only queries, and nothing for the shared ones", () => {
    expect(serviceCatalog.forQuery(QueryKind.INCIDENCIA_REGISTER)).toBeInstanceOf(IncidenciaService);
    expect(serviceCatalog.forQuery(QueryKind.VERIFICAR_CONSENTIMIENTO)).toBeInstanceOf(IncidenciaService);
    expect(serviceCatalog.forQuery(QueryKind.REGISTRAR_CONSENTIMIENTO)).toBeInstanceOf(IncidenciaService);
    expect(serviceCatalog.forQuery(QueryKind.BUSCAR_ESTABLECIMIENTO)).toBeInstanceOf(IncidenciaService);
    expect(serviceCatalog.forQuery(QueryKind.ANALYZE_INCIDENCIA_FOTO_INTENT)).toBeInstanceOf(IncidenciaService);
    expect(serviceCatalog.forQuery(QueryKind.CONSULTAR_INCIDENCIA)).toBeInstanceOf(ConsultaService);
    expect(serviceCatalog.forQuery(QueryKind.LISTAR_INCIDENCIAS)).toBeInstanceOf(ConsultaService);
    for (const shared of [QueryKind.VALIDATE_USER, QueryKind.VERIFY_CODE, QueryKind.LIST_ESTABLECIMIENTOS, QueryKind.RENIEC_LOOKUP]) {
      expect(serviceCatalog.forQuery(shared)).toBeUndefined();
    }
  });

  it("maps the typed number to the VISIBLE rows, so the numbering has no gaps", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");
    expect(serviceCatalog.byMenuNumber("1")?.id).toBe(MenuChoice.AGENDAR_CITA);
    expect(serviceCatalog.byMenuNumber(" 2 ")?.id).toBe(MenuChoice.REGISTRAR_INCIDENCIA);
    expect(serviceCatalog.byMenuNumber("3")?.id).toBe(MenuChoice.CONSULTAR_INCIDENCIA);
    expect(serviceCatalog.byMenuNumber("4")).toBeUndefined();

    vi.stubEnv("INCIDENCIAS_ENABLED", "false");
    expect(serviceCatalog.byMenuNumber("1")?.id).toBe(MenuChoice.AGENDAR_CITA);
    expect(serviceCatalog.byMenuNumber("2")).toBeUndefined();
    expect(serviceCatalog.byMenuNumber("3")).toBeUndefined();
    expect(serviceCatalog.byMenuNumber("hola")).toBeUndefined();
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

    expect(new ServiceCatalog([new CitaService(), new Hidden()]).menuRows()).toEqual([ROW_CITA]);
  });
});
