import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import {
  ASK_CODIGO_TEXT,
  ASK_CODIGO_O_LISTAR_TEXT,
  INVALID_CODIGO_TEXT,
  CODIGO_NO_RECONOCIDO_TEXT,
  CONSULTA_ASK_DOCUMENTO_TEXT,
  NO_VERIFICADO_TEXT,
  OTP_BLOQUEADO_TEXT,
  NO_UBICADA_TEXT,
  CONSULTA_FALLA_TEXT,
} from "@/lib/constants/textos/consulta";
import { ASK_OTP_TEXT, codigoIncorrectoText } from "@/lib/constants/textos/identidad";
import { CounterKey } from "@/lib/enums/counter-key";
import { InternalEventType } from "@/lib/enums/internal-event-type";

const FROM = "bsuid-ana";
const CODIGO = "MINSA-2026-000003";

const text = (value: string, channel: InboundEvent["channel"] = "whatsapp"): InboundEvent => ({
  from: FROM,
  type: "text",
  text: value,
  channel,
});
const pick = (id: string, channel: InboundEvent["channel"] = "whatsapp"): InboundEvent => ({
  from: FROM,
  type: "list",
  listId: id,
  channel,
});
const result = (queryKind: QueryResultEvent["queryKind"], value: unknown): QueryResultEvent => ({
  channel: "whatsapp",
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind,
  result: value,
});

const sent = (r: HandlerResult): SendEffect[] => r.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const texts = (r: HandlerResult): string[] => sent(r).map((effect) => ("text" in effect ? effect.text : ""));
const queries = (r: HandlerResult) => r.effects.filter(isQueryEffect);

const mainMenu = (): Session => ({ state: "main_menu", slots: {}, counters: {} });

describe("el código en el primer mensaje", () => {
  it("WhatsApp: busca de inmediato y la consulta no lleva el wa_id (lo pone el servidor)", () => {
    const first = handleFirstContact(`quiero revisar mi incidencia ${CODIGO}`, "whatsapp");

    expect(first.session.state).toBe("consulta_query_pending");
    expect(queries(first)).toEqual([{ kind: "consultar_incidencia", payload: { codigo: CODIGO, canal: "whatsapp" } }]);
  });

  it("web: antes de buscar pide verificar la identidad", () => {
    const first = handleFirstContact(CODIGO.toLowerCase(), "web");

    expect(first.session.state).toBe("consulta_awaiting_dni");
    expect(queries(first)).toEqual([]);
    expect(texts(first)).toEqual([CONSULTA_ASK_DOCUMENTO_TEXT]);
  });

  it("la palabra «incidencia» no lo manda a registrar una nueva", () => {
    const first = handleFirstContact(`mi incidencia ${CODIGO}`, "whatsapp");

    expect(first.session.state.startsWith("incidencia_")).toBe(false);
  });

  it("sin código, «consultar mi incidencia» pide el código", () => {
    const first = handleFirstContact("quiero consultar mi incidencia", "whatsapp");

    expect(first.session.state).toBe("consulta_awaiting_codigo");
    expect(texts(first)).toEqual([ASK_CODIGO_TEXT, ASK_CODIGO_O_LISTAR_TEXT]);
    expect(sent(first)[1]).toMatchObject({ buttons: [{ id: "consulta_codigo_listar", title: "Ver mis denuncias" }] });
  });

  it.each(["consultar mi denuncia", "Consultar mi denuncia", "quiero ver mis denuncias"])("sin código, %j pide el código", (message) => {
    const first = handleFirstContact(message, "whatsapp");

    expect(first.session.state).toBe("consulta_awaiting_codigo");
    expect(texts(first)).toEqual([ASK_CODIGO_TEXT, ASK_CODIGO_O_LISTAR_TEXT]);
  });

  it("un código con formato incorrecto no inicia la consulta", () => {
    const first = handleFirstContact("MINSA-2026-0003", "whatsapp");

    expect(first.session.state).not.toMatch(/^consulta_/);
  });
});

