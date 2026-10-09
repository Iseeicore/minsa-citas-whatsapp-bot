import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ mediaConfigured: false }));
vi.mock("@/lib/recepcion/imagenes/config", () => ({ isMediaStorageConfigured: () => config.mediaConfigured }));

import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { Candidato } from "@/lib/establecimientos/decidir";
import type { BuscarEstablecimientoResult } from "@/lib/establecimientos/buscar";
import type { HandlerResult, InboundEvent, QueryEffect, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { isEmergency } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { evaluateLexicalGuard } from "@/lib/security/lexical-guard";
import { textoDeLaPersona } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { CounterKey } from "@/lib/enums/counter-key";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "sandbox-ubicacion";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const answer = (result: BuscarEstablecimientoResult): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind: "buscar_establecimiento",
  result,
});

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const queries = (result: HandlerResult): QueryEffect[] => result.effects.filter(isQueryEffect);
const at = (state: Session["state"], slots: Session["slots"] = {}, counters: Session["counters"] = {}): Session => ({ state, slots, counters });

const DOS_DE_MAYO = { id: 7, areaId: 9, codigoRenipress: "6206", nombre: "HOSPITAL NACIONAL DOS DE MAYO", distrito: null };
const candidato = (nombre: string, codigo: string, similitud: number, similitudPalabra = similitud, id = 1): Candidato => ({
  id,
  areaId: id,
  codigoRenipress: codigo,
  nombre,
  distrito: null,
  similitud,
  similitudPalabra,
});

const foundByCode: BuscarEstablecimientoResult = { by: "codigo", status: "found", establecimiento: DOS_DE_MAYO };

describe("the way in: QR, text that announces an incidencia, menu and shortcuts", () => {
  it("the QR message looks the establecimiento up by its code, before any other rule", () => {
    const result = handleFirstContact("Hola quiero presentar una incidencia HOSPITAL NACIONAL DOS DE MAYO - CODIGO-IPRESS 6206", "whatsapp");

    expect(result.session.state).toBe("incidencia_ubicacion_pending");
    expect(queries(result)).toEqual([{ kind: "buscar_establecimiento", payload: { codigo: "6206" } }]);
    expect(result.session.slots[SlotKey.INCIDENCIA_ORIGEN]).toBe("qr");
  });

  it("keeps the name as a fallback and what was written after the code as a draft", () => {
    const result = handleFirstContact("Hola quiero presentar una incidencia POSTA X - CODIGO-IPRESS 5862 me cobraron sin recibo", "whatsapp");

    expect(result.session.slots[SlotKey.INCIDENCIA_UBICACION_TEXTO]).toBe("POSTA X");
    expect(result.session.slots[SlotKey.INCIDENCIA_BORRADOR]).toBe("me cobraron sin recibo");
  });

  it("a name with no code is looked up by name", () => {
    const result = handleFirstContact("quiero presentar una incidencia en el hospital dos de mayo", "whatsapp");

    expect(queries(result)).toEqual([{ kind: "buscar_establecimiento", payload: { nombre: "hospital dos de mayo" } }]);
    expect(result.session.slots[SlotKey.INCIDENCIA_ORIGEN]).toBe("texto");
  });

  it("with no place at all it asks where it happened", () => {
    const result = handleFirstContact("quiero presentar una incidencia", "whatsapp");

    expect(result.session.state).toBe("incidencia_awaiting_ubicacion");
    expect(sent(result)).toEqual([
      { kind: "send_text", text: "¡Hola! Vamos a registrar tu incidencia. ¿En qué establecimiento de salud ocurrió? Escribe su nombre o su código IPRESS." },
    ]);
  });

  it("the menu option and the shortcuts ask for the place too", () => {
    const fromMenu = handle(at("main_menu"), tap("registrar_incidencia"));
    expect(fromMenu.session.state).toBe("incidencia_awaiting_ubicacion");
    expect(sent(fromMenu)).toEqual([{ kind: "send_text", text: "Vamos a registrar tu incidencia. ¿En qué establecimiento de salud ocurrió? Escribe su nombre o su código IPRESS." }]);
  });

  it("a QR scanned with the main menu already open is read too", () => {
    const result = handle(at("main_menu"), text("Hola quiero presentar una incidencia HOSPITAL NACIONAL DOS DE MAYO - CODIGO-IPRESS 6206"));
    expect(queries(result)).toEqual([{ kind: "buscar_establecimiento", payload: { codigo: "6206" } }]);
  });

  it("the QR message of every one of the 434 establecimientos goes to the lookup by its own code", () => {
    const padron: { nombre: string; codigo_renipress: string }[] = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "prisma", "seeds", "eess", "establecimientos.json"), "utf8"),
    );
    for (const fila of padron) {
      const message = `Hola quiero presentar una incidencia ${fila.nombre} - CODIGO-IPRESS ${fila.codigo_renipress}`;
      expect(isEmergency(textoDeLaPersona(message)), fila.nombre).toBe(false);
      expect(evaluateLexicalGuard(textoDeLaPersona(message)).action, fila.nombre).toBe("ALLOW");
      const result = handleFirstContact(message, "whatsapp");
      expect(queries(result), fila.nombre).toEqual([{ kind: "buscar_establecimiento", payload: { codigo: fila.codigo_renipress } }]);
    }
  });
});

