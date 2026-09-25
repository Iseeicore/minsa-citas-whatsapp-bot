import { normalizeText } from "@/lib/fsm/parsing/text";
import type { OosCategory } from "./out-of-scope-messages";

export { OOS_MESSAGES, type OosCategory } from "./out-of-scope-messages";

// Consultations the channel does not attend (emergencies, SIS, referrals, lab
// results, medicines, vaccines, tele-orientation, the status of a complaint
// already filed, paperwork). Each one gets a fixed message that points to the
// official channel — read by keywords in memory: no AI call, no database.
//
// The categories and their messages are the ones of the audit spreadsheet (sheet
// "Catálogo de Intenciones OutofSc"). The spreadsheet has Gemini classify them;
// this is the deterministic first line, so a life-safety message never depends on
// a model call. Gemini as a fallback for what no rule reads stays out for now.
//
// Runs at menu level only (main menu, first contact, first message after a
// finished flow). It is never applied inside a flow: a DNI, an OTP, a district or
// the description of a complaint is read by that step, whatever words it holds.

// Patterns run on normalized text: uppercase, no accents, punctuation as spaces.
const RULES: ReadonlyArray<readonly [OosCategory, readonly RegExp[]]> = [
  [
    "OOS-01",
    [
      /\bNO (?:PUEDE|PUEDO|PUEDEN|PUEDES) RESPIRAR\b/,
      /\bNO RESPIRA(?:N)?\b/,
      /\bSIN RESPIRAR\b/,
      /\b(?:DEJO|DEJA|DEJAR) DE RESPIRAR\b/,
      /\bNO ESTA RESPIRANDO\b/,
      /\bFALTA(?:N)? (?:EL )?AIRE\b/,
      /\bSE (?:ESTA )?AHOGA(?:NDO)?\b/,
      /\bFALTA DE AIRE\b/,
      /\bDIFICULTAD PARA RESPIRAR\b/,
      /\bDUELE (?:MUCHO |FUERTE )?(?:EL |MI )?PECHO\b/,
      /\bDOLOR (?:FUERTE |INTENSO )?(?:EN|DE) (?:EL |MI )?PECHO\b/,
      /\bAMBULANCIA\b/,
      /\bSANGRA(?:N|NDO)?\b/,
      /\bHEMORRAGIA\b/,
      /\bINCONSCIENTE\b/,
      /\bSE DESMAY(?:O|A|ARON)\b/,
      /\bNO REACCIONA\b/,
      /\bCONVULSION(?:ES)?\b/,
      /\bINFARTO\b/,
      /\bASFIXI\w*/,
      // "me muero" is an emergency ("me muero de dolor") unless it is the idiom
      // ("me muero de risa / de ganas / por una cita").
      /\bME MUERO\b(?! (?:DE (?:RISA|GANAS|HAMBRE|SUENO|VERGUENZA|MIEDO|CALOR|FRIO|SED|ENVIDIA|CURIOSIDAD|PENA|ABURRIMIENTO|CANSANCIO)|POR)\b)/,
      /\bME ESTOY MURIENDO\b/,
      /\bSE (?:ESTA )?MURIENDO\b|\bSE MUERE\b/,
      /\bENVENEN\w*/,
      /\bSOBREDOSIS\b/,
      /\bATRAGANT\w*/,
      /\bES UNA EMERGENCIA\b/,
      /\bEMERGENCIA (?:MEDICA|VITAL)\b/,
      /\bURGENCIA MEDICA\b/,
    ],
  ],
  [
    // A complaint ALREADY filed: asking how it is going is not filing a new one.
    "OOS-08",
    [
      /\b(?:PUSE|PUSIMOS|PRESENTE|REGISTRE|HICE|INTERPUSE|ENVIE|DEJE)\b.{0,25}\b(?:RECLAMO|QUEJA)\b/,
      /\bMI (?:RECLAMO|QUEJA)\b.{0,60}\b(?:SIGUE|SIGUEN|CUANDO|RESPUESTA|RESPONDEN|RESPONDIERON|RESUELTO|RESUELTA|RESOLVER|ESTADO|PASO|SEGUIMIENTO|PLAZO)\b/,
      /\bESTADO DE (?:MI|EL|LA) (?:RECLAMO|QUEJA)\b/,
      /\bSEGUIMIENTO (?:DE|A) (?:MI|UN|UNA|EL|LA) (?:RECLAMO|QUEJA)\b/,
      /\bQUE PASO CON (?:MI|EL|LA) (?:RECLAMO|QUEJA)\b/,
      /\bRECLAMO N\b/,
    ],
  ],
  ["OOS-06", [/\bVACUN\w*/, /\bINFLUENZA\b/, /\bTETANOS\b/]],
  [
    "OOS-04",
    [
      /\bANALISIS\b/,
      /\bLABORATORIOS?\b/,
      /\bRESULTADOS?\b/,
      /\bRADIOGRAFIAS?\b/,
      /\bTOMOGRAFIAS?\b/,
      /\bBIOPSIAS?\b/,
      /\bECOGRAFIAS?\b/,
      /\bRESONANCIAS?\b/,
      /\bEXAMENES? DE (?:SANGRE|ORINA|HECES)\b/,
    ],
  ],
  [
    "OOS-05",
    [
      /\bPARACETAMOL\b/,
      /\bINSULINA\b/,
      /\bMEDICAMENTOS?\b/,
      /\bFARMACIAS?\b/,
      /\bPASTILLAS?\b/,
      /\bJARABES?\b/,
      /\bRECETAS?\b/,
      /\bMEDICINAS\b/,
      // "la medicina para la presión", but never the specialty "cita de medicina general".
      /\b(?:LA|MI|SU|UNA|DE LA) MEDICINA (?:PARA|DE)\b/,
    ],
  ],
  [
    "OOS-02",
    [
      /\bSIS\b/,
      /\bSEGURO INTEGRAL\b/,
      /\bAFILI\w*/,
      /\bMI SEGURO\b.{0,40}\b(?:ACTIVO|CANCELADO|VIGENTE|VENCIDO|SUSPENDIDO)\b/,
    ],
  ],
  [
    "OOS-03",
    [
      // "punto de referencia" is how a citizen gives an address, not a medical referral.
      /\b(?<!PUNTO DE )REFERENCIAS?\b/,
      /\bCONTRARREFERENCIAS?\b/,
      /\bREFCON\b/,
    ],
  ],
  [
    "OOS-09",
    [
      /\bDESCANSOS? MEDICOS?\b/,
      /\bCERTIFICADOS?\b/,
      /\bDISCAPACIDAD\b/,
      /\bSISFOH\b/,
      /\bCANJE\b/,
      /\bSELL(?:EN|AR|O|OS)\b/,
    ],
  ],
  [
    "OOS-07",
    [
      /\bQUE (?:TOMO|LE DOY|PUEDO TOMAR|LE PUEDO DAR)\b/,
      /\bQUE DOSIS\b/,
      /\bGRANITOS\b/,
      /\bHABLAR CON (?:UN|UNA|EL|LA) (?:DOCTOR|DOCTORA|MEDICO|MEDICA|ENFERMERO|ENFERMERA|OBSTETRA)\b/,
      /\bTELE(?:CONSULTA|ORIENTACION|ATENCION|MEDICINA)\b/,
    ],
  ],
];

