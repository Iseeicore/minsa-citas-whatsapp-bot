import { describe, expect, it } from "vitest";
import { detectOutOfScope, isEmergency, isCitaKeyword, isContinueKeyword } from "./out-of-scope";
import { OOS_MESSAGES, type OosCategory } from "./out-of-scope-messages";

// The examples are the ones the audit spreadsheet lists for each category
// (sheet "Catálogo de Intenciones OutofSc"), plus a few more phrasings.
const EXAMPLES: Array<[OosCategory, string[]]> = [
  ["OOS-01", [
    "Mi mamá no puede respirar", "Me duele el pecho fuerte", "Mi hijo se cayó y sangra la cabeza", "Necesito una ambulancia urgente",
    "mi papa esta inconsciente", "se desmayó y no reacciona", "creo que es un infarto", "mi hija tiene convulsiones", "es una emergencia médica",
    "dolor de pecho", "se está asfixiando", "mi bebé se asfixia", "me muero", "me estoy muriendo",
    "mi hijo sigue sin respirar", "dejó de respirar", "no está respirando", "me falta el aire",
  ]],
  ["OOS-02", [
    "¿Mi SIS está activo?", "¿Cómo me afilio al SIS?", "Fui a atenderme y me dijeron que mi seguro está cancelado",
    "quiero afiliarme al seguro integral de salud", "mi SIS no aparece",
  ]],
  ["OOS-03", [
    "Tengo mi hoja de referencia de mi posta para el Hospital Loayza", "¿Ya aceptaron mi referencia?",
    "Quiero cita con especialista pero me piden hoja de referencia", "¿qué es la contrarreferencia?", "estado de mi REFCON",
  ]],
  ["OOS-04", [
    "¿Ya salieron mis análisis de sangre?", "Quiero recoger mi radiografía/tomografía", "Mándenme los resultados de mi biopsia por acá",
    "necesito mi ecografía", "¿dónde queda el laboratorio?",
  ]],
  ["OOS-05", [
    "¿Tienen Paracetamol o Insulina en la posta?", "¿Llegó la medicina para la presión?", "Fui a la farmacia y no había mi receta",
    "no me dieron mis medicamentos", "¿hay pastillas para la gastritis?",
  ]],
  ["OOS-06", [
    "¿Qué días vacunan contra la influenza?", "¿Dónde consigo mi carnet de vacunación?", "¿Tienen vacunas para el tétanos para mi bebé?",
    "quiero una cita para vacunarme", "me falta la segunda dosis de la vacuna",
  ]],
  ["OOS-07", [
    "Doctor, me salieron unos granitos rojos, ¿qué tomo?", "¿Qué dosis le doy a mi hija de 5 años si tiene fiebre?", "Quiero hablar con un doctor ahorita",
    "¿hacen teleconsulta?", "quiero hablar con una enfermera",
  ]],
  ["OOS-08", [
    "Ya puse un reclamo la semana pasada, ¿cuándo me responden?", "Mi reclamo N° 458-2026 sigue sin resolverse", "Quiero saber qué pasó con mi queja contra el doctor",
    "¿cuál es el estado de mi reclamo?", "hice una queja hace un mes y nadie responde",
  ]],
  ["OOS-09", [
    "Necesito que me sellen mi descanso médico para mi trabajo", "¿Cómo saco el Certificado Médico de Discapacidad?",
    "¿Dónde actualizo mi SISFOH para la clasificación socioeconómica?", "necesito un certificado", "¿me hacen el canje de mi descanso?",
  ]],
];

describe("detectOutOfScope: every example of the spreadsheet lands in its category", () => {
  for (const [category, examples] of EXAMPLES) {
    it.each(examples)(`${category}: %j`, (text) => {
      expect(detectOutOfScope(text)).toBe(category);
    });
  }
});

describe("detectOutOfScope: what is NOT out of scope stays with the flows", () => {
  it.each([
    "hola",
    "buenos días",
    "1",
    "2",
    "12345678",
    "quiero una cita",
    "quiero una cita de odontología en Miraflores",
    "Quiero una cita en San Juan de Lurigancho para poder atenderme en medicina general",
    "necesito una cita de medicina interna",
    "quiero cita en medicina familiar",
    "quiero cita en pediatría para mi hijo",
    "tengo fiebre y quiero una cita",
    "quiero hacer un reclamo",
    "quiero poner una queja por la mala atención",
    "el doctor me atendió mal en el hospital",
    "vivo cerca del parque, punto de referencia el mercado",
    "San Juan de Lurigancho",
    "gracias",
    "me muero de risa",
    "me muero de ganas de que me atiendan",
    "me muero de hambre",
    "me muero por una cita",
    "",
    "   ",
  ])("%j", (text) => {
    expect(detectOutOfScope(text)).toBeUndefined();
  });
});

