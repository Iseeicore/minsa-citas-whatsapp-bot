import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findLimitViolations } from "@/lib/whatsapp/message-limits";
import { sendButtons, sendCtaUrl, sendList } from "@/lib/fsm/core/handlers-shared";
import { buildMenuEffect } from "@/lib/fsm/routing/flow-entry";
import type { ButtonOption, ListRow, SendEffect } from "@/lib/fsm/core/types";
import { ListPageButtonId } from "@/lib/enums/list-page-button-id";
import { HoraPageButtonId } from "@/lib/enums/hora-page-button-id";
import { EstablecimientoPageRowId } from "@/lib/enums/establecimiento-page-row-id";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { SessionChannel } from "@/lib/enums/session-channel";
import { CONTINUE_BUTTONS, INSTITUTIONAL_WARNING_TEXT, RESPECT_REMINDER_TEXT } from "@/lib/constants/textos/seguridad";
import { ASK_CODIGO_O_LISTAR_TEXT, INCIDENCIAS_LIST_TEXT, LISTAR_BUTTONS } from "@/lib/constants/textos/consulta";
import {
  REFERENCIA_CHOICE_BUTTONS,
  REFERENCIA_CHOICE_QUESTION_TEXT,
  REFERENCIA_CITA_OFFER_BUTTONS,
  REFERENCIA_CITA_OFFER_QUESTION_TEXT,
} from "@/lib/constants/textos/referencia";
import { LIST_PAGE_NEXT_BUTTON_TEXT, LIST_PAGE_PREV_BUTTON_TEXT, NARROWED_LIST_TEXT } from "@/lib/constants/textos/comunes";
import { CITA_REAUTH_BUTTONS, CITA_REAUTH_PROMPT_TEXT } from "@/lib/constants/textos/cita-identidad";
import { EXIT_BUTTONS, EXIT_QUESTION_TEXT, REFERENCIA_EXIT_QUESTION_TEXT } from "@/lib/constants/textos/cita-salida";
import {
  DEMO_ANALYZING_TEXT,
  DEMO_CONFIRM_BUTTONS,
  DEMO_CONFIRM_QUESTION_TEXT,
  DEMO_HORAS_LIST_TEXT,
} from "@/lib/constants/textos/cita-demo";
import { DISTRITO_DISAMBIGUATION_TEXT, SELECT_UBIGEO_TEXT } from "@/lib/constants/textos/cita-ubicacion";
import {
  APPOINTMENT_BUTTON_TEXT,
  APPOINTMENT_CTA_TEXT,
  REFERENCIA_CONFIRM_BUTTONS,
  REFERENCIA_CONFIRM_QUESTION_TEXT,
  REFERENCIAS_LIST_TEXT,
} from "@/lib/constants/textos/cita-reserva";
import {
  ESTABLECIMIENTO_PAGE_NEXT_TITLE_TEXT,
  ESTABLECIMIENTO_PAGE_PREV_TITLE_TEXT,
  SELECT_ESPECIALIDAD_TEXT,
  SELECT_ESTABLECIMIENTO_TEXT,
} from "@/lib/constants/textos/cita-catalogo";
import {
  HORA_PAGE_NEXT_BUTTON_TEXT,
  HORA_PAGE_PREV_BUTTON_TEXT,
  HORA_PAGE_QUESTION_TEXT,
  SELECT_FECHA_TEXT,
  SELECT_HORA_TEXT,
} from "@/lib/constants/textos/cita-fecha-hora";
import {
  MENU_PROMPT_TEXT,
  MENU_ROW_CITA_TITLE,
  MENU_ROW_CONSULTAR_INCIDENCIA_TITLE,
  MENU_ROW_CONSULTAR_REFERENCIA_TITLE,
  MENU_ROW_REGISTRAR_INCIDENCIA_TITLE,
  WELCOME_CTA_BUTTON_TEXT,
  WELCOME_MESSAGE_TEXT,
} from "@/lib/constants/textos/menu";
import {
  BORRADOR_BUTTONS,
  BORRADOR_QUESTION_TEXT,
  CONSENT_BUTTONS,
  CONSENT_QUESTION_TEXT,
  FOTO_BUTTONS,
  FOTO_REQUEST_TEXT,
  IDENTITY_QUESTION_TEXT,
  INCIDENCIA_NOMBRE_BUTTONS,
  INCIDENCIA_REAUTH_BUTTONS,
  INCIDENCIA_REAUTH_PROMPT_TEXT,
  OMITIR_BUTTONS,
  OMITIR_RETRY_TEXT,
  ONLY_DNI_BUTTONS,
  ONLY_DNI_TEXT,
  UBICACION_BUTTONS,
  UBICACION_CONFIRM_RETRY_TEXT,
} from "@/lib/constants/textos/incidencia";

