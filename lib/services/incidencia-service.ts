import { BotService } from "@/lib/services/bot-service";
import { isIncidenciasEnabled } from "@/lib/config/features";
import { MENU_ROW_REGISTRAR_INCIDENCIA_TITLE } from "@/lib/constants/textos/menu";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionStatePrefix } from "@/lib/enums/session-state-prefix";

export class IncidenciaService extends BotService {
  readonly id = MenuChoice.REGISTRAR_INCIDENCIA;
  readonly menuRow = { id: MenuChoice.REGISTRAR_INCIDENCIA, title: MENU_ROW_REGISTRAR_INCIDENCIA_TITLE };
  override readonly queryKinds = [
    QueryKind.INCIDENCIA_REGISTER,
    QueryKind.VERIFICAR_CONSENTIMIENTO,
    QueryKind.REGISTRAR_CONSENTIMIENTO,
    QueryKind.BUSCAR_ESTABLECIMIENTO,
    QueryKind.ANALYZE_INCIDENCIA_FOTO_INTENT,
  ];

  matchesState(state: string): boolean {
    return state.startsWith(SessionStatePrefix.INCIDENCIA);
  }

  override isEnabled(): boolean {
    return isIncidenciasEnabled();
  }
}
