import { describe, expect, it } from "vitest";
import { ButtonSize } from "@/lib/enums/button-size";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import { buttonClassName, defaultButtonSize } from "@/lib/utils/button-class-name";

const classSet = (value: string) => value.split(" ").filter(Boolean).sort();

describe("buttonClassName reproduce las clases que cada botón tenía escritas a mano", () => {
  it("diálogo de confirmación: cancelar (contorno) y confirmar (primario)", () => {
    expect(classSet(buttonClassName({ variant: ButtonVariant.OUTLINE, size: ButtonSize.MD, width: ButtonWidth.GROW }))).toEqual(
      classSet(
        "flex-1 rounded-xl border border-sb-navy bg-white px-3 py-2 text-sm font-semibold text-sb-navy transition-colors hover:bg-sb-panel disabled:cursor-not-allowed disabled:opacity-50",
      ),
    );
    expect(classSet(buttonClassName({ variant: ButtonVariant.PRIMARY, size: ButtonSize.MD, width: ButtonWidth.GROW }))).toEqual(
      classSet("flex-1 rounded-xl bg-sb-navy px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-sb-navy-dark"),
    );
  });

  it("botón de opción de respuesta a todo el ancho", () => {
    expect(classSet(buttonClassName({ variant: ButtonVariant.OPTION, size: ButtonSize.MD, width: ButtonWidth.FULL }))).toEqual(
      classSet(
        "rounded-xl border border-sb-navy bg-sb-navy font-semibold text-white transition-colors hover:bg-sb-navy-dark flex w-full items-center justify-center gap-2 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50",
      ),
    );
  });

  it("botón de paginación: contorno pequeño con ícono", () => {
    expect(
      classSet(buttonClassName({ variant: ButtonVariant.OUTLINE, size: ButtonSize.SM, width: ButtonWidth.GROW, withIcon: true })),
    ).toEqual(
      classSet(
        "flex flex-1 items-center justify-center gap-1 rounded-xl border border-sb-navy bg-white px-3 py-1.5 text-xs font-semibold text-sb-navy transition-colors hover:bg-sb-panel disabled:cursor-not-allowed disabled:opacity-50",
      ),
    );
  });

  it("fila de opción de una lista", () => {
    expect(classSet(buttonClassName({ variant: ButtonVariant.LIST_OPTION, size: ButtonSize.LG, width: ButtonWidth.FULL }))).toEqual(
      classSet(
        "flex w-full items-center gap-2.5 rounded-xl bg-sb-navy px-3 py-2.5 text-left text-white transition-colors hover:bg-sb-navy-dark disabled:cursor-not-allowed disabled:opacity-50",
      ),
    );
  });

  it("botón de acento de la tarjeta de documento", () => {
    expect(classSet(buttonClassName({ variant: ButtonVariant.ACCENT, size: ButtonSize.MD, width: ButtonWidth.FULL }))).toEqual(
      classSet("w-full rounded-lg bg-sb-accent px-3 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"),
    );
  });

  it("píldoras: sobre fondo oscuro y neutra", () => {
    expect(classSet(buttonClassName({ variant: ButtonVariant.PILL_ON_DARK, size: ButtonSize.XS }))).toEqual(
      classSet("rounded-full border border-white/40 px-3 py-1 text-xs font-medium text-white/90 hover:bg-white/10 disabled:opacity-50"),
    );
    expect(classSet(buttonClassName({ variant: ButtonVariant.PILL_NEUTRAL, size: ButtonSize.XS }))).toEqual(
      classSet("rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"),
    );
  });

  it("fila de conversación, con y sin selección", () => {
    const row = "flex w-full items-center gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-50";

    expect(classSet(buttonClassName({ variant: ButtonVariant.ROW, size: ButtonSize.NONE, width: ButtonWidth.FULL }))).toEqual(
      classSet(row),
    );
    expect(
      classSet(buttonClassName({ variant: ButtonVariant.ROW, size: ButtonSize.NONE, width: ButtonWidth.FULL, selected: true })),
    ).toEqual(classSet(`${row} bg-teal-50`));
  });

  it("botones de ícono: plano, de control de ventana y sólidos", () => {
    expect(classSet(buttonClassName({ variant: ButtonVariant.ICON_PLAIN, size: ButtonSize.NONE }))).toEqual(
      classSet("flex-shrink-0 text-white/90 hover:text-white"),
    );
    expect(classSet(buttonClassName({ variant: ButtonVariant.ICON_CONTROL, size: ButtonSize.NONE }))).toEqual(
      classSet("flex-shrink-0 text-white/80 hover:text-white rounded p-1.5 hover:bg-white/10"),
    );
    expect(classSet(buttonClassName({ variant: ButtonVariant.ICON_SOLID_WHATSAPP, size: ButtonSize.ICON_LG }))).toEqual(
      classSet(
        "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40 bg-wa-accent",
      ),
    );
    expect(classSet(buttonClassName({ variant: ButtonVariant.ICON_SOLID_NAVY, size: ButtonSize.ICON_MD }))).toEqual(
      classSet(
        "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40 bg-sb-navy hover:bg-sb-navy-dark",
      ),
    );
  });

  it("riel del interruptor de modo", () => {
    expect(classSet(buttonClassName({ variant: ButtonVariant.SWITCH_TRACK, size: ButtonSize.NONE, width: ButtonWidth.FULL }))).toEqual(
      classSet("relative flex h-10 w-full items-center rounded-full bg-gray-200 p-1 transition-colors"),
    );
  });

  it("sin estilo no agrega ninguna clase propia y conserva la que pone el contenedor", () => {
    expect(buttonClassName({ variant: ButtonVariant.UNSTYLED, size: ButtonSize.NONE })).toBe("");
    expect(buttonClassName({ variant: ButtonVariant.UNSTYLED, size: ButtonSize.NONE, className: "fixed right-4" })).toBe("fixed right-4");
  });

  it("no deja espacios dobles ni repite clases", () => {
    for (const variant of Object.values(ButtonVariant)) {
      for (const size of Object.values(ButtonSize)) {
        for (const width of Object.values(ButtonWidth)) {
          const value = buttonClassName({ variant, size, width, withIcon: true, selected: true });
          const classes = value.split(" ");

          expect(classes.every(Boolean) || value === "").toBe(true);
          expect(new Set(classes).size).toBe(classes.length);
        }
      }
    }
  });
});

