import type { BotService } from "@/lib/services/bot-service";
import { CitaService } from "@/lib/services/cita-service";
import { ConsultaService } from "@/lib/services/consulta-service";
import { IncidenciaService } from "@/lib/services/incidencia-service";
import type { ListRow } from "@/lib/fsm/core/types";
import type { MenuChoice } from "@/lib/enums/menu-choice";
import type { QueryKind } from "@/lib/enums/query-kind";

/** Las opciones del menú, en orden. Se consulta en cada llamada: qué está habilitado puede cambiar entre turnos (y entre pruebas). */
export class ServiceCatalog {
  private readonly services: readonly BotService[];

  constructor(services: readonly BotService[]) {
    this.services = services;
  }

  menuRows(): ListRow[] {
    return this.services.filter((service) => service.isEnabled()).map((service) => service.menuRow);
  }

  byId(id: MenuChoice): BotService {
    const service = this.services.find((candidate) => candidate.id === id);
    if (!service) throw new Error(`ServiceCatalog: unknown service "${id}"`);
    return service;
  }

  isEnabled(id: MenuChoice): boolean {
    return this.byId(id).isEnabled();
  }

  forState(state: string): BotService | undefined {
    return this.services.find((service) => service.matchesState(state));
  }

  forQuery(kind: QueryKind): BotService | undefined {
    return this.services.find((service) => service.queryKinds.includes(kind));
  }

  /** «1», «2», «3» numeran las filas que se ven: con una opción oculta no quedan huecos. */
  byMenuNumber(typed: string): BotService | undefined {
    if (!/^\d+$/.test(typed.trim())) return undefined;
    const row = this.menuRows()[Number(typed.trim()) - 1];
    return row ? this.byId(row.id as MenuChoice) : undefined;
  }
}

export const serviceCatalog = new ServiceCatalog([new CitaService(), new IncidenciaService(), new ConsultaService()]);
