import { WidgetMode } from "@/lib/enums/widget-mode";

type OpenMode = WidgetMode.NORMAL | WidgetMode.EXPANDED;
type VisibleMode = OpenMode | WidgetMode.MINIMIZED;

export type WidgetState = {
  mode: WidgetMode;
  restoreMode: OpenMode;
  closedFrom: VisibleMode;
};

export const INITIAL_WIDGET_STATE: WidgetState = {
  mode: WidgetMode.LAUNCHER,
  restoreMode: WidgetMode.NORMAL,
  closedFrom: WidgetMode.NORMAL,
};

const isOpenMode = (mode: WidgetMode): mode is OpenMode => mode === WidgetMode.NORMAL || mode === WidgetMode.EXPANDED;

export function openWidget(state: WidgetState): WidgetState {
  return { ...state, mode: state.restoreMode };
}

export function toggleExpand(state: WidgetState): WidgetState {
  if (!isOpenMode(state.mode)) return state;

  const next = state.mode === WidgetMode.EXPANDED ? WidgetMode.NORMAL : WidgetMode.EXPANDED;
  return { ...state, mode: next, restoreMode: next };
}

export function toggleMinimize(state: WidgetState): WidgetState {
  if (state.mode === WidgetMode.MINIMIZED) return { ...state, mode: state.restoreMode };
  if (!isOpenMode(state.mode)) return state;

  return { ...state, mode: WidgetMode.MINIMIZED, restoreMode: state.mode };
}

/** Recuerda desde qué estado se cerró para que el panel se desvanezca con esa misma geometría y no salte de tamaño. */
export function closeWidget(state: WidgetState): WidgetState {
  const closedFrom = state.mode === WidgetMode.LAUNCHER ? state.closedFrom : state.mode;
  return { mode: WidgetMode.LAUNCHER, restoreMode: WidgetMode.NORMAL, closedFrom };
}
