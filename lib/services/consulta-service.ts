import { BotService } from "@/lib/services/bot-service";
import { isIncidenciasEnabled } from "@/lib/config/features";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { QueryKind } from "@/lib/enums/query-kind";

export class ConsultaService extends BotService {
  readonly id = MenuChoice.CONSULTAR_INCIDENCIA;
  readonly menuRow = { id: MenuChoice.CONSULTAR_INCIDENCIA, title: "Consultar una incidencia" };
  override readonly queryKinds = [QueryKind.CONSULTAR_INCIDENCIA, QueryKind.LISTAR_INCIDENCIAS];

  matchesState(state: string): boolean {
    return state.startsWith("consulta_");
  }

  override isEnabled(): boolean {
    return isIncidenciasEnabled();
  }
}