type StaticDefinition = { origin: string; effect: SendEffect };

const ROOT = process.cwd();
const TEXTOS_FOLDER = "lib/constants/textos";
const BUTTONS_SUFFIX = "_BUTTONS";
const BUTTON_TEXT_SUFFIX = "_BUTTON_TEXT";
const RUNTIME_BODY = "Cuerpo armado al enviar";
const RUNTIME_ROW: ListRow = { id: "fila", title: "Fila armada al enviar" };
const URL = "https://example.org";

const PAIRED_DEFINITIONS: StaticDefinition[] = [
  { origin: "INSTITUTIONAL_WARNING_TEXT + CONTINUE_BUTTONS", effect: sendButtons(INSTITUTIONAL_WARNING_TEXT, CONTINUE_BUTTONS) },
  { origin: "RESPECT_REMINDER_TEXT + CONTINUE_BUTTONS", effect: sendButtons(RESPECT_REMINDER_TEXT, CONTINUE_BUTTONS) },
  { origin: "ASK_CODIGO_O_LISTAR_TEXT + LISTAR_BUTTONS", effect: sendButtons(ASK_CODIGO_O_LISTAR_TEXT, LISTAR_BUTTONS) },
  {
    origin: "REFERENCIA_CITA_OFFER_QUESTION_TEXT + REFERENCIA_CITA_OFFER_BUTTONS",
    effect: sendButtons(REFERENCIA_CITA_OFFER_QUESTION_TEXT, REFERENCIA_CITA_OFFER_BUTTONS),
  },
  {
    origin: "REFERENCIA_CHOICE_QUESTION_TEXT + REFERENCIA_CHOICE_BUTTONS",
    effect: sendButtons(REFERENCIA_CHOICE_QUESTION_TEXT, REFERENCIA_CHOICE_BUTTONS),
  },
  { origin: "CITA_REAUTH_PROMPT_TEXT + CITA_REAUTH_BUTTONS", effect: sendButtons(CITA_REAUTH_PROMPT_TEXT, CITA_REAUTH_BUTTONS) },
  { origin: "EXIT_QUESTION_TEXT + EXIT_BUTTONS", effect: sendButtons(EXIT_QUESTION_TEXT, EXIT_BUTTONS) },
  { origin: "REFERENCIA_EXIT_QUESTION_TEXT + EXIT_BUTTONS", effect: sendButtons(REFERENCIA_EXIT_QUESTION_TEXT, EXIT_BUTTONS) },
  { origin: "DEMO_CONFIRM_QUESTION_TEXT + DEMO_CONFIRM_BUTTONS", effect: sendButtons(DEMO_CONFIRM_QUESTION_TEXT, DEMO_CONFIRM_BUTTONS) },
  {
    origin: "REFERENCIA_CONFIRM_QUESTION_TEXT + REFERENCIA_CONFIRM_BUTTONS",
    effect: sendButtons(REFERENCIA_CONFIRM_QUESTION_TEXT, REFERENCIA_CONFIRM_BUTTONS),
  },
  { origin: "IDENTITY_QUESTION_TEXT + INCIDENCIA_NOMBRE_BUTTONS", effect: sendButtons(IDENTITY_QUESTION_TEXT, INCIDENCIA_NOMBRE_BUTTONS) },
  { origin: "ONLY_DNI_TEXT + ONLY_DNI_BUTTONS", effect: sendButtons(ONLY_DNI_TEXT, ONLY_DNI_BUTTONS) },
  { origin: "UBICACION_CONFIRM_RETRY_TEXT + UBICACION_BUTTONS", effect: sendButtons(UBICACION_CONFIRM_RETRY_TEXT, UBICACION_BUTTONS) },
  { origin: "OMITIR_RETRY_TEXT + OMITIR_BUTTONS", effect: sendButtons(OMITIR_RETRY_TEXT, OMITIR_BUTTONS) },
  { origin: "CONSENT_QUESTION_TEXT + CONSENT_BUTTONS", effect: sendButtons(CONSENT_QUESTION_TEXT, CONSENT_BUTTONS) },
  { origin: "BORRADOR_QUESTION_TEXT + BORRADOR_BUTTONS", effect: sendButtons(BORRADOR_QUESTION_TEXT, BORRADOR_BUTTONS) },
  { origin: "FOTO_REQUEST_TEXT + FOTO_BUTTONS", effect: sendButtons(FOTO_REQUEST_TEXT, FOTO_BUTTONS) },
  {
    origin: "INCIDENCIA_REAUTH_PROMPT_TEXT + INCIDENCIA_REAUTH_BUTTONS",
    effect: sendButtons(INCIDENCIA_REAUTH_PROMPT_TEXT, INCIDENCIA_REAUTH_BUTTONS),
  },
  {
    origin: "botones de paginación de listas",
    effect: sendButtons(RUNTIME_BODY, [
      { id: ListPageButtonId.PREV, title: LIST_PAGE_PREV_BUTTON_TEXT },
      { id: ListPageButtonId.NEXT, title: LIST_PAGE_NEXT_BUTTON_TEXT },
    ]),
  },
  {
    origin: "HORA_PAGE_QUESTION_TEXT + botones de paginación de horarios",
    effect: sendButtons(HORA_PAGE_QUESTION_TEXT, [
      { id: HoraPageButtonId.PREV, title: HORA_PAGE_PREV_BUTTON_TEXT },
      { id: HoraPageButtonId.NEXT, title: HORA_PAGE_NEXT_BUTTON_TEXT },
    ]),
  },
  {
    origin: "MENU_PROMPT_TEXT + filas del menú",
    effect: sendList(MENU_PROMPT_TEXT, [
      { id: MenuChoice.AGENDAR_CITA, title: MENU_ROW_CITA_TITLE },
      { id: MenuChoice.CONSULTAR_REFERENCIA, title: MENU_ROW_CONSULTAR_REFERENCIA_TITLE },
      { id: MenuChoice.REGISTRAR_INCIDENCIA, title: MENU_ROW_REGISTRAR_INCIDENCIA_TITLE },
      { id: MenuChoice.CONSULTAR_INCIDENCIA, title: MENU_ROW_CONSULTAR_INCIDENCIA_TITLE },
    ]),
  },
  { origin: "menú de whatsapp-bot armado por el catálogo de servicios", effect: buildMenuEffect(SessionChannel.WHATSAPP) },
  {
    origin: "SELECT_ESTABLECIMIENTO_TEXT + filas de paginación de establecimientos",
    effect: sendList(SELECT_ESTABLECIMIENTO_TEXT, [
      { id: EstablecimientoPageRowId.PREV, title: ESTABLECIMIENTO_PAGE_PREV_TITLE_TEXT },
      { id: EstablecimientoPageRowId.NEXT, title: ESTABLECIMIENTO_PAGE_NEXT_TITLE_TEXT },
    ]),
  },
  ...[
    SELECT_UBIGEO_TEXT,
    DISTRITO_DISAMBIGUATION_TEXT,
    SELECT_ESPECIALIDAD_TEXT,
    SELECT_FECHA_TEXT,
    SELECT_HORA_TEXT,
    NARROWED_LIST_TEXT,
    INCIDENCIAS_LIST_TEXT,
    REFERENCIAS_LIST_TEXT,
    DEMO_ANALYZING_TEXT,
    DEMO_HORAS_LIST_TEXT,
  ].map((text) => ({ origin: `cuerpo de lista «${text}»`, effect: sendList(text, [RUNTIME_ROW]) })),
  { origin: "WELCOME_MESSAGE_TEXT + WELCOME_CTA_BUTTON_TEXT", effect: sendCtaUrl(WELCOME_MESSAGE_TEXT, WELCOME_CTA_BUTTON_TEXT, URL) },
  {
    origin: "APPOINTMENT_CTA_TEXT + APPOINTMENT_BUTTON_TEXT",
    effect: sendCtaUrl(APPOINTMENT_CTA_TEXT, APPOINTMENT_BUTTON_TEXT, URL),
  },
];