describe("precedence: when several match, the most serious wins", () => {
  it("an emergency beats everything else in the same message", () => {
    expect(detectOutOfScope("mi mamá no puede respirar y ya puse un reclamo que nadie responde")).toBe("OOS-01");
    expect(detectOutOfScope("necesito una ambulancia, no hay vacunas ni medicamentos")).toBe("OOS-01");
  });

  it("the status of a complaint already filed is not a new complaint", () => {
    expect(detectOutOfScope("mi reclamo sigue sin resolverse por la farmacia")).toBe("OOS-08");
  });

  it("a vaccine certificate is about vaccination, not a generic certificate", () => {
    expect(detectOutOfScope("¿dónde saco mi certificado de vacunación?")).toBe("OOS-06");
  });
});

describe("isEmergency", () => {
  it("is true only for the emergency category", () => {
    expect(isEmergency("mi hijo no respira")).toBe(true);
    expect(isEmergency("¿Mi SIS está activo?")).toBe(false);
    expect(isEmergency("quiero una cita")).toBe(false);
    expect(isEmergency("")).toBe(false);
  });
});

describe("the words the messages ask the citizen to type", () => {
  it.each(["CITAS", "citas", "Cita", " CITAS ", "¡Citas!"])("%j is a request for the Cita flow", (text) => {
    expect(isCitaKeyword(text)).toBe(true);
  });

  it.each(["quiero una cita", "citas médicas", "cita de odontología", "hola", "", "2 citas"])("%j is not", (text) => {
    expect(isCitaKeyword(text)).toBe(false);
  });

  it.each(["CONTINUAR", "continuar", "Continuar.", " continuar "])("%j is the way back to the menu", (text) => {
    expect(isContinueKeyword(text)).toBe(true);
  });

  it.each(["no quiero continuar", "continuar con mi cita", "hola", ""])("%j is not", (text) => {
    expect(isContinueKeyword(text)).toBe(false);
  });
});

describe("the messages (spreadsheet texts) and their derivation channels", () => {
  const CHANNELS: Array<[OosCategory, string[]]> = [
    ["OOS-01", ["SAMU: 106", "Bomberos: 116"]],
    ["OOS-02", ["app.sis.gob.pe/ConsultaWeb", "941 988 565", "Línea 113"]],
    ["OOS-03", ["REFCON", "Hoja de Referencia", "Admisión/Referencias"]],
    ["OOS-04", ["Ley N° 26842", "de forma presencial"]],
    ["OOS-05", ["observatorio.digemid.minsa.gob.pe", "RECLAMO"]],
    ["OOS-06", ["carnetvacunacion.minsa.gob.pe", "Línea 113 (Opción 1)"]],
    ["OOS-07", ["Infosalud", "Línea 113"]],
    ["OOS-08", ["SUSALUD", "113 (Opción 7)", "PAUS", "30 días hábiles"]],
    ["OOS-09", ["Personal/Admisión", "ULE", "SISFOH"]],
  ];

  it("there is one message per category", () => {
    expect(Object.keys(OOS_MESSAGES).sort()).toEqual(EXAMPLES.map(([category]) => category).sort());
  });

  it.each(CHANNELS)("%s names its channel", (category, tokens) => {
    for (const token of tokens) expect(OOS_MESSAGES[category]).toContain(token);
  });

  it("each one tells the citizen how to go on, with a word the bot understands", () => {
    // The emergency ends the conversation: it does not invite the citizen to go on.
    expect(OOS_MESSAGES["OOS-01"]).not.toMatch(/CONTINUAR|CITAS|RECLAMO/);
    // Vaccination needs no appointment (OOS-06), so its message points to the 113 line instead.
    for (const category of ["OOS-02", "OOS-03", "OOS-04", "OOS-07", "OOS-09"] as const) expect(OOS_MESSAGES[category]).toContain("CITAS");
    for (const category of ["OOS-05", "OOS-08"] as const) expect(OOS_MESSAGES[category]).toContain("RECLAMO");
  });

  it("all fit in a WhatsApp text and keep the spreadsheet's wording (no triple line breaks)", () => {
    for (const message of Object.values(OOS_MESSAGES)) {
      expect(message.length).toBeLessThan(1024);
      expect(message).not.toMatch(/\n{3,}/);
    }
  });

  it("the emergency message is the one prescribed", () => {
    expect(OOS_MESSAGES["OOS-01"]).toBe(
      "⚠️ ESTE CANAL NO ATIENDE EMERGENCIAS MÉDICAS\n\nSi usted o su familiar presentan una emergencia con riesgo vital, llame de inmediato (llamadas gratuitas):\n\n- SAMU: 106 (ambulancias y emergencias médicas)\n- Bomberos: 116 (rescate y urgencias)\n\nAcuda ahora mismo al establecimiento de salud más cercano.",
    );
  });
});
