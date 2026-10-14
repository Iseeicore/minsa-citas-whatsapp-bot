import { BotService } from "@/lib/services/bot-service";
import { MenuChoice } from "@/lib/enums/menu-choice";

export class CitaService extends BotService {
  readonly id = MenuChoice.AGENDAR_CITA;
  readonly menuRow = { id: MenuChoice.AGENDAR_CITA, title: "Agendar una cita médica" };

  matchesState(state: string): boolean {
    return state.startsWith("cita_");
  }
}
