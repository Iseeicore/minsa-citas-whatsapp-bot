import type { ComponentType } from "react";
import { CalendarIcon, ReportIcon, SearchIcon } from "@/app/components/icons";
import {
  MENU_ROW_CITA_TITLE,
  MENU_ROW_CONSULTAR_INCIDENCIA_TITLE,
  MENU_ROW_REGISTRAR_INCIDENCIA_TITLE,
} from "@/lib/constants/textos/menu";
import { MenuChoice } from "@/lib/enums/menu-choice";
import type { ListRow } from "@/lib/fsm/core/types";

type RowIcon = ComponentType<{ className?: string }>;

const MENU_ROW_PRESENTATION: Record<MenuChoice, { label: string; Icon: RowIcon }> = {
  [MenuChoice.AGENDAR_CITA]: { label: MENU_ROW_CITA_TITLE, Icon: CalendarIcon },
  [MenuChoice.REGISTRAR_INCIDENCIA]: { label: MENU_ROW_REGISTRAR_INCIDENCIA_TITLE, Icon: ReportIcon },
  [MenuChoice.CONSULTAR_INCIDENCIA]: { label: MENU_ROW_CONSULTAR_INCIDENCIA_TITLE, Icon: SearchIcon },
};

export function rowPresentation(row: ListRow): { label: string; Icon?: RowIcon } {
  return MENU_ROW_PRESENTATION[row.id as MenuChoice] ?? { label: row.title };
}
