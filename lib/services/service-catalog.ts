import type { BotService } from "@/lib/services/bot-service";
import { CitaService } from "@/lib/services/cita-service";
import { ConsultaService } from "@/lib/services/consulta-service";
import { IncidenciaService } from "@/lib/services/incidencia-service";
import { ReferenciaService } from "@/lib/services/referencia-service";
import { UnknownServiceError } from "@/lib/errors/unknown-service-error";
import { POSITIVE_INTEGER } from "@/lib/constants/regex/text";
import type { ListRow, QueryEffectKind, SessionChannel } from "@/lib/fsm/core/types";
import type { MenuChoice } from "@/lib/enums/menu-choice";

function menuIndex(typed: string): number | undefined {
  const number = typed.trim();
  return POSITIVE_INTEGER.test(number) ? Number(number) - 1 : undefined;
}

export class ServiceCatalog {
  private readonly services: readonly BotService[];

  constructor(services: readonly BotService[]) {
    this.services = services;
  }

  private visibleIn(channel: SessionChannel): BotService[] {
    return this.services.filter((service) => service.menuChannels.includes(channel));
  }

  menuRows(channel: SessionChannel): ListRow[] {
    return this.visibleIn(channel)
      .filter((service) => service.isEnabled())
      .map((service) => service.menuRow);
  }

  byId(id: MenuChoice): BotService {
    const service = this.services.find((candidate) => candidate.id === id);
    if (!service) throw new UnknownServiceError(id);
    return service;
  }

  isEnabled(id: MenuChoice): boolean {
    return this.byId(id).isEnabled();
  }

  forState(state: string): BotService | undefined {
    return this.services.find((service) => service.matchesState(state));
  }

  forQuery(kind: QueryEffectKind): BotService | undefined {
    return this.services.find((service) => service.queryKinds.includes(kind));
  }

  byMenuNumber(typed: string, channel: SessionChannel): BotService | undefined {
    const index = menuIndex(typed);
    if (index === undefined) return undefined;
    const row = this.menuRows(channel)[index];
    return this.services.find((service) => service.menuRow === row);
  }

  disabledByMenuNumber(typed: string, channel: SessionChannel): BotService | undefined {
    const index = menuIndex(typed);
    if (index === undefined) return undefined;
    const service = this.visibleIn(channel)[index];
    return service && !service.isEnabled() ? service : undefined;
  }
}

export const incidenciaService = new IncidenciaService();
export const consultaService = new ConsultaService();

export const serviceCatalog = new ServiceCatalog([new CitaService(), new ReferenciaService(), incidenciaService, consultaService]);
