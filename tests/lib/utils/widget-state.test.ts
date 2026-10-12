import { describe, expect, it } from "vitest";
import {
  INITIAL_WIDGET_STATE,
  closeWidget,
  openWidget,
  toggleExpand,
  toggleMinimize,
  type WidgetState,
} from "@/lib/utils/widget-state";
import { WidgetMode } from "@/lib/enums/widget-mode";

const state = (
  mode: WidgetMode,
  restoreMode: WidgetState["restoreMode"],
  closedFrom: WidgetState["closedFrom"] = WidgetMode.NORMAL,
): WidgetState => ({ mode, restoreMode, closedFrom });

describe("estado inicial y apertura", () => {
  it("empieza como lanzador, recordando el popup normal", () => {
    expect(INITIAL_WIDGET_STATE).toEqual(state(WidgetMode.LAUNCHER, WidgetMode.NORMAL, WidgetMode.NORMAL));
  });

  it("abrir desde el lanzador muestra el popup normal", () => {
    expect(openWidget(INITIAL_WIDGET_STATE)).toEqual(state(WidgetMode.NORMAL, WidgetMode.NORMAL));
  });
});

describe("agrandar y reducir", () => {
  it("del popup normal pasa a agrandado y lo recuerda", () => {
    expect(toggleExpand(state(WidgetMode.NORMAL, WidgetMode.NORMAL))).toEqual(
      state(WidgetMode.EXPANDED, WidgetMode.EXPANDED),
    );
  });

  it("de agrandado vuelve al popup normal y lo recuerda", () => {
    expect(toggleExpand(state(WidgetMode.EXPANDED, WidgetMode.EXPANDED))).toEqual(
      state(WidgetMode.NORMAL, WidgetMode.NORMAL),
    );
  });

  it("no hace nada si está minimizado o es el lanzador", () => {
    const minimizado = state(WidgetMode.MINIMIZED, WidgetMode.EXPANDED);
    expect(toggleExpand(minimizado)).toEqual(minimizado);
    expect(toggleExpand(INITIAL_WIDGET_STATE)).toEqual(INITIAL_WIDGET_STATE);
  });
});

describe("minimizar y restaurar", () => {
  it("minimizar desde el popup normal recuerda el popup normal", () => {
    expect(toggleMinimize(state(WidgetMode.NORMAL, WidgetMode.NORMAL))).toEqual(
      state(WidgetMode.MINIMIZED, WidgetMode.NORMAL),
    );
  });

  it("minimizar desde agrandado recuerda agrandado", () => {
    expect(toggleMinimize(state(WidgetMode.EXPANDED, WidgetMode.EXPANDED))).toEqual(
      state(WidgetMode.MINIMIZED, WidgetMode.EXPANDED),
    );
  });

  it("restaurar vuelve al estado anterior, no siempre al popup normal", () => {
    expect(toggleMinimize(state(WidgetMode.MINIMIZED, WidgetMode.EXPANDED))).toEqual(
      state(WidgetMode.EXPANDED, WidgetMode.EXPANDED),
    );
    expect(toggleMinimize(state(WidgetMode.MINIMIZED, WidgetMode.NORMAL))).toEqual(
      state(WidgetMode.NORMAL, WidgetMode.NORMAL),
    );
  });

  it("no hace nada desde el lanzador", () => {
    expect(toggleMinimize(INITIAL_WIDGET_STATE)).toEqual(INITIAL_WIDGET_STATE);
  });
});

describe("cerrar", () => {
  it("vuelve al lanzador y recuerda desde qué estado se cerró, para desvanecerse con esa misma geometría", () => {
    expect(closeWidget(state(WidgetMode.EXPANDED, WidgetMode.EXPANDED))).toEqual(
      state(WidgetMode.LAUNCHER, WidgetMode.NORMAL, WidgetMode.EXPANDED),
    );
    expect(closeWidget(state(WidgetMode.NORMAL, WidgetMode.NORMAL))).toEqual(
      state(WidgetMode.LAUNCHER, WidgetMode.NORMAL, WidgetMode.NORMAL),
    );
  });

  it("cerrar desde minimizado recuerda minimizado", () => {
    expect(closeWidget(state(WidgetMode.MINIMIZED, WidgetMode.EXPANDED)).closedFrom).toBe(WidgetMode.MINIMIZED);
  });

  it("olvida el estado agrandado: la próxima apertura es el popup normal", () => {
    const cerrado = closeWidget(state(WidgetMode.EXPANDED, WidgetMode.EXPANDED));

    expect(openWidget(cerrado).mode).toBe(WidgetMode.NORMAL);
  });
});
