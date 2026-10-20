import { describe, expect, it } from "vitest";
import { offerList, offerPagedList, readTappedId, readTrimmedText, readTypedText } from "@/lib/fsm/core/handlers-shared";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { InboundEvent, ListRow, Session } from "@/lib/fsm/core/types";
import { InboundEventType } from "@/lib/enums/inbound-event-type";

const from = "51999000111";

function event(fields: Partial<InboundEvent>): InboundEvent {
  return { from, type: InboundEventType.TEXT, ...fields };
}

describe("readTappedId", () => {
  it("devuelve el identificador cuando la persona tocó un botón o una fila de lista", () => {
    expect(readTappedId(event({ type: InboundEventType.BUTTON, listId: "cita_exit_si" }))).toBe("cita_exit_si");
    expect(readTappedId(event({ type: InboundEventType.LIST, listId: "3" }))).toBe("3");
  });

  it("devuelve undefined cuando el botón o la lista llegan sin identificador", () => {
    expect(readTappedId(event({ type: InboundEventType.BUTTON }))).toBeUndefined();
    expect(readTappedId(event({ type: InboundEventType.LIST, text: "3" }))).toBeUndefined();
  });

  it("ignora el identificador y el texto de un mensaje que no es botón ni lista", () => {
    expect(readTappedId(event({ type: InboundEventType.TEXT, text: "cita_exit_si" }))).toBeUndefined();
    expect(readTappedId(event({ type: InboundEventType.TEXT, listId: "cita_exit_si" }))).toBeUndefined();
    expect(readTappedId(event({ type: InboundEventType.IMAGE, listId: "x" }))).toBeUndefined();
    expect(readTappedId(event({ type: InboundEventType.DOCUMENT, listId: "x" }))).toBeUndefined();
  });

  it("no acepta como toque un identificador escrito a mano", () => {
    expect(readTappedId(event({ type: InboundEventType.TEXT, text: "cita_exit_si" }))).toBeUndefined();
  });
});

describe("readTypedText", () => {
  it("devuelve el texto escrito tal cual, sin recortarlo", () => {
    expect(readTypedText(event({ text: "  hola  " }))).toBe("  hola  ");
  });

  it("devuelve texto vacío cuando el mensaje de texto llega sin texto", () => {
    expect(readTypedText(event({}))).toBe("");
  });

  it("devuelve texto vacío cuando el mensaje no es de texto, aunque traiga texto", () => {
    expect(readTypedText(event({ type: InboundEventType.BUTTON, text: "Sí", listId: "si" }))).toBe("");
    expect(readTypedText(event({ type: InboundEventType.LIST, text: "Opción" }))).toBe("");
    expect(readTypedText(event({ type: InboundEventType.IMAGE, text: "pie de foto" }))).toBe("");
  });
});

describe("readTrimmedText", () => {
  it("devuelve el texto sin espacios al inicio ni al final", () => {
    expect(readTrimmedText(event({ text: "  12345678 \n" }))).toBe("12345678");
  });

  it("conserva los espacios interiores", () => {
    expect(readTrimmedText(event({ text: " San  Juan " }))).toBe("San  Juan");
  });

  it("devuelve texto vacío cuando no hay texto", () => {
    expect(readTrimmedText(event({}))).toBe("");
    expect(readTrimmedText(event({ text: "   " }))).toBe("");
  });

  it("no mira el tipo del mensaje: recorta el texto que traiga", () => {
    expect(readTrimmedText(event({ type: InboundEventType.BUTTON, text: " Sí ", listId: "si" }))).toBe("Sí");
    expect(readTrimmedText(event({ type: InboundEventType.IMAGE, text: " pie " }))).toBe("pie");
  });
});

describe("offerList y offerPagedList: identificadores de fila únicos", () => {
  const repeated: ListRow[] = [
    { id: "08:00|08:30", title: "8:00 - 8:30 AM", description: "1 cupo(s) disponibles" },
    { id: "09:00|09:30", title: "9:00 - 9:30 AM" },
    { id: "08:00|08:30", title: "8:00 - 8:30 AM", description: "2 cupo(s) disponibles" },
  ];
  const blank = (): Session => ({ state: "cita_awaiting_hora_select", slots: {}, counters: {} });
  const ids = (rows: ListRow[]): string[] => rows.map((row) => row.id);

  it("offerList envía y recuerda cada identificador una sola vez, quedándose con la primera fila", () => {
    const session = blank();
    const effect = offerList(session, "Selecciona:", repeated);

    expect(effect).toEqual({ kind: "send_interactive_list", text: "Selecciona:", rows: [repeated[0], repeated[1]] });
    expect(ids(readOffered(session.slots)?.rows ?? [])).toEqual(["08:00|08:30", "09:00|09:30"]);
  });

  it("offerPagedList hace lo mismo antes de paginar", () => {
    const session = blank();
    const [effect] = offerPagedList(session, "Selecciona:", repeated);

    expect(effect).toEqual({ kind: "send_interactive_list", text: "Selecciona:", rows: [repeated[0], repeated[1]] });
    expect(ids(readOffered(session.slots)?.rows ?? [])).toEqual(["08:00|08:30", "09:00|09:30"]);
  });
});