describe("defaultButtonSize", () => {
  it("da a cada variante el tamaño con el que se usa cuando no se indica otro", () => {
    expect(defaultButtonSize(ButtonVariant.PRIMARY)).toBe(ButtonSize.MD);
    expect(defaultButtonSize(ButtonVariant.OUTLINE)).toBe(ButtonSize.MD);
    expect(defaultButtonSize(ButtonVariant.OPTION)).toBe(ButtonSize.MD);
    expect(defaultButtonSize(ButtonVariant.ACCENT)).toBe(ButtonSize.MD);
    expect(defaultButtonSize(ButtonVariant.LIST_OPTION)).toBe(ButtonSize.LG);
    expect(defaultButtonSize(ButtonVariant.PILL_ON_DARK)).toBe(ButtonSize.XS);
    expect(defaultButtonSize(ButtonVariant.PILL_NEUTRAL)).toBe(ButtonSize.XS);
    expect(defaultButtonSize(ButtonVariant.ICON_SOLID_NAVY)).toBe(ButtonSize.ICON_MD);
    expect(defaultButtonSize(ButtonVariant.ICON_SOLID_WHATSAPP)).toBe(ButtonSize.ICON_MD);
    expect(defaultButtonSize(ButtonVariant.ROW)).toBe(ButtonSize.NONE);
    expect(defaultButtonSize(ButtonVariant.ICON_PLAIN)).toBe(ButtonSize.NONE);
    expect(defaultButtonSize(ButtonVariant.ICON_CONTROL)).toBe(ButtonSize.NONE);
    expect(defaultButtonSize(ButtonVariant.SWITCH_TRACK)).toBe(ButtonSize.NONE);
    expect(defaultButtonSize(ButtonVariant.UNSTYLED)).toBe(ButtonSize.NONE);
  });
});
