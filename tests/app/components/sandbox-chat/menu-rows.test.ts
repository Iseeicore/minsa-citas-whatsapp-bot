import { describe, expect, it } from "vitest";
import { rowPresentation } from "@/app/components/sandbox-chat/menu-rows";
import { CalendarIcon, ReferralIcon, ReportIcon, SearchIcon } from "@/app/components/icons";
import { WHATSAPP_ROW_TITLE_MAX } from "@/lib/constants/limits/whatsapp";
import { MENU_ROW_CONSULTAR_REFERENCIA_TITLE } from "@/lib/constants/textos/menu";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { SessionChannel } from "@/lib/enums/session-channel";
import { serviceCatalog } from "@/lib/services/service-catalog";

describe("rowPresentation", () => {
  it("gives every row of the menu a label and an icon", () => {
    for (const choice of Object.values(MenuChoice)) {
      const presentation = rowPresentation({ id: choice, title: "titulo" });

      expect(presentation.label.length).toBeGreaterThan(0);
      expect(presentation.Icon).toBeTypeOf("function");
    }
  });

  it("presents the referencia row with its own title and its own icon", () => {
    const presentation = rowPresentation({ id: MenuChoice.CONSULTAR_REFERENCIA, title: "titulo" });

    expect(presentation.label).toBe(MENU_ROW_CONSULTAR_REFERENCIA_TITLE);
    expect(presentation.Icon).toBe(ReferralIcon);
    expect([CalendarIcon, ReportIcon, SearchIcon]).not.toContain(ReferralIcon);
  });

  it("keeps the icons of the other rows", () => {
    expect(rowPresentation({ id: MenuChoice.AGENDAR_CITA, title: "x" }).Icon).toBe(CalendarIcon);
    expect(rowPresentation({ id: MenuChoice.REGISTRAR_INCIDENCIA, title: "x" }).Icon).toBe(ReportIcon);
    expect(rowPresentation({ id: MenuChoice.CONSULTAR_INCIDENCIA, title: "x" }).Icon).toBe(SearchIcon);
  });

  it("falls back to the title of the row when the id is not a menu choice", () => {
    expect(rowPresentation({ id: "otro", title: "Un titulo" })).toEqual({ label: "Un titulo" });
  });

  it("every title the web menu can show fits a row", () => {
    for (const row of serviceCatalog.menuRows(SessionChannel.WEB)) {
      expect(row.title.length).toBeLessThanOrEqual(WHATSAPP_ROW_TITLE_MAX);
    }
    expect(MENU_ROW_CONSULTAR_REFERENCIA_TITLE).toBe("Consultar referencia");
  });
});
