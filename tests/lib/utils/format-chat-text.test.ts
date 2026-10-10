import { describe, expect, it } from "vitest";
import { splitParagraphs, tokenizeChatText } from "@/lib/utils/format-chat-text";
import { ChatIconName } from "@/lib/enums/chat-icon-name";
import { ChatTokenKind } from "@/lib/enums/chat-token-kind";

describe("tokenizeChatText", () => {
  it("devuelve un solo token de texto cuando no hay formato", () => {
    expect(tokenizeChatText("Hola, ¿cómo estás?")).toEqual([{ kind: ChatTokenKind.TEXT, value: "Hola, ¿cómo estás?" }]);
  });

  it("convierte *negrita* de WhatsApp en un token de negrita sin los asteriscos", () => {
    expect(tokenizeChatText("llama al *106* (SAMU)")).toEqual([
      { kind: ChatTokenKind.TEXT, value: "llama al " },
      { kind: ChatTokenKind.BOLD, value: "106" },
      { kind: ChatTokenKind.TEXT, value: " (SAMU)" },
    ]);
  });

  it("convierte _cursiva_ de WhatsApp en un token de cursiva", () => {
    expect(tokenizeChatText("es _importante_ leerlo")).toEqual([
      { kind: ChatTokenKind.TEXT, value: "es " },
      { kind: ChatTokenKind.ITALIC, value: "importante" },
      { kind: ChatTokenKind.TEXT, value: " leerlo" },
    ]);
  });

  it("reemplaza la bandera del Perú por el icono, en lugar de dejar las letras PE", () => {
    expect(tokenizeChatText("MINSA Digital 🇵🇪.")).toEqual([
      { kind: ChatTokenKind.TEXT, value: "MINSA Digital " },
      { kind: ChatTokenKind.ICON, icon: ChatIconName.PERU_FLAG },
      { kind: ChatTokenKind.TEXT, value: "." },
    ]);
  });

  it("reemplaza la advertencia, con o sin selector de variación, por el icono", () => {
    const withSelector = tokenizeChatText("⚠️ Emergencia");
    const without = tokenizeChatText("⚠ Emergencia");

    expect(withSelector[0]).toEqual({ kind: ChatTokenKind.ICON, icon: ChatIconName.WARNING });
    expect(without[0]).toEqual({ kind: ChatTokenKind.ICON, icon: ChatIconName.WARNING });
    expect(withSelector[1]).toEqual({ kind: ChatTokenKind.TEXT, value: " Emergencia" });
  });

  it("no toca los asteriscos sueltos ni los guiones bajos dentro de una palabra", () => {
    expect(tokenizeChatText("2 * 3 y snake_case_word")).toEqual([
      { kind: ChatTokenKind.TEXT, value: "2 * 3 y snake_case_word" },
    ]);
  });

  it("deja intactos los emojis que no tienen icono propio", () => {
    expect(tokenizeChatText("¡Hola! 👋")).toEqual([{ kind: ChatTokenKind.TEXT, value: "¡Hola! 👋" }]);
  });
});

describe("splitParagraphs", () => {
  it("separa por líneas en blanco y descarta los párrafos vacíos", () => {
    expect(splitParagraphs("Uno\n\nDos\n\n\n\nTres\n")).toEqual(["Uno", "Dos", "Tres"]);
  });

  it("conserva los saltos de línea simples dentro de un párrafo", () => {
    expect(splitParagraphs("Línea A\nLínea B")).toEqual(["Línea A\nLínea B"]);
  });
});
