import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { runTurnUnlocked } from "@/lib/fsm/core/executor";
import type { InboundEvent, SendEffect } from "@/lib/fsm/core/types";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { SlotKey } from "@/lib/enums/slot-key";

const QR = (nombre: string, codigo: string, extra = "") => `Hola quiero presentar una incidencia ${nombre} - CODIGO-IPRESS ${codigo}${extra}`;

describe.skipIf(!process.env.DATABASE_URL)("the way into an incidencia, with the real executor, session and padron", () => {
  const created: string[] = [];

  const person = () => {
    const from = `sandbox-${randomUUID()}`;
    created.push(from);
    const event = (partial: Partial<InboundEvent>): InboundEvent => ({ from, type: "text", ...partial });
    return {
      from,
      start: (text: string) => runTurnUnlocked(from, event({ text }), undefined, handleFirstContact(text, "web")),
      say: (text: string) => runTurnUnlocked(from, event({ text })),
      tap: (listId: string) => runTurnUnlocked(from, event({ type: "button", listId })),
      pick: (listId: string) => runTurnUnlocked(from, event({ type: "list", listId })),
    };
  };

  const textOf = (effect: SendEffect | undefined) => (effect && "text" in effect ? effect.text : "");

  afterAll(async () => {
    await prisma.sesionConversacion.deleteMany({ where: { waId: { in: created } } });
    await prisma.$disconnect();
  });

  it("the QR of the Hospital Dos de Mayo asks to confirm that place, and yes goes on to the name question", async () => {
    const p = person();
    const confirm = await p.start(QR("HOSPITAL NACIONAL DOS DE MAYO", "6206"));

    expect(confirm.session.state).toBe("incidencia_confirm_ubicacion");
    expect(textOf(confirm.sent[0])).toContain("*HOSPITAL NACIONAL DOS DE MAYO*");

    const identity = await p.tap("incidencia_ubicacion_si");
    expect(identity.session.state).toBe("incidencia_identity_choice");
    expect(identity.session.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_CODIGO]).toBe("6206");
    expect(typeof identity.session.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID]).toBe("number");
  });

  it("the QR of a center named C.S.M. is not dropped as an insult", async () => {
    const turn = await person().start(QR("C.S.M. COMUNITARIO LINCE", "38137"));
    expect(turn.session.state).toBe("incidencia_confirm_ubicacion");
    expect(textOf(turn.sent[0])).toContain("C.S.M. COMUNITARIO LINCE");
  });

  it("a QR with a story after the code: the place is confirmed and then the story is offered to use or add to", async () => {
    const p = person();
    const story = "Me cobraron sin recibo en la ventanilla de admisión.";
    await p.start(QR("HOSPITAL NACIONAL DOS DE MAYO", "6206", ` ${story}`));
    await p.tap("incidencia_ubicacion_si");

    const draft = await p.tap("incidencia_anonimo");
    expect(draft.session.state).toBe("incidencia_confirm_borrador");
    expect(textOf(draft.sent[0])).toContain(story);
  });

  it("only the name, written the way a person would: finds the hospital and asks to confirm it", async () => {
    const turn = await person().start("quiero presentar una incidencia en el hospital dos de mayo");

    expect(turn.session.state).toBe("incidencia_confirm_ubicacion");
    expect(textOf(turn.sent[0])).toContain("HOSPITAL NACIONAL DOS DE MAYO");
    expect(turn.session.slots[SlotKey.INCIDENCIA_BORRADOR]).toBeUndefined();
  });

  it("only «hospital»: no list is shown, it asks for the name", async () => {
    const turn = await person().start("quiero presentar una incidencia en el hospital");

    expect(turn.session.state).toBe("incidencia_awaiting_ubicacion");
    expect(turn.sent.every((effect) => effect.kind === "send_text")).toBe(true);
    expect(textOf(turn.sent[0])).toContain("Hay varios establecimientos que se parecen");
  });

  it("a story with no place: the place is asked and the story is kept as a draft", async () => {
    const story = "porque el doctor me atendió mal y además me cobraron sin recibo";
    const turn = await person().start(`quiero presentar una incidencia ${story}`);

    expect(turn.session.state).toBe("incidencia_awaiting_ubicacion");
    expect(textOf(turn.sent[0])).toContain("No encontré ese establecimiento");
    expect(turn.session.slots[SlotKey.INCIDENCIA_BORRADOR]).toBe(story);
  });

  it("failing three times offers to go on without the establecimiento, and yes goes on with none", async () => {
    const p = person();
    await p.start("quiero presentar una incidencia");
    await p.say("xyzzy plugh");
    await p.say("qwerty asdfgh");
    const offer = await p.say("zzzz yyyy");
    expect(offer.session.state).toBe("incidencia_confirm_omitir");

    const identity = await p.tap("incidencia_omitir_si");
    expect(identity.session.state).toBe("incidencia_identity_choice");
    expect(identity.session.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_CODIGO]).toBeUndefined();
  });

  it("from the QR to a saved incidencia: the place goes to the database and the person gets the code", async () => {
    const p = person();
    await p.start(QR("HOSPITAL NACIONAL DOS DE MAYO", "6206"));
    await p.tap("incidencia_ubicacion_si");
    await p.tap("incidencia_anonimo");
    const asked = await p.say("Me cobraron sin recibo en la ventanilla de admisión.");
    expect(asked.session.state).toBe("incidencia_awaiting_foto");

    const done = await p.say("omitir");
    expect(done.session.state).toBe("incidencia_confirmed");
    expect(textOf(done.sent.at(-1))).toMatch(/código MINSA-\d{4}-\d{6,}/);

    const saved = await prisma.incidenciaPaciente.findFirstOrThrow({ where: { waId: p.from }, include: { establecimiento: true } });
    expect(saved.establecimiento?.codigoRenipress).toBe("6206");
    expect(saved.esAnonimo).toBe(true);
    expect(textOf(done.sent.at(-1))).toContain(saved.codigo);
  });

  it("with no establecimiento the incidencia is saved without one and the person is only thanked, with no code", async () => {
    const p = person();
    await p.start("quiero presentar una incidencia");
    await p.say("xyzzy plugh");
    await p.say("qwerty asdfgh");
    await p.say("zzzz yyyy");
    await p.tap("incidencia_omitir_si");
    await p.tap("incidencia_anonimo");
    await p.say("El doctor me atendió mal y no me explicó nada.");
    const done = await p.say("omitir");

    expect(textOf(done.sent.at(-1))).toBe("Gracias por tu reporte de incidencia, ya se registró.");
    const saved = await prisma.incidenciaPaciente.findFirstOrThrow({ where: { waId: p.from } });
    expect(saved.establecimientoId).toBeNull();
  });

  it("with a DNI the name comes from RENIEC (the test DNI) and is saved with the document", async () => {
    const p = person();
    await p.start(QR("HOSPITAL NACIONAL DOS DE MAYO", "6206"));
    await p.tap("incidencia_ubicacion_si");
    await p.tap("incidencia_con_nombre");
    const named = await p.say("12345678");
    expect(named.session.state).toBe("incidencia_awaiting_descripcion");
    expect(named.session.slots[SlotKey.NOMBRE_COMPLETO]).toBe("JUAN CARLOS QUISPE PEREZ");

    await p.say("Me cobraron sin recibo en la ventanilla de admisión.");
    await p.say("omitir");
    const saved = await prisma.incidenciaPaciente.findFirstOrThrow({ where: { waId: p.from } });
    expect(saved).toMatchObject({ esAnonimo: false, dniReclamante: "12345678", nombreReclamante: "JUAN CARLOS QUISPE PEREZ" });
  });

  it("«quiero cerrar» in the middle ends the conversation and saves nothing", async () => {
    const p = person();
    await p.start(QR("HOSPITAL NACIONAL DOS DE MAYO", "6206"));
    await p.tap("incidencia_ubicacion_si");
    await p.tap("incidencia_anonimo");
    const closed = await p.say("quiero cerrar");

    expect(closed.session.state).toBe("incidencia_cancelled");
    expect(textOf(closed.sent[0])).toContain("no se registró ninguna incidencia");
    expect(await prisma.incidenciaPaciente.count({ where: { waId: p.from } })).toBe(0);

    const again = await p.say("hola");
    expect(again.session.state).toBe("main_menu");
  });

  it("a relato shorter than 20 characters is asked to be longer and nothing is saved", async () => {
    const p = person();
    await p.start("quiero presentar una incidencia");
    await p.say("omitir");
    await p.tap("incidencia_omitir_si");
    await p.tap("incidencia_anonimo");
    const short = await p.say("me cobraron");

    expect(short.session.state).toBe("incidencia_awaiting_descripcion");
    expect(textOf(short.sent[0])).toContain("al menos 20 caracteres");
    expect(await prisma.incidenciaPaciente.count({ where: { waId: p.from } })).toBe(0);
  });

  it("the daily maximum: the sixth incidencia of the same phone is refused, the first five were saved", async () => {
    const p = person();
    const registrar = async () => {
      await p.start("quiero presentar una incidencia");
      await p.say("omitir");
      await p.tap("incidencia_omitir_si");
      await p.tap("incidencia_anonimo");
      await p.say("Me cobraron sin recibo en la ventanilla de admisión.");
      return p.say("omitir");
    };

    for (let i = 1; i <= 5; i++) {
      const done = await registrar();
      expect(done.session.state, `incidencia ${i}`).toBe("incidencia_confirmed");
      await p.say("hola");
    }
    const sixth = await registrar();

    expect(sixth.session.state).toBe("incidencia_failed");
    expect(textOf(sixth.sent.at(-1))).toContain("Podrás registrar otra mañana");
    expect(await prisma.incidenciaPaciente.count({ where: { waId: p.from } })).toBe(5);
  });

  it("the menu option asks for the place and a typed code finds it", async () => {
    const p = person();
    const asked = await p.start("2");
    expect(asked.session.state).toBe("incidencia_awaiting_ubicacion");

    const confirm = await p.say("5946");
    expect(confirm.session.state).toBe("incidencia_confirm_ubicacion");
    expect(textOf(confirm.sent[0])).toContain("Hipólito Unanue");
  });
});