describe("desde el menú principal", () => {
  it("un código dentro de una frase salta a la consulta, con el canal del evento", () => {
    const step = handle(mainMenu(), text(`quiero ver mi incidencia ${CODIGO} por favor`, "web"));

    expect(step.session.state).toBe("consulta_awaiting_dni");
    expect(step.session.slots).toMatchObject({ consultaCanal: "web", consultaCodigo: CODIGO });
  });

  it("la opción «Consultar mi denuncia» del menú (y el 4) piden el código", () => {
    for (const event of [pick("consultar_incidencia"), text("4")]) {
      const step = handle(mainMenu(), event);

      expect(step.session.state).toBe("consulta_awaiting_codigo");
      expect(texts(step)).toEqual([ASK_CODIGO_TEXT, ASK_CODIGO_O_LISTAR_TEXT]);
    }
  });

  it("escribir «consultar mi denuncia» pide el código", () => {
    const step = handle(mainMenu(), text("consultar mi denuncia"));

    expect(step.session.state).toBe("consulta_awaiting_codigo");
    expect(texts(step)).toEqual([ASK_CODIGO_TEXT, ASK_CODIGO_O_LISTAR_TEXT]);
  });
});

describe("consulta_awaiting_codigo", () => {
  const waiting = (): Session => ({ state: "consulta_awaiting_codigo", slots: { consultaCanal: "whatsapp" }, counters: {} });

  it("un código válido busca; uno inválido lo vuelve a pedir con un ejemplo", () => {
    expect(handle(waiting(), text(CODIGO)).session.state).toBe("consulta_query_pending");

    const bad = handle(waiting(), text("123"));
    expect(bad.session.state).toBe("consulta_awaiting_codigo");
    expect(texts(bad)).toEqual([INVALID_CODIGO_TEXT]);
  });

  it("al tercer intento inválido cierra la consulta", () => {
    let step = handle(waiting(), text("uno"));
    step = handle(step.session, text("dos"));
    step = handle(step.session, text("tres"));

    expect(step.session.state).toBe("consulta_failed");
    expect(texts(step)).toEqual([CODIGO_NO_RECONOCIDO_TEXT]);
  });
});

describe("web: DNI + OTP antes de consultar", () => {
  const atDni = (): Session => ({ state: "consulta_awaiting_dni", slots: { consultaCanal: "web", consultaCodigo: CODIGO }, counters: {} });

  it("documento inválido se vuelve a pedir; válido valida con MINSA", () => {
    expect(handle(atDni(), text("123", "web")).session.state).toBe("consulta_awaiting_dni");

    const step = handle(atDni(), text("12345678", "web"));
    expect(step.session.state).toBe("consulta_validate_pending");
    expect(queries(step)).toMatchObject([{ kind: "validate_user", payload: { numeroDocumento: "12345678" } }]);
  });

  it("documento no registrado o MINSA caído cierran la consulta con su mensaje", () => {
    const pending = handle(atDni(), text("12345678", "web")).session;

    expect(texts(handle(pending, result("validate_user", { status: "not_valid" })))).toEqual([NO_VERIFICADO_TEXT]);
    expect(texts(handle(pending, result("validate_user", { status: "error" })))).toEqual([CONSULTA_FALLA_TEXT]);
  });

  it("recorre OTP correcto y busca con el documento verificado (sin guardar el token)", () => {
    let step = handle(atDni(), text("12345678", "web"));
    step = handle(step.session, result("validate_user", { status: "valid", twofaId: "tw-1" }));
    expect(step.session.state).toBe("consulta_awaiting_otp");
    expect(texts(step)).toEqual([ASK_OTP_TEXT]);

    step = handle(step.session, text("123456", "web"));
    expect(queries(step)).toMatchObject([{ kind: "verify_code", payload: { twofaId: "tw-1", code: "123456" } }]);

    step = handle(step.session, result("verify_code", { status: "verified", token: "secreto" }));
    expect(step.session.state).toBe("consulta_query_pending");
    expect(queries(step)).toEqual([{ kind: "consultar_incidencia", payload: { codigo: CODIGO, canal: "web", dni: "12345678" } }]);
    expect(JSON.stringify(step.session)).not.toContain("secreto");
  });

  it("OTP incorrecto descuenta intentos y al tercero cierra", () => {
    let step = handle(atDni(), text("12345678", "web"));
    step = handle(step.session, result("validate_user", { status: "valid", twofaId: "tw-1" }));

    for (const remaining of [2, 1]) {
      step = handle(step.session, text("000000", "web"));
      step = handle(step.session, result("verify_code", { status: "invalid" }));
      expect(step.session.state).toBe("consulta_awaiting_otp");
      expect(texts(step)).toEqual([`Código incorrecto. Te quedan ${remaining} intento(s).`]);
    }

    step = handle(step.session, text("000000", "web"));
    step = handle(step.session, result("verify_code", { status: "invalid" }));
    expect(step.session.state).toBe("consulta_failed");
    expect(texts(step)).toEqual([OTP_BLOQUEADO_TEXT]);
  });
});

