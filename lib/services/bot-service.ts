import type { ListRow } from "@/lib/fsm/core/types";
import type { MenuChoice } from "@/lib/enums/menu-choice";
import type { QueryKind } from "@/lib/enums/query-kind";

export const SERVICE_DISABLED_REPLY = "Por ahora solo puedo ayudarte a agendar una cita médica.";

/** Una opción del menú principal. Solo decide si está habilitada y cómo se presenta; el flujo vive en lib/fsm/flows. */
export abstract class BotService {
  abstract readonly id: MenuChoice;
  abstract readonly menuRow: ListRow;
  /** Consultas externas que solo este servicio emite; el ejecutor las rechaza si el servicio está deshabilitado. */
  readonly queryKinds: readonly QueryKind[] = [];

  abstract matchesState(state: string): boolean;

  isEnabled(): boolean {
    return true;
  }

  disabledReply(): string {
    return SERVICE_DISABLED_REPLY;
  }
}
