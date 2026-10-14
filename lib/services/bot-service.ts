import type { ListRow, QueryEffectKind } from "@/lib/fsm/core/types";
import type { MenuChoice } from "@/lib/enums/menu-choice";
import { SERVICE_DISABLED_TEXT } from "@/lib/constants/textos/menu";

export abstract class BotService {
  abstract readonly id: MenuChoice;
  abstract readonly menuRow: ListRow;
  readonly queryKinds: readonly QueryEffectKind[] = [];

  abstract matchesState(state: string): boolean;

  isEnabled(): boolean {
    return true;
  }

  disabledReply(): string {
    return SERVICE_DISABLED_TEXT;
  }
}
