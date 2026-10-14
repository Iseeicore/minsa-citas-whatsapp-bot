import { BotService } from "@/lib/services/bot-service";
import { isIncidenciasEnabled } from "@/lib/config/features";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { QueryKind } from "@/lib/enums/query-kind";

export class IncidenciaService extends BotService {
  readonly id = MenuChoice.REGISTRAR_INCIDENCIA;
  readonly menuRow = { id: MenuChoice.REGISTRAR_INCIDENCIA, title: "Registrar una incidencia" };
  override readonly queryKinds = [
    QueryKind.INCIDENCIA_REGISTER,
    QueryKind.VERIFICAR_CONSENTIMIENTO,
    QueryKind.REGISTRAR_CONSENTIMIENTO,
    QueryKind.BUSCAR_ESTABLECIMIENTO,
    QueryKind.ANALYZE_INCIDENCIA_FOTO_INTENT,
  ];

  matchesState(state: string): boolean {
    return state.startsWith("incidencia_");
  }

  override isEnabled(): boolean {
    return isIncidenciasEnabled();
  }
}
