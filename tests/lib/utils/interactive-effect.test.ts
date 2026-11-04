import { describe, expect, it } from "vitest";
import { turnInteractiveId } from "@/lib/utils/interactive-effect";
import { SendType } from "@/lib/enums/send-type";
import type { SendEffect } from "@/lib/fsm/core/types";

const HORAS_LIST: SendEffect = {
  kind: SendType.INTERACTIVE_LIST,
  text: "Selecciona la hora",
  rows: [{ id: "16:10|16:20", title: "4:10 PM" }],
};
const VER_MAS_BUTTONS: SendEffect = {
  kind: SendType.BUTTONS,
  text: "¿Quieres ver otros horarios?",
  buttons: [{ id: "next", title: "Ver más" }],
};

describe("turnInteractiveId", () => {
  it("keeps the hour list tappable when the same turn also sends the see-more button", () => {
    expect([HORAS_LIST, VER_MAS_BUTTONS].map((effect) => turnInteractiveId(effect, "web-1"))).toEqual(["web-1", "web-1"]);
  });

  it("gives no id to a plain text message", () => {
    expect(turnInteractiveId({ kind: SendType.TEXT, text: "Hola" }, "web-1")).toBeUndefined();
  });
});