describe("consulta_awaiting_otp: un mensaje con formato inválido cuenta como intento fallido", () => {
  const atOtp = (): Session => ({
    state: "consulta_awaiting_otp",
    slots: { consultaCanal: "web", consultaCodigo: CODIGO, consultaDniPending: "12345678", consultaTwofaId: "tw-1" },
    counters: {},
  });

  it.each([
    ["texto con símbolos", text("{ds", "web")],
    ["muy corto", text("12", "web")],
    ["muy largo", text("123456789", "web")],
    ["un toque de botón", pick("cualquiera", "web")],
  ])("%s descuenta un intento y no consulta a MINSA", (_caso, event) => {
    const step = handle(atOtp(), event);

    expect(queries(step)).toEqual([]);
    expect(step.session.state).toBe("consulta_awaiting_otp");
    expect(step.session.counters[CounterKey.CONSULTA_INTENTOS_OTP]).toBe(1);
    expect(texts(step)).toEqual([codigoIncorrectoText(2)]);
  });

  it("comparte el contador con el código incorrecto y al tercer intento cierra con el texto de agotamiento", () => {
    let step = handle(atOtp(), text("{ds", "web"));
    step = handle(step.session, text("123456", "web"));
    expect(queries(step)).toMatchObject([{ kind: "verify_code" }]);

    step = handle(step.session, result("verify_code", { status: "invalid" }));
    expect(step.session.counters[CounterKey.CONSULTA_INTENTOS_OTP]).toBe(2);
    expect(texts(step)).toEqual([codigoIncorrectoText(1)]);

    step = handle(step.session, text("zzz", "web"));
    expect(step.session.state).toBe("consulta_failed");
    expect(texts(step)).toEqual([OTP_BLOQUEADO_TEXT]);
    expect(queries(step)).toEqual([]);
  });
});

describe("consulta_query_pending: el resultado", () => {
  const pending = (canal: "whatsapp" | "web"): Session => ({
    state: "consulta_query_pending",
    slots: { consultaCanal: canal, consultaCodigo: CODIGO },
    counters: {},
  });

  it("encontrada: código, estado y fecha; nunca descripción ni datos de la persona; termina la sesión", () => {
    const step = handle(
      pending("whatsapp"),
      result("consultar_incidencia", {
        status: "found",
        codigo: CODIGO,
        estado: "DERIVADO",
        fechaRegistro: "2026-10-10T03:30:00.000Z",
        descripcion: "secreta",
        dni: "12345678",
      }),
    );

    expect(step.session.state).toBe("consulta_completed");
    expect(step.session.slots).toEqual({});
    expect(texts(step)).toEqual([`Denuncia ${CODIGO}\nEstado: Derivada al área responsable\nFecha de registro: 09/10/2026`]);
    expect(texts(step)[0]).not.toMatch(/secreta|12345678/);
  });

  it("no encontrada produce exactamente el mismo efecto para WhatsApp y web (no se distingue inexistente de ajena)", () => {
    const whatsapp = handle(pending("whatsapp"), result("consultar_incidencia", { status: "not_found" }));
    const web = handle(pending("web"), result("consultar_incidencia", { status: "not_found" }));

    expect(texts(whatsapp)).toEqual([NO_UBICADA_TEXT]);
    expect(web.effects).toEqual(whatsapp.effects);
    expect(web.session).toEqual(whatsapp.session);
    expect(whatsapp.session.state).toBe("consulta_completed");
  });

  it("base caída o apagada: «inténtalo más tarde» y la sesión termina", () => {
    for (const value of [{ status: "error" }, undefined]) {
      const step = handle(pending("whatsapp"), result("consultar_incidencia", value));

      expect(texts(step)).toEqual([CONSULTA_FALLA_TEXT]);
      expect(step.session.state).toBe("consulta_failed");
    }
  });

  it("tras terminar, el siguiente mensaje vuelve al inicio (primer contacto), también en la web", () => {
    const done: Session = { state: "consulta_completed", slots: {}, counters: {} };

    const web = handle(done, text("hola", "web"));
    expect(web.session.state).toBe("main_menu");
    expect(sent(web).length).toBe(1);
  });
});

