import { describe, expect, it } from "vitest";
import {
  checkFirstMessagePayload,
  FIRST_MESSAGE_REJECTION_TEXT,
  MEDIA_WITHOUT_SESSION_TEXT,
} from "@/lib/security/payload-filter";

const text = (body: string) => checkFirstMessagePayload({ type: "text", text: body });

describe("length: a first message over 300 characters is rejected", () => {
  it("accepts exactly 300 and rejects 301", () => {
    expect(text("hola ".repeat(60)).kind).toBe("ok");
    expect(text("hola ".repeat(60) + "a")).toMatchObject({ kind: "rejected", reason: "too_long", reply: FIRST_MESSAGE_REJECTION_TEXT });
    expect(text("a".repeat(301))).toMatchObject({ kind: "rejected", reason: "too_long" });
  });

  it("counts characters, not bytes (accents and emoji)", () => {
    expect(text("ñu".repeat(150)).kind).toBe("ok");
    expect(text("éu".repeat(151))).toMatchObject({ kind: "rejected", reason: "too_long" });
  });

  it("a long paste of spam is rejected", () => {
    expect(text("GANA DINERO FACIL ".repeat(30)).kind).toBe("rejected");
  });
});

describe("links: URLs, WhatsApp links and domains are rejected", () => {
  it.each([
    "http://spam.example.org/oferta",
    "https://bit.ly/3abc",
    "mira www.ofertas.net",
    "escríbeme a wa.me/51999999999",
    "https://wa.me/51999999999?text=hola",
    "unete t.me/canal",
    "visita ofertas.com hoy",
    "entra a mipagina.pe",
    "consulta en citas.gob.pe",
    "HTTP://MAYUSCULAS.COM",
    "solo el dominio: banco-falso.com",
    "bit.ly/xyz",
  ])("rejects %s", (body) => {
    expect(text(body)).toMatchObject({ kind: "rejected", reason: "link", reply: FIRST_MESSAGE_REJECTION_TEXT });
  });

  it.each([
    "Hola, quiero una cita",
    "vivo en Lima.Peru",
    "Gracias.Pedro me ayudó",
    "son las 8.45 am",
    "mi DNI es 45781239.",
    "necesito una cita, ok.",
    "Comuna 3.5 km de aquí",
    "quiero cita en San Juan de Lurigancho.",
    "pe",
    "compré .comida",
  ])("does not reject the ordinary message %s", (body) => {
    expect(text(body).kind).toBe("ok");
  });
});

describe("repetition: spam made of one character or a pile of emojis", () => {
  it.each([
    ["ten of the same letter", "a".repeat(10)],
    ["48 of the same letter", "a".repeat(48)],
    ["a repeated symbol", "!".repeat(12)],
    ["a repeated digit", "0".repeat(11)],
    ["repetition inside a sentence", "quiero " + "a".repeat(15) + " cita"],
    ["the fire and money emojis", "🔥🔥🔥💰💰💰"],
    ["ten of the same emoji", "😀".repeat(10)],
    ["emojis with spaces between them", "🔥 🔥 🔥 💰 💰 💰"],
    ["hearts with their variation selector", "❤️❤️❤️❤️❤️❤️"],
  ])("rejects %s", (_name, body) => {
    expect(text(body)).toMatchObject({ kind: "rejected", reason: "repeat", reply: FIRST_MESSAGE_REJECTION_TEXT });
  });

  it.each([
    ["nine of the same letter (the limit is ten)", "a".repeat(9)],
    ["a stretched greeting", "holaaaa"],
    ["laughter", "jajajajajajajaja"],
    ["a single emoji", "👍"],
    ["three emojis", "😀😀😀"],
    ["five emojis", "🔥🔥🔥💰💰"],
    ["emojis next to real words", "quiero una cita 😀😀😀😀😀😀😀"],
    ["a DNI", "12345678"],
    ["a plain request", "Hola, quiero una cita de odontología"],
    ["an ellipsis", "bueno..."],
  ])("does not reject %s", (_name, body) => {
    expect(text(body).kind).toBe("ok");
  });
});

describe("media without a session", () => {
  it.each(["image", "sticker", "audio", "video", "document"])("a %s as the first message gets the text-only reminder", (type) => {
    expect(checkFirstMessagePayload({ type })).toMatchObject({ kind: "rejected", reason: "media", reply: MEDIA_WITHOUT_SESSION_TEXT });
  });

  it("interactive replies and locations are not media", () => {
    expect(checkFirstMessagePayload({ type: "interactive" }).kind).toBe("ok");
    expect(checkFirstMessagePayload({ type: "location" }).kind).toBe("ok");
    expect(checkFirstMessagePayload({ type: "text", text: "hola" }).kind).toBe("ok");
  });

  it("an image caption is not screened (media is rejected as media, before any caption)", () => {
    expect(checkFirstMessagePayload({ type: "image", text: "https://spam.com" })).toMatchObject({ reason: "media" });
  });
});

describe("fixed texts", () => {
  it("are institutional, in Spanish, plain text, and short enough to read at a glance", () => {
    for (const reply of [FIRST_MESSAGE_REJECTION_TEXT, MEDIA_WITHOUT_SESSION_TEXT]) {
      expect(reply).toContain("MINSA");
      expect(reply.length).toBeLessThan(300);
    }
  });

  it("media without a session: asks for a text message with HOLA or a menu option", () => {
    expect(MEDIA_WITHOUT_SESSION_TEXT).toBe(
      "Hola. Para iniciar su atención con el asistente del MINSA, por favor escriba un mensaje de texto con la palabra HOLA o seleccione una opción del menú.",
    );
  });

  it("a first message that is too long, has links or is spam: says what the channel attends and offers [1] / [2]", () => {
    expect(FIRST_MESSAGE_REJECTION_TEXT).toBe(
      "Mensaje no reconocido. El asistente del MINSA solo atiende solicitudes de citas médicas y registro de reclamos. Por favor elija una opción: [1] Citas [2] Reclamos.",
    );
  });
});