describe("the part of the QR message that the system wrote is not what the person said", () => {
  it("the centers named C.S.M. are not taken for an insult, in the first message or with the menu open", () => {
    const message = "Hola quiero presentar una incidencia C.S.M. COMUNITARIO LINCE - CODIGO-IPRESS 38137";
    expect(evaluateLexicalGuard(message).action).toBe("DROP_AND_WARN");
    expect(evaluateLexicalGuard(textoDeLaPersona(message)).action).toBe("ALLOW");
    expect(queries(handle(at("main_menu"), text(message)))).toEqual([{ kind: "buscar_establecimiento", payload: { codigo: "38137" } }]);
  });

  it("what the person adds after the code is still checked", () => {
    expect(textoDeLaPersona("Hola quiero presentar una incidencia POSTA X - CODIGO-IPRESS 5862 son unos idiotas")).toBe("son unos idiotas");
    expect(textoDeLaPersona("Hola quiero presentar una incidencia POSTA X - CODIGO-IPRESS 5862")).toBe("");
    expect(textoDeLaPersona("hola, necesito ayuda")).toBe("hola, necesito ayuda");
  });
});

describe("looking the place up", () => {
  it("a code found asks «¿Estás seguro de esa ubicación?» with Sí and No", () => {
    const pending = at("incidencia_ubicacion_pending", { [SlotKey.INCIDENCIA_ORIGEN]: "qr" });
    const result = handle(pending, answer(foundByCode));

    expect(result.session.state).toBe("incidencia_confirm_ubicacion");
    expect(sent(result)[0]).toMatchObject({ kind: "send_buttons" });
    expect((sent(result)[0] as { text: string }).text).toContain("*HOSPITAL NACIONAL DOS DE MAYO*");
    expect((sent(result)[0] as { text: string }).text).toContain("Código IPRESS: 6206");
  });

  it("a code that does not exist falls back to the name the QR carried", () => {
    const pending = at("incidencia_ubicacion_pending", { [SlotKey.INCIDENCIA_UBICACION_TEXTO]: "POSTA X" });
    const result = handle(pending, answer({ by: "codigo", status: "not_found" }));

    expect(queries(result)).toEqual([{ kind: "buscar_establecimiento", payload: { nombre: "POSTA X" } }]);
    expect(result.session.slots[SlotKey.INCIDENCIA_UBICACION_TEXTO]).toBeUndefined();
  });

  it("a code that does not exist and no name: asks again and counts the attempt", () => {
    const result = handle(at("incidencia_ubicacion_pending"), answer({ by: "codigo", status: "not_found" }));

    expect(result.session.state).toBe("incidencia_awaiting_ubicacion");
    expect(result.session.counters[CounterKey.INCIDENCIA_UBICACION_INTENTOS]).toBe(1);
  });

  it("one clear name is confirmed", () => {
    const result = handle(at("incidencia_ubicacion_pending"), answer({ by: "nombre", status: "ok", candidatos: [candidato("HOSPITAL NACIONAL DOS DE MAYO", "6206", 1)] }));
    expect(result.session.state).toBe("incidencia_confirm_ubicacion");
  });

  it("a few names that look alike are never a list: it asks for the full name and counts the attempt", () => {
    const candidatos = [candidato("Hospital A", "1", 0.3, 1, 1), candidato("Hospital B", "2", 0.3, 1, 2), candidato("Hospital C", "3", 0.29, 1, 3)];
    const result = handle(at("incidencia_ubicacion_pending"), answer({ by: "nombre", status: "ok", candidatos }));

    expect(result.session.state).toBe("incidencia_awaiting_ubicacion");
    expect(sent(result)).toEqual([{ kind: "send_text", text: "Hay varios establecimientos que se parecen. Escribe su nombre completo o su código IPRESS." }]);
    expect(result.session.counters[CounterKey.INCIDENCIA_UBICACION_INTENTOS]).toBe(1);
  });

  it("nothing found: asks for the full name or the code", () => {
    const result = handle(at("incidencia_ubicacion_pending"), answer({ by: "nombre", status: "ok", candidatos: [] }));

    expect(result.session.state).toBe("incidencia_awaiting_ubicacion");
    expect((sent(result)[0] as { text: string }).text).toContain("No encontré ese establecimiento");
  });

  it("too many names: asks for the full name or the code", () => {
    const candidatos = Array.from({ length: 8 }, (_, i) => candidato(`CENTRO DE SALUD ${i}`, String(100 + i), 0.76 - i * 0.005, 1, i + 1));
    const result = handle(at("incidencia_ubicacion_pending"), answer({ by: "nombre", status: "ok", candidatos }));
    expect((sent(result)[0] as { text: string }).text).toContain("Hay varios establecimientos que se parecen");
  });

  it("a database that does not answer offers to go on without the establecimiento", () => {
    const result = handle(at("incidencia_ubicacion_pending"), answer({ by: "nombre", status: "unavailable" }));

    expect(result.session.state).toBe("incidencia_confirm_omitir");
    expect((sent(result)[0] as { text: string }).text).toContain("No pudimos buscar el establecimiento en este momento.");
  });

  it("a story kept as a draft survives a later search: only the first lookup can tell that the start was a name", () => {
    const story = { [SlotKey.INCIDENCIA_ORIGEN]: "texto", [SlotKey.INCIDENCIA_BORRADOR]: "en el hospital porque me cobraron sin recibo" };
    const first = handle(at("incidencia_ubicacion_pending", story), answer({ by: "nombre", status: "ok", candidatos: [] }));
    expect(first.session.slots[SlotKey.INCIDENCIA_BORRADOR]).toBe("en el hospital porque me cobraron sin recibo");
    expect(first.session.slots[SlotKey.INCIDENCIA_ORIGEN]).toBe("menu");

    const later = handle(
      { ...first.session, state: "incidencia_ubicacion_pending" },
      answer({ by: "nombre", status: "ok", candidatos: [candidato("HOSPITAL NACIONAL DOS DE MAYO", "6206", 1)] }),
    );
    expect(later.session.state).toBe("incidencia_confirm_ubicacion");
    expect(later.session.slots[SlotKey.INCIDENCIA_BORRADOR]).toBe("en el hospital porque me cobraron sin recibo");
  });

  it("a story written as the start is dropped when the text turned out to be a name, and kept when nothing was found", () => {
    const slots = { [SlotKey.INCIDENCIA_ORIGEN]: "texto", [SlotKey.INCIDENCIA_BORRADOR]: "hospital dos de mayo" };
    const asName = handle(at("incidencia_ubicacion_pending", slots), answer({ by: "nombre", status: "ok", candidatos: [candidato("HOSPITAL NACIONAL DOS DE MAYO", "6206", 0.71)] }));
    expect(asName.session.slots[SlotKey.INCIDENCIA_BORRADOR]).toBeUndefined();

    const story = { [SlotKey.INCIDENCIA_ORIGEN]: "texto", [SlotKey.INCIDENCIA_BORRADOR]: "en el hospital porque me cobraron sin recibo" };
    const noMatch = handle(at("incidencia_ubicacion_pending", story), answer({ by: "nombre", status: "ok", candidatos: [] }));
    expect(noMatch.session.slots[SlotKey.INCIDENCIA_BORRADOR]).toBe("en el hospital porque me cobraron sin recibo");
  });
});