describe("ver mis incidencias", () => {
  const LISTAR_ID = "consulta_codigo_listar";
  const atCodigo = (channel: InboundEvent["channel"] = "whatsapp"): Session => ({
    state: "consulta_awaiting_codigo",
    slots: { consultaCanal: channel === "web" ? "web" : "whatsapp" },
    counters: {},
  });

  it("WhatsApp: el botón «Ver mis denuncias» busca de inmediato, sin DNI", () => {
    const step = handle(atCodigo(), pick(LISTAR_ID));

    expect(step.session.state).toBe("consulta_listar_pending");
    expect(queries(step)).toEqual([{ kind: "listar_incidencias", payload: { canal: "whatsapp" } }]);
  });

  it("web: el botón «Ver mis denuncias» pide DNI+OTP antes de listar", () => {
    let step = handle(atCodigo("web"), pick(LISTAR_ID, "web"));
    expect(step.session.state).toBe("consulta_awaiting_dni");

    step = handle(step.session, text("12345678", "web"));
    step = handle(step.session, result("validate_user", { status: "valid", twofaId: "tw-1" }));
    step = handle(step.session, text("123456", "web"));
    step = handle(step.session, result("verify_code", { status: "verified", token: "secreto" }));

    expect(step.session.state).toBe("consulta_listar_pending");
    expect(queries(step)).toEqual([{ kind: "listar_incidencias", payload: { canal: "web", dni: "12345678" } }]);
  });

  describe("consulta_listar_pending: el resultado", () => {
    const pendingListar = (): Session => ({ state: "consulta_listar_pending", slots: { consultaCanal: "whatsapp" }, counters: {} });

    it("sin incidencias, cierra con el aviso y no deja ninguna query a medias", () => {
      const step = handle(pendingListar(), result("listar_incidencias", { status: "empty" }));

      expect(step.session.state).toBe("consulta_completed");
      expect(texts(step)).toEqual(["No tienes denuncias registradas."]);
    });

    it("con incidencias, ofrece la lista paginada (mismo mecanismo que las referencias de citas)", () => {
      const step = handle(
        pendingListar(),
        result("listar_incidencias", {
          status: "found",
          items: [
            { codigo: CODIGO, estado: "RESUELTO", fechaRegistro: "2026-10-10T03:30:00.000Z" },
            { codigo: "MINSA-2026-000009", estado: "EN_GESTION", fechaRegistro: "2026-09-01T03:30:00.000Z" },
          ],
        }),
      );

      expect(step.session.state).toBe("consulta_awaiting_listado");
      const listEffect = step.effects.find((e) => "rows" in e) as { text: string; rows: { id: string; title: string }[] };
      expect(listEffect.text).toBe("Estas son tus denuncias:");
      expect(listEffect.rows.map((r) => r.id)).toEqual([CODIGO, "MINSA-2026-000009"]);
    });

    it("base caída: cierra con el mismo mensaje de falla que una consulta puntual", () => {
      const step = handle(pendingListar(), result("listar_incidencias", { status: "error" }));

      expect(texts(step)).toEqual([CONSULTA_FALLA_TEXT]);
      expect(step.session.state).toBe("consulta_failed");
    });
  });

  it("al elegir una de la lista, muestra el mismo detalle que una consulta por código", () => {
    const listado = handle(
      { state: "consulta_listar_pending", slots: { consultaCanal: "whatsapp" }, counters: {} },
      result("listar_incidencias", {
        status: "found",
        items: [{ codigo: CODIGO, estado: "RESUELTO", fechaRegistro: "2026-10-10T03:30:00.000Z" }],
      }),
    ).session;

    const step = handle(listado, pick(CODIGO));

    expect(step.session.state).toBe("consulta_completed");
    expect(texts(step)).toEqual([`Denuncia ${CODIGO}\nEstado: Resuelta\nFecha de registro: 09/10/2026`]);
  });
});
