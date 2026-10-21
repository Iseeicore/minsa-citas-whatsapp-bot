import { describe, expect, it } from "vitest";
import { whatsappListRows } from "@/lib/utils/whatsapp-list-rows";
import { findLimitViolations } from "@/lib/whatsapp/message-limits";
import { toNumberedTextEffect } from "@/lib/whatsapp/message-fallback";
import { buildResult, pageEffects, listPageSize } from "@/lib/fsm/core/handlers-shared";
import { withReferenceChangeAction } from "@/lib/fsm/flows/referencia/change-reference";
import type { SendInteractiveListEffect, Session } from "@/lib/fsm/core/types";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SlotKey } from "@/lib/enums/slot-key";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";
import { ListPageButtonId } from "@/lib/enums/list-page-button-id";

const session: Session = {
  state: SessionState.CITA_AWAITING_FECHA_SELECT,
  channel: SessionChannel.WHATSAPP,
  slots: { [SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]: "opaque-reference" },
  counters: {},
};
const rows = Array.from({ length: 21 }, (_, index) => ({ id: `quota-${index}`, title: `Fecha ${index + 1}` }));

describe("listas de referencias en WhatsApp", () => {
  it("conserva todas las opciones y reserva espacio para los controles en cada página", () => {
    const visited: string[] = [];
    for (let page = 0; page < 3; page += 1) {
      const result = withReferenceChangeAction(buildResult(session, pageEffects("Elige fecha", rows, page, session)));
      expect(result.effects).toHaveLength(1);
      const effect = result.effects[0] as SendInteractiveListEffect;
      const outbound = whatsappListRows(effect);
      expect(outbound.length).toBeLessThanOrEqual(10);
      expect(findLimitViolations(effect)).toEqual([]);
      expect(outbound.map((row) => row.id)).toContain(ReferenciaActionButtonId.CHANGE);
      expect(outbound.some((row) => row.id === ListPageButtonId.PREV)).toBe(page > 0);
      expect(outbound.some((row) => row.id === ListPageButtonId.NEXT)).toBe(page < 2);
      visited.push(...effect.rows.map((row) => row.id));
    }
    expect(visited).toEqual(rows.map((row) => row.id));
  });

  it("conserva el tamaño anterior para el chat web y las listas de citas sin referencia", () => {
    expect(listPageSize({ ...session, channel: SessionChannel.WEB })).toBe(10);
    expect(listPageSize({ ...session, slots: {} })).toBe(10);
    expect(listPageSize()).toBe(10);
    expect(listPageSize(session)).toBe(7);
  });

  it("incluye las acciones en el texto alternativo y en la validación del límite de filas", () => {
    const effect: SendInteractiveListEffect = {
      kind: SendType.INTERACTIVE_LIST,
      text: "Elige fecha",
      rows: rows.slice(0, 10),
      actions: [{ id: ReferenciaActionButtonId.CHANGE, title: "Cambiar referencia" }],
    };
    const before = structuredClone(effect);
    expect(whatsappListRows(effect)).toHaveLength(11);
    expect(findLimitViolations(effect).length).toBeGreaterThan(0);
    expect(toNumberedTextEffect(effect).text).toContain("Cambiar referencia");
    expect(effect).toEqual(before);
  });
});
