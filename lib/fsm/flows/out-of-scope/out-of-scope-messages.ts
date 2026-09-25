// Reply texts for the consultations the channel does not attend, as the audit
// spreadsheet prescribes them (sheet "Catálogo de Intenciones OutofSc", column
// "Mensaje de Respuesta Sugerida del Bot"). The wording is the spreadsheet's; only
// the extra line breaks were collapsed.

import { CHANNELS } from "./out-of-scope-channels";

export type OosCategory =
  | "OOS-01"
  | "OOS-02"
  | "OOS-03"
  | "OOS-04"
  | "OOS-05"
  | "OOS-06"
  | "OOS-07"
  | "OOS-08"
  | "OOS-09";

export const OOS_MESSAGES: Record<OosCategory, string> = {
  "OOS-01": `⚠️ ESTE CANAL NO ATIENDE EMERGENCIAS MÉDICAS

Si usted o su familiar presentan una emergencia con riesgo vital, llame de inmediato (llamadas gratuitas):

- SAMU: ${CHANNELS.samu} (ambulancias y emergencias médicas)
- Bomberos: ${CHANNELS.bomberos} (rescate y urgencias)

Acuda ahora mismo al establecimiento de salud más cercano.`,
  "OOS-02": `Consulta sobre SIS (Seguro Integral de Salud):\n\nPor este canal no gestionamos afiliaciones ni validaciones de seguro.\n\nPuede verificar si su SIS está activo ingresando a: ${CHANNELS.sisWeb} o desde la app móvil ${CHANNELS.sisApp}.\n\nConsultas directas al SIS por WhatsApp: ${CHANNELS.sisWhatsapp} o llamando gratis a la Línea ${CHANNELS.linea113} (${CHANNELS.sisLineOption}).\n\nSi ya cuenta con seguro activo y desea agendar una cita médica, escriba CITAS.`,
  "OOS-03": "Gestión de Referencias Médicas:\n\nLas citas para especialidades en hospitales e institutos requieren que su centro de origen haya emitido y tramitado la Hoja de Referencia (REFCON).\n\nDebe consultar el estado de su referencia directamente en la oficina de Admisión/Referencias de su posta o centro de salud de origen.\n\nSi desea solicitar una cita en su establecimiento asignado de primer nivel, escriba CITAS.",
  "OOS-04": "Entrega de Resultados Médicos:\n\nPor motivos de confidencialidad y reserva de la historia clínica (Ley N° 26842), los resultados de análisis, ecografías o placas se entregan únicamente de forma presencial en el área de Laboratorio o Diagnóstico por Imágenes del centro donde se atendió.\n\nSi requiere una cita médica para lectura de resultados con su médico, escriba CITAS.",
  "OOS-05": `Consulta de Medicamentos:\n\nEste canal no cuenta con inventario en tiempo real de las farmacias institucionales.\n\nPuede consultar la disponibilidad y precios de medicamentos en establecimientos públicos y privados a través del Observatorio de Productos Farmacéuticos de DIGEMID: ${CHANNELS.digemid}\n\n(Si no le entregaron sus medicamentos completos durante su atención y desea presentar una queja formal, escriba RECLAMO).`,
  "OOS-06": `Vacunación y Carnets Oficiales:\n\nLa atención de vacunación en el primer nivel es por orden de llegada y no requiere cita previa.\n\nPara consultar su historial o descargar su carnet digital de vacunación, ingrese a: ${CHANNELS.carnetVacunacion}\n\nPara ubicar puntos de vacunación cercanos, comuníquese gratuitamente a la Línea ${CHANNELS.linea113} (${CHANNELS.vaccinationLineOption}).`,
  "OOS-07": `Orientación Médica Telefónica Gratuita:\n\nEste asistente virtual solo gestiona la reserva de turnos presenciales y no brinda diagnósticos ni prescripciones médicas.\n\nPara recibir orientación inmediata de un médico, enfermero u obstetra, llame gratis a Infosalud: Línea ${CHANNELS.linea113}.\n\nSi desea programar una consulta presencial con un profesional de la salud, escriba CITAS.`,
  "OOS-08": `Seguimiento de Reclamos:\n\nEste asistente registra nuevos reclamos para su ingreso formal al Libro de Reclamaciones.\n\nDe acuerdo a la normativa de SUSALUD, el establecimiento tiene un plazo de hasta 30 días hábiles para emitir respuesta formal al correo o teléfono consignado.\n\nSi venció el plazo o requiere consultar el estado de su caso, puede acudir a la Plataforma de Atención al Usuario (PAUS) de su centro de salud o comunicarse con SUSALUD al ${CHANNELS.linea113} (${CHANNELS.susaludOption}).\n\nPara registrar un nuevo reclamo, escriba RECLAMO.`,
  "OOS-09": "Trámites Documentarios y Certificados:\n\nEstos trámites son presenciales y están a cargo de las áreas administrativas del establecimiento:\n\n- Descansos médicos / Canjes: Acérquese al área de Personal/Admisión con su receta y certificado original emitido por el médico tratante.\n\n- Certificados de discapacidad: Requieren evaluación presencial por un médico certificador autorizado.\n\n- SISFOH: Trámite exclusivo de la Unidad Local de Empadronamiento (ULE) de su municipalidad distrital.\n\nSi necesita una consulta médica previa, escriba CITAS.",
};
