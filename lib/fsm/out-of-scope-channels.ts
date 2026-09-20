// The phone numbers, short lines and web addresses that the out-of-scope messages
// send the citizen to. They come from the audit spreadsheet ("Matriz de
// Derivación") and have NOT been confirmed with each institution yet.
//
// They live here, and only here, so checking one and changing it never means
// editing a paragraph of a message: change the value below and every text that
// mentions it follows. lib/fsm/out-of-scope-channels.test.ts fails if a message
// hardcodes a contact instead, or if a value is missing from the checklist in
// docs/out-of-scope-channels.md (where each one is marked once it is verified).
export const CHANNELS = {
  // Emergencies (OOS-01 and the notice shown inside a flow).
  samu: "106",
  bomberos: "116",

  // SIS (OOS-02).
  sisWeb: "app.sis.gob.pe/ConsultaWeb",
  sisApp: "Asegúrate e Infórmate",
  sisWhatsapp: "941 988 565",
  sisLineOption: "Opción 4",

  // The 113 line: Infosalud (OOS-07), vaccination points (OOS-06), SIS (OOS-02)
  // and SUSALUD (OOS-08) are options of it.
  linea113: "113",
  vaccinationLineOption: "Opción 1",
  susaludOption: "Opción 7",

  // Medicines (OOS-05) and vaccination card (OOS-06).
  digemid: "observatorio.digemid.minsa.gob.pe",
  carnetVacunacion: "carnetvacunacion.minsa.gob.pe",
} as const;