function textosModuleNames(): string[] {
  return fs
    .readdirSync(path.join(ROOT, TEXTOS_FOLDER))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => path.basename(file, ".ts"))
    .sort();
}

function discoveredDefinitions(moduleName: string, exported: Record<string, unknown>): StaticDefinition[] {
  return Object.entries(exported).flatMap(([name, value]) => {
    const origin = `${moduleName}.${name}`;
    if (name.endsWith(BUTTONS_SUFFIX) && Array.isArray(value)) {
      return [{ origin, effect: sendButtons(RUNTIME_BODY, value as ButtonOption[]) }];
    }
    if (name.endsWith(BUTTON_TEXT_SUFFIX) && typeof value === "string") {
      return [{ origin, effect: sendButtons(RUNTIME_BODY, [{ id: name, title: value }]) }];
    }
    return [];
  });
}

async function textosDefinitions(): Promise<StaticDefinition[]> {
  const modules = await Promise.all(
    textosModuleNames().map(async (moduleName) => ({
      moduleName,
      exported: (await import(`@/lib/constants/textos/${moduleName}.ts`)) as Record<string, unknown>,
    })),
  );
  return modules.flatMap(({ moduleName, exported }) => discoveredDefinitions(moduleName, exported));
}

function violationsOf(definitions: StaticDefinition[]) {
  return definitions
    .flatMap(({ origin, effect }) => findLimitViolations(effect).map((violation) => ({ origin, ...violation })))
    .sort((a, b) => (a.origin < b.origin ? -1 : a.origin > b.origin ? 1 : 0));
}

describe("límites de WhatsApp en los mensajes interactivos fijos", () => {
  it("encuentra los botones y los textos de botón declarados en los textos", async () => {
    const origins = (await textosDefinitions()).map((definition) => definition.origin);

    expect(origins).toContain("consulta.LISTAR_BUTTONS");
    expect(origins).toContain("cita-reserva.DUPLICATE_YES_BUTTON_TEXT");
    expect(origins).toContain("incidencia.CONFIRM_REGISTRO_BUTTONS");
    expect(origins).toContain("referencia.REFERENCIA_CHOICE_BUTTONS");
  });

  it("ningún mensaje fijo se sale de los límites de Meta", async () => {
    const definitions = [...(await textosDefinitions()), ...PAIRED_DEFINITIONS];

    expect(violationsOf(definitions)).toEqual([]);
  });

  it("revisa el menú real de whatsapp-bot, con la fila de las referencias", () => {
    const menu = buildMenuEffect(SessionChannel.WHATSAPP);

    expect(menu.kind === "send_interactive_list" && menu.rows.map((row) => row.id)).toContain(MenuChoice.CONSULTAR_REFERENCIA);
    expect(findLimitViolations(menu)).toEqual([]);
  });
});
