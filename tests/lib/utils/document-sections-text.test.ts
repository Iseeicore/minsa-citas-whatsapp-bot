import { describe, expect, it } from "vitest";
import { documentSectionsText } from "@/lib/utils/document-sections-text";

describe("documentSectionsText", () => {
  it("joins each document with content under its title and leaves out the empty ones", () => {
    const text = documentSectionsText([
      { ancla: "uno", titulo: "Términos", contenido: "Texto de los términos." },
      { ancla: "dos", titulo: "Datos", contenido: "  " },
      { ancla: "tres", titulo: "Privacidad", contenido: "Texto de privacidad." },
    ]);

    expect(text).toBe("Términos\nTexto de los términos.\n\nPrivacidad\nTexto de privacidad.");
  });

  it("is empty while no document has content yet", () => {
    expect(documentSectionsText([{ ancla: "uno", titulo: "Términos", contenido: "" }])).toBe("");
  });
});