const toPlainWords = (text: string): string =>
  normalizeText(text)
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// The first category (most serious first) whose keywords appear, if any.
export function detectOutOfScope(text: string): OosCategory | undefined {
  const plain = toPlainWords(text);
  if (!plain) return undefined;

  for (const [category, patterns] of RULES) {
    if (patterns.some((pattern) => pattern.test(plain))) return category;
  }
  return undefined;
}

// A medical emergency is the one category that is answered before anything else,
// even before the lexical guard: a scared citizen who insults still gets the number.
export const isEmergency = (text: string): boolean => detectOutOfScope(text) === "OOS-01";

// Inside a flow the same reading applies, but only to a SHORT text: an emergency is
// typed in a few words, while a complaint about a past event ("la ambulancia nunca
// llegó...") is a narrative and is evidence for that step, not an alarm.
export const IN_FLOW_MAX_CHARS = 120;
export const isEmergencyInFlow = (text: string): boolean => text.length <= IN_FLOW_MAX_CHARS && isEmergency(text);

// The words the messages ask the citizen to type. Exact single words only:
// "quiero una cita" (with no hints) keeps going to the AI as before.
const single = (text: string): string | undefined => {
  const words = toPlainWords(text).split(" ");
  return words.length === 1 ? words[0] : undefined;
};

export const isCitaKeyword = (text: string): boolean => {
  const word = single(text);
  return word === "CITA" || word === "CITAS";
};

export const isContinueKeyword = (text: string): boolean => single(text) === "CONTINUAR";
