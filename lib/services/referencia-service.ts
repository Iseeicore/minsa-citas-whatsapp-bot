import { BotService } from "@/lib/services/bot-service";
import { isReferenciasEnabled } from "@/lib/config/features";
import { MENU_ROW_CONSULTAR_REFERENCIA_TITLE } from "@/lib/constants/textos/menu";
import { REFERENCIA_SESSION_SLOTS, REFERENCIA_SESSION_STATES } from "@/lib/constants/referencias";
import type { Session } from "@/lib/fsm/core/types";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionStatePrefix } from "@/lib/enums/session-state-prefix";
import { SlotKey } from "@/lib/enums/slot-key";

function citaForReferencia(session: Session): boolean {
  if (!session.state.startsWith(SessionStatePrefix.CITA)) return false;
  if (session.slots[SlotKey.POST_LOGIN_FLOW] === PostLoginFlow.REFERENCIAS) return true;
  return REFERENCIA_SESSION_SLOTS.some((slot) => session.slots[slot] !== undefined);
}

export class ReferenciaService extends BotService {
  readonly id = MenuChoice.CONSULTAR_REFERENCIA;
  readonly menuRow = { id: MenuChoice.CONSULTAR_REFERENCIA, title: MENU_ROW_CONSULTAR_REFERENCIA_TITLE };
  override readonly queryKinds = [QueryKind.LIST_REFERENCES];

  matchesState(state: string): boolean {
    return state.startsWith(SessionStatePrefix.REFERENCIA) || REFERENCIA_SESSION_STATES.has(state);
  }

  override ownsSession(session: Session): boolean {
    return this.matchesState(session.state) || citaForReferencia(session);
  }

  override isEnabled(): boolean {
    return isReferenciasEnabled();
  }
}
