import { BotService } from "@/lib/services/bot-service";
import { isIncidenciasEnabled } from "@/lib/config/features";
import { MENU_ROW_CONSULTAR_INCIDENCIA_TITLE } from "@/lib/constants/textos/menu";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionStatePrefix } from "@/lib/enums/session-state-prefix";

export class ConsultaService extends BotService {
  readonly id = MenuChoice.CONSULTAR_INCIDENCIA;
  readonly menuRow = { id: MenuChoice.CONSULTAR_INCIDENCIA, title: MENU_ROW_CONSULTAR_INCIDENCIA_TITLE };
  override readonly queryKinds = [QueryKind.CONSULTAR_INCIDENCIA, QueryKind.LISTAR_INCIDENCIAS];

  matchesState(state: string): boolean {
    return state.startsWith(SessionStatePrefix.CONSULTA);
  }

  override isEnabled(): boolean {
    return isIncidenciasEnabled();
  }
}
