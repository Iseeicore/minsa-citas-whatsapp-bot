import { BotService } from "@/lib/services/bot-service";
import { MENU_ROW_CITA_TITLE } from "@/lib/constants/textos/menu";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { SessionStatePrefix } from "@/lib/enums/session-state-prefix";

export class CitaService extends BotService {
  readonly id = MenuChoice.AGENDAR_CITA;
  readonly menuRow = { id: MenuChoice.AGENDAR_CITA, title: MENU_ROW_CITA_TITLE };

  matchesState(state: string): boolean {
    return state.startsWith(SessionStatePrefix.CITA);
  }
}