describe("typing the place when it is asked", () => {
  it("a bare code is looked up by code", () => {
    expect(queries(handle(at("incidencia_awaiting_ubicacion"), text("6206")))).toEqual([{ kind: "buscar_establecimiento", payload: { codigo: "6206" } }]);
    expect(queries(handle(at("incidencia_awaiting_ubicacion"), text("CODIGO-IPRESS 00006206")))).toEqual([{ kind: "buscar_establecimiento", payload: { codigo: "6206" } }]);
  });

  it("a name is looked up by name", () => {
    expect(queries(handle(at("incidencia_awaiting_ubicacion"), text("posta buena vista")))).toEqual([
      { kind: "buscar_establecimiento", payload: { nombre: "posta buena vista" } },
    ]);
  });

  it("noise is not looked up", () => {
    const result = handle(at("incidencia_awaiting_ubicacion"), text("!!!???"));
    expect(queries(result)).toEqual([]);
    expect(result.session.state).toBe("incidencia_awaiting_ubicacion");
  });

  it.each(["no sé", "No lo sé", "omitir", "prefiero no", "ninguno"])("«%s» offers to go on without the establecimiento", (message) => {
    const result = handle(at("incidencia_awaiting_ubicacion"), text(message));
    expect(result.session.state).toBe("incidencia_confirm_omitir");
  });
});

