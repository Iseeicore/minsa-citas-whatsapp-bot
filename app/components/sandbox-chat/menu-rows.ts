import type { ComponentType } from "react";
import { CalendarIcon, ReportIcon, SearchIcon } from "@/app/components/icons";
import { MenuChoice } from "@/lib/enums/menu-choice";
import type { ListRow } from "@/lib/fsm/core/types";

type RowIcon = ComponentType<{ className?: string }>;

const MENU_ROW_PRESENTATION: Record<MenuChoice, { label: string; Icon: RowIcon }> = {
  [MenuChoice.AGENDAR_CITA]: { label: "Agendar una cita médica", Icon: CalendarIcon },
  [MenuChoice.REGISTRAR_INCIDENCIA]: { label: "Registrar una incidencia", Icon: ReportIcon },
  [MenuChoice.CONSULTAR_INCIDENCIA]: { label: "Consultar una incidencia", Icon: SearchIcon },
};

export function rowPresentation(row: ListRow): { label: string; Icon?: RowIcon } {
  return MENU_ROW_PRESENTATION[row.id as MenuChoice] ?? { label: row.title };
}
