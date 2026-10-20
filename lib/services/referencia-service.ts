import { BotService } from "@/lib/services/bot-service";
import { MENU_ROW_CONSULTAR_REFERENCIA_TITLE } from "@/lib/constants/textos/menu";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { SessionStatePrefix } from "@/lib/enums/session-state-prefix";

export class ReferenciaService extends BotService {
  readonly id = MenuChoice.CONSULTAR_REFERENCIA;
  readonly menuRow = { id: MenuChoice.CONSULTAR_REFERENCIA, title: MENU_ROW_CONSULTAR_REFERENCIA_TITLE };

  matchesState(state: string): boolean {
    return state.startsWith(SessionStatePrefix.REFERENCIA);
  }
}