describe("confirming the place", () => {
  const propuesto = { [SlotKey.INCIDENCIA_ESTABLECIMIENTO_PROPUESTO]: JSON.stringify(DOS_DE_MAYO) };

  it.each([["the Sí button", tap("incidencia_ubicacion_si")], ["«sí»", text("sí")], ["«dale»", text("dale")]])("yes (%s) keeps the place and goes to ask about the name", (_label, event) => {
    const result = handle(at("incidencia_confirm_ubicacion", propuesto), event);

    expect(result.session.state).toBe("incidencia_identity_choice");
    expect(result.session.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID]).toBe(7);
    expect(result.session.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_CODIGO]).toBe("6206");
    expect(result.session.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_NOMBRE]).toBe("HOSPITAL NACIONAL DOS DE MAYO");
    expect(result.session.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_PROPUESTO]).toBeUndefined();
    expect(sent(result).map((effect) => effect.kind)).toEqual(["send_text", "send_buttons"]);
  });

  it("no asks for another name or code and counts the attempt", () => {
    const result = handle(at("incidencia_confirm_ubicacion", propuesto), tap("incidencia_ubicacion_no"));

    expect(result.session.state).toBe("incidencia_awaiting_ubicacion");
    expect(result.session.counters[CounterKey.INCIDENCIA_UBICACION_INTENTOS]).toBe(1);
  });

  it("after three failed attempts it offers to go on without the establecimiento", () => {
    const result = handle(at("incidencia_confirm_ubicacion", propuesto, { [CounterKey.INCIDENCIA_UBICACION_INTENTOS]: 2 }), tap("incidencia_ubicacion_no"));

    expect(result.session.state).toBe("incidencia_confirm_omitir");
    expect((sent(result)[0] as { text: string }).text).toContain("no logramos ubicar el establecimiento");
  });

  it("an answer that is neither yes nor no repeats the question", () => {
    const result = handle(at("incidencia_confirm_ubicacion", propuesto), text("mmm"));

    expect(result.session.state).toBe("incidencia_confirm_ubicacion");
    expect(sent(result)[0]).toMatchObject({ kind: "send_buttons" });
  });
});

describe("going on without the establecimiento", () => {
  const omitir = at("incidencia_confirm_omitir", { [SlotKey.INCIDENCIA_ESTABLECIMIENTO_CODIGO]: "x" }, { [CounterKey.INCIDENCIA_UBICACION_INTENTOS]: 3 });

  it.each([["the Sí button", tap("incidencia_omitir_si")], ["«sí»", text("sí")]])("yes (%s) goes on with no place saved", (_label, event) => {
    const result = handle(omitir, event);

    expect(result.session.state).toBe("incidencia_identity_choice");
    expect(result.session.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_CODIGO]).toBeUndefined();
    expect(result.session.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID]).toBeUndefined();
    expect(result.session.counters[CounterKey.INCIDENCIA_UBICACION_INTENTOS]).toBeUndefined();
  });

  it("no goes back to asking for the place, with the attempts back to zero", () => {
    const result = handle(omitir, tap("incidencia_omitir_no"));

    expect(result.session.state).toBe("incidencia_awaiting_ubicacion");
    expect(result.session.counters[CounterKey.INCIDENCIA_UBICACION_INTENTOS]).toBeUndefined();
  });
});

describe("what the person already wrote: use it or add more", () => {
  const story = "Me cobraron sin recibo en la ventanilla de admisión.";
  const withDraft = (state: Session["state"]) => at(state, { [SlotKey.INCIDENCIA_BORRADOR]: story });

  beforeEach(() => {
    config.mediaConfigured = false;
  });

  it("when the relato is asked, a usable draft is shown with «Usar así» and «Agregar más»", () => {
    const result = handle(withDraft("incidencia_identity_choice"), tap("incidencia_anonimo"));

    expect(result.session.state).toBe("incidencia_confirm_borrador");
    expect((sent(result)[0] as { text: string }).text).toContain(`«${story}»`);
    expect(sent(result)[0]).toMatchObject({ buttons: [{ id: "incidencia_borrador_usar" }, { id: "incidencia_borrador_agregar" }] });
  });

  it("a draft that is too short or is noise is dropped and the relato is asked", () => {
    for (const draft of ["cobraron", "123456789012345678901234"]) {
      const result = handle(at("incidencia_identity_choice", { [SlotKey.INCIDENCIA_BORRADOR]: draft }), tap("incidencia_anonimo"));
      expect(result.session.state).toBe("incidencia_awaiting_descripcion");
      expect(result.session.slots[SlotKey.INCIDENCIA_BORRADOR]).toBeUndefined();
    }
  });

  it("without a draft the relato is asked as always", () => {
    const result = handle(at("incidencia_identity_choice"), tap("incidencia_anonimo"));
    expect(result.session.state).toBe("incidencia_awaiting_descripcion");
  });

  it.each([["the button", tap("incidencia_borrador_usar")], ["«sí»", text("sí")]])("using it as it is (%s) saves it as the relato and goes on", (_label, event) => {
    const result = handle(withDraft("incidencia_confirm_borrador"), event);

    expect(result.session.state).toBe("incidencia_submit_pending");
    expect(queries(result)[0]).toMatchObject({ kind: "incidencia_register", payload: { submission: { descripcion: story } } });
  });

  it("using it with the image service on asks for the photo", () => {
    config.mediaConfigured = true;
    expect(handle(withDraft("incidencia_confirm_borrador"), tap("incidencia_borrador_usar")).session.state).toBe("incidencia_awaiting_foto");
  });

  it("adding more asks for the extra text and joins it to the draft", () => {
    const asked = handle(withDraft("incidencia_confirm_borrador"), tap("incidencia_borrador_agregar"));
    expect(asked.session.state).toBe("incidencia_awaiting_borrador_extra");

    const result = handle(asked.session, text("Además no me dieron el medicamento."));
    expect(result.session.state).toBe("incidencia_submit_pending");
    expect(queries(result)[0]).toMatchObject({ payload: { submission: { descripcion: `${story}\nAdemás no me dieron el medicamento.` } } });
  });

  it("writing more instead of tapping a button also adds it to the draft", () => {
    const result = handle(withDraft("incidencia_confirm_borrador"), text("Y también me trataron mal."));
    expect(queries(result)[0]).toMatchObject({ payload: { submission: { descripcion: `${story}\nY también me trataron mal.` } } });
  });

  it("the draft plus the extra cannot pass 1000 characters", () => {
    const result = handle(withDraft("incidencia_awaiting_borrador_extra"), text("a b ".repeat(300)));

    expect(result.session.state).toBe("incidencia_awaiting_borrador_extra");
    expect((sent(result)[0] as { text: string }).text).toContain("no puede pasar de 1000 caracteres");
  });
});
